/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

require('dotenv').config();
const { Core, Events } = require('@adobe/aio-sdk');
const fs = require('fs');
const keyValues = require('../lib/key-values');
const { replaceEnvVar } = require('../lib/env');
const { resolveCredentials } = require('../lib/adobe-auth');
const uuid = require('uuid');

const logger = Core.Logger('events-config', { level: process.env.LOG_LEVEL || 'info' });

const extensibilityConfigPath = `${process.env.INIT_CWD}/extensibility.config.js`;
const envPath = `${process.env.INIT_CWD}/.env`;

/**
 * Resolve the arguments from current config and environment variables
 * and ensure the event providers and metadata are in sync with the given spec.
 * It also updates the environment variable AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING according to the latest
 * provider metadata.
 * @returns {Promise<void>}
 */
async function main() {
  if (!fs.existsSync(extensibilityConfigPath)) {
    logger.warn(
      `Extensibility config file not found at ${extensibilityConfigPath}, event providers reconciliation will be skipped`
    );
    return;
  }
  const { eventProviders } = require(extensibilityConfigPath);

  const {
    org: { id: organizationId },
    id: projectId,
    workspace: { id: workspaceId },
  } = Core.Config.get('project');
  if (!organizationId) {
    logger.warn(`Cannot find project.org.id in the config, event providers reconciliation will be skipped`);
    return;
  }
  if (!projectId) {
    logger.warn(`Cannot find project.id in the config, event providers reconciliation will be skipped`);
    return;
  }
  if (!workspaceId) {
    logger.warn(`Cannot find project.workspace.id in the config, event providers reconciliation will be skipped`);
    return;
  }

  const clientId = process.env.SERVICE_API_KEY;
  if (!clientId) {
    logger.warn(
      'SERVICE_API_KEY environment variable not found. Event provider reconciliation will be skipped. ' +
        'Please run "aio app use" to configure the project.'
    );
    return;
  }

  const { imsOrgId, apiKey, accessToken } = await resolveCredentials(process.env);

  logger.info(`Event providers label will be suffixed with "<label> - ${process.env.AIO_runtime_namespace}"`);
  const modifiedEventProvidersSpec = {
    event_providers: eventProviders?.map((provider) => ({
      ...provider,
      label: `${provider.label} - ${process.env.AIO_runtime_namespace}`,
      subscription: provider.subscription?.map(sub => ({
        ...sub,
        event: {
          ...sub.event,
          fields: transformFields(sub.event.fields)
        }
      }))
    })),
  };

  const eventsConfig = await configureEvents(
    { organizationId, projectId, workspaceId },
    { imsOrgId, apiKey, accessToken },
    modifiedEventProvidersSpec
  );

  logger.info(`Event providers and metadata from ${extensibilityConfigPath} are in sync with the given spec.`);
  if (eventsConfig.length === 0) {
    return;
  }

  const envProviderMapping = process.env.AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING;
  const updatedProviderMapping = keyValues.encode({
    ...keyValues.decode(envProviderMapping),
    // eslint-disable-next-line camelcase
    ...eventsConfig.reduce((acc, { provider: { provider_metadata, id } }) => {
      // eslint-disable-next-line camelcase
      acc[provider_metadata] = id;
      return acc;
    }, {}),
  });
  if (envProviderMapping === updatedProviderMapping) {
    logger.info(
      `Event provider mapping AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING in file ${envPath} is already up to date.`
    );
  } else {
    replaceEnvVar(envPath, 'AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING', updatedProviderMapping);
    logger.info(`Updated event provider mapping AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING in file ${envPath}`);
  }
}

/**
 * Transform subscription event fields to API format
 * @param {string|Array<string>} fields - Fields configuration
 * @returns {Array<object>} API-compatible fields format
 */
const transformFields = fields =>
  Array.isArray(fields)
    ? fields.map(field => ({ name: field }))
    : [{ name: fields }];

