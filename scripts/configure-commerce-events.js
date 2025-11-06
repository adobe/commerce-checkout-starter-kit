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

import dotenv from 'dotenv';
import { Core, Events } from '@adobe/aio-sdk';
import yaml from 'js-yaml';
import fs from 'fs';
import * as keyValues from '../lib/key-values.js';
import { getAdobeCommerceClient } from '../lib/adobe-commerce.js';
import path from 'path';
import { resolveCredentials } from '../lib/adobe-auth.js';

dotenv.config();

const logger = Core.Logger('configure-commerce-events', { level: process.env.LOG_LEVEL || 'info' });

const eventProvidersPath = `${process.env.INIT_CWD}/events.config.yaml`;

/**
 * Configure the commerce event provider in the commerce instance, and subscribe to the events.
 * @param {string} workspaceFile The workspace file path.
 * @returns {Promise<void>}
 */
async function main(workspaceFile) {
  const { dx_commerce_events: providerId } = keyValues.decode(
    process.env.AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING
  );
  if (!providerId) {
    logger.warn(
      'No commerce provider ID found in AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING.\n' +
        'Please ensure the provider ID is correctly set by either:\n' +
        "- Running the 'configure-events' script, or\n" +
        '- Updating the .env file with the existing provider ID.'
    );
    return;
  }

  const { imsOrgId, apiKey, accessToken } = await resolveCredentials(process.env);
  const eventsApi = await Events.init(imsOrgId, apiKey, accessToken);
  const provider = await eventsApi.getProvider(providerId);
  if (provider.provider_metadata !== 'dx_commerce_events') {
    throw new Error(`The provider ID ${providerId} is not a commerce event provider.`);
  }

  if (!fs.existsSync(eventProvidersPath)) {
    logger.warn(
      `Event providers spec file not found at ${eventProvidersPath}, commerce eventing reconciliation will be skipped`
    );
    return;
  }

  const eventProvidersSpec = yaml.load(fs.readFileSync(eventProvidersPath, 'utf8'));
  const commerceProviderSpec = eventProvidersSpec?.event_providers.find(
    (providerSpec) => providerSpec.provider_metadata === 'dx_commerce_events'
  );
  if (!commerceProviderSpec) {
    logger.warn(
      `Cannot find the matched commerce provider spec for provider ID ${provider.id} at ${eventProvidersPath}. ` +
        `Please update the event provider info as follows:\n`,
      yaml.dump({
        event_providers: [
          {
            label: provider.label,
            provider_metadata: provider.provider_metadata,
            description: provider.description,
            docs_url: provider.docs_url,
          },
        ],
      })
    );
    return;
  }

  commerceProviderSpec.id = provider.id;
  commerceProviderSpec.instance_id = provider.instance_id;

  logger.info(`Configuring commerce events for the commerce instance: ${process.env.COMMERCE_BASE_URL}.`);

  const result = await configureCommerceEvents(commerceProviderSpec, workspaceFile);
  if (result.success) {
    logger.info('Commerce event configuration and subscription successful.');
  } else {
    logger.error('Failed to configure commerce events.', result.message);
  }
}

/**
 * Configures eventing in the commerce instance. If the commerce is already configured with a given event provider
 * but the event provider is different from the one provided, the configuration will halt and a warning will be logged.
 *
 * @param {object} eventProviderSpec The commerce event provider specification.
 * @param {string} workspaceFile The workspace file path.
 * @returns {Promise<{success: boolean, message: string, details: {subscriptions: Array<object>}}>} The result of the configuration.
 */
async function configureCommerceEvents(eventProviderSpec, workspaceFile) {
  const commerceClient = await getAdobeCommerceClient(process.env);
  const res = await commerceClient.getEventProviders();
  if (!res.success) {
    return {
      success: false,
      message: 'Failed to fetch event providers due to API error: ' + res.message,
      details: { subscriptions: [] },
    };
  }

  const existingProviders = res.message;
  const workspaceConfig = await readWorkspaceConfig(workspaceFile);
  // eslint-disable-next-line camelcase
  const matchedProvider = existingProviders.find(({ provider_id }) => provider_id === eventProviderSpec.id);

  if (matchedProvider) {
    logger.info(
      `Found existing event provider in the commerce instance with provider id: ${matchedProvider.provider_id}. Skipping configuration.`
    );
  } else if (existingProviders.length === 0) {
    logger.info('No existing event providers found in the commerce instance. Adding the new event provider.');
    await addCommerceEventProvider(eventProviderSpec.id, eventProviderSpec.instance_id, workspaceConfig);
  } else {
    logger.info('Commerce already has a different event provider set, but adding an additional event provider.');
    await addCommerceEventProvider(eventProviderSpec.id, eventProviderSpec.instance_id, workspaceConfig);
  }

  const result = await configureCommerceEventingConfig();

  if (!result.success) {
    return {
      success: false,
      message: 'Failed to configure eventing in commerce: ' + result.body.message,
      details: { subscriptions: [] },
    };
  }

  const subscriptionSpec = eventProviderSpec.subscription ?? [];
  subscriptionSpec.forEach((subscription) => {
    subscription.event.provider_id = eventProviderSpec.id;
  });

  const results = await ensureCommerceEventSubscriptions(subscriptionSpec);

  if (results.some((result) => !result.result.success)) {
    return {
      success: false,
      message: 'Event subscription was not successful.',
    };
  }

  return {
    success: true,
    message: 'Commerce event configuration and subscription successful.',
    details: {
      subscriptions: results,
    },
  };

  /**
   * Configures eventing in the commerce instance.
   * @returns {Promise<object>} The result of the configuration.
   */
  async function configureCommerceEventingConfig() {
    const merchantId = process.env.COMMERCE_ADOBE_IO_EVENTS_MERCHANT_ID;
    if (!merchantId) {
      logger.warn('Cannot find COMMERCE_ADOBE_IO_EVENTS_MERCHANT_ID environment variable, the value will be empty.');
    }
    const environmentId = process.env.COMMERCE_ADOBE_IO_EVENTS_ENVIRONMENT_ID;
    if (!environmentId) {
      logger.warn('Cannot find COMMERCE_ADOBE_IO_EVENTS_ENVIRONMENT_ID environment variable, the value will be empty');
    }

    return await commerceClient.configureEventing(merchantId, environmentId, workspaceConfig);
  }

  /**
   * Subscribes to the commerce events. Logs a warning if the event already exists, and logs an error
   * for other failures but continues with other subscriptions.
   *
   * @param {Array<object>} eventsSpec The list of commerce event subscriptions details.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of results for each subscription attempt.
   */
  async function ensureCommerceEventSubscriptions(eventsSpec) {
    return Promise.all(
      eventsSpec.map(async (event) => {
        const result = await commerceClient.subscribeEvent(event);
        if (!result.success) {
          if (result.body.message.includes('already exists')) {
            logger.warn(
              'An event subscription with the same identifier already exists in the commerce system. ' +
                'If you intend to update this subscription, please unsubscribe the existing one first. '
            );
          } else {
            logger.error('Failed to subscribe event in Commerce: ' + result.body.message);
          }
        } else {
          logger.info(`Subscribed to event ${event.event.name} in Commerce.`);
        }
        return { event, result };
      })
    );
  }

  /**
   * Adds the non-default event provider to the commerce instance.
   *
   * @param {string} providerId - provider id
   * @param {string} instanceId - instance id
   * @param {object} workspaceConfiguration - workspace configuration
   */
  async function addCommerceEventProvider(providerId, instanceId, workspaceConfiguration) {
    await commerceClient.addEventProvider({
      eventProvider: {
        provider_id: providerId,
        instance_id: instanceId,
        label: eventProviderSpec.label,
        description: eventProviderSpec.description,
        workspace_configuration: JSON.stringify(workspaceConfiguration),
      },
    });
    logger.info(`Added non-default provider with id "${providerId}" and instance id "${instanceId}" to the Commerce.`);
  }
}

/**
 * Reads the workspace configuration from the given file path.
 * @param {string} filePath the file path
 * @returns {Promise<object>} the workspace configuration
 */
async function readWorkspaceConfig(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : `${process.env.INIT_CWD}/${filePath}`;
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(fileContent);
}

export { main, configureCommerceEvents };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const workspaceFile = process.argv[2];
  main(workspaceFile).catch(console.error);
}