/**
 *
 * @param {object} project contains the AIO project props
 * @param {string} project.organizationId organization id
 * @param {string} project.projectId project id
 * @param {string} project.workspaceId workspace id
 * @param {object} credentials contains the IMS credentials
 * @param {string} credentials.apiKey the service api key
 * @param {string} credentials.imsOrgId organization id
 * @param {string} credentials.accessToken access token
 * @param {object} eventsSpec the events spec
 * @returns {Promise<[{provider: object, eventsMetadata:[]}]>} the list of event providers and their metadata
 */
async function configureEvents(
  { organizationId, projectId, workspaceId },
  { apiKey, imsOrgId, accessToken },
  eventsSpec
) {
  const eventProvidersSpec = eventsSpec?.event_providers ?? [];
  if (eventProvidersSpec.length === 0) {
    logger.warn(`Event providers spec is empty.`);
    return [];
  }

  const eventsApi = await Events.init(imsOrgId, apiKey, accessToken);

  const {
    _embedded: { providers },
  } = await eventsApi.getAllProviders(organizationId);

  return await Promise.all(
    eventProvidersSpec.map(async (providerSpec) => {
      const provider = await ensureEventProvider(providerSpec);
      logger.info(`Configured event provider '${provider.label}' (${provider.id}).`);

      const eventsMetadataSpec = providerSpec.events_metadata ?? [];
      if (eventsMetadataSpec.length === 0) {
        return { provider, eventsMetadata: [] };
      }

      const {
        _embedded: { eventmetadata },
      } = await eventsApi.getAllEventMetadataForProvider(provider.id);
      const eventsMetadata = await Promise.all(
        eventsMetadataSpec.map(async (eventMetadataSpec) => {
          const eventMetadata = await ensureEventMetadata(provider, eventmetadata, eventMetadataSpec);
          logger.info(
            `Configured event metadata '${eventMetadata.label}' (${eventMetadata.event_code}) in provider '${provider.label}' (${provider.id}).`
          );
          return eventMetadata;
        })
      );
      return { provider, eventsMetadata };
    })
  );

  /**
   * Ensure the event provider is in sync with the given spec
   *
   * @param {object} spec the event provider spec
   * @returns {Promise<object>} the event provider
   */
  async function ensureEventProvider(spec) {
    const existing = providers.find(({ label }) => label === spec.label);
    if (existing) {
      if (existing.description === spec.description && existing.docs_url === spec.docs_url) {
        logger.debug('Found event provider', existing);
        return existing;
      }

      const updated = await eventsApi.updateProvider(organizationId, projectId, workspaceId, existing.id, spec);
      logger.debug('Updated event provider', updated);
      return updated;
    }

    if (spec.provider_metadata === 'dx_commerce_events') {
      spec.instance_id = uuid.v4();
    }

    const created = await eventsApi.createProvider(organizationId, projectId, workspaceId, spec);
    logger.debug('Created event provider', created);
    return created;
  }

  /**
   * Ensure the event metadata is in sync with the given spec
   *
   * @param {object} provider the event provider
   * @param {[]} eventmetadata the event metadata
   * @param {object} spec the event metadata spec
   * @returns {Promise<object>} the event metadata
   */
  async function ensureEventMetadata(provider, eventmetadata, spec) {
    // eslint-disable-next-line camelcase
    const existing = eventmetadata.find(({ event_code }) => event_code === spec.event_code);
    if (existing) {
      if (existing.label === spec.label && existing.description === spec.description) {
        logger.debug(`Found event metadata in provider ${provider.label} (${provider.id})`, existing);
        return existing;
      }

      const updated = await eventsApi.updateEventMetadataForProvider(
        organizationId,
        projectId,
        workspaceId,
        provider.id,
        spec
      );
      logger.debug(`Updated event metadata in provider ${provider.label} (${provider.id})`, updated);
      return updated;
    }

    const created = await eventsApi.createEventMetadataForProvider(
      organizationId,
      projectId,
      workspaceId,
      provider.id,
      spec
    );
    logger.debug(`Created event metadata in provider ${provider.label} (${provider.id})`, created);
    return created;
  }
}

module.exports = { main, configureEvents };
