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
const yaml = require('js-yaml');
const fs = require('fs');
const keyValues = require('../lib/key-values');
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');
const path = require('path');
const { resolveCredentials } = require('../lib/adobe-auth');

const logger = Core.Logger('configure-commerce-events', { level: process.env.LOG_LEVEL || 'info' });

const eventProvidersPath = `${process.env.INIT_CWD}/events.config.yaml`;
const appConfigPath = `${process.env.INIT_CWD}/app.config.yaml`;
const EVENT_PREFIX = process.env.EVENT_PREFIX;

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

  if (!fs.existsSync(appConfigPath)) {
    logger.warn(
      `Application configuration file not found at ${appConfigPath}, commerce eventing reconciliation will be skipped`
    );
    return;
  }

  if (!EVENT_PREFIX || !/^[a-z0-9_]+$/.test(EVENT_PREFIX)) {
    logger.error(
      'EVENT_PREFIX is required, must be lowercase alphanumeric, may include underscores, and contain no spaces.'
    );
    return;
  }

  const eventProvidersSpec = yaml.load(fs.readFileSync(eventProvidersPath, 'utf8'));
  const commerceProviderSpec = eventProvidersSpec?.event_providers.find(
    (providerSpec) => providerSpec.provider_metadata === 'dx_commerce_events'
  );
  const appConfigEventProviderSpec = yaml.load(fs.readFileSync(appConfigPath, 'utf8'));
  const commerceEventConsumerInfo =
    appConfigEventProviderSpec?.application?.events?.registrations['Commerce events consumer'];

  if (commerceEventConsumerInfo && Array.isArray(commerceEventConsumerInfo.events_of_interest)) {
    commerceEventConsumerInfo.events_of_interest.forEach((event) => {
      if (event.provider_metadata === 'dx_commerce_events' && Array.isArray(event.event_codes)) {
        event.event_codes = event.event_codes.map((code) => {
          return code.replace(
            /^com\.adobe\.commerce(?:\.(.*?))?\.(observer|plugin)/,
            `com.adobe.commerce.${EVENT_PREFIX}.$2`
          );
        });

        fs.writeFileSync(appConfigPath, yaml.dump(appConfigEventProviderSpec, { lineWidth: -1 }));
        logger.debug(`Updated event_code with ${EVENT_PREFIX} for dx_commerce_events`);
      }
    });
  }

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

  if (provider.label.split('-')[0].trim() !== commerceProviderSpec.label) {
    logger.warn(`Event Provider configured is incorrect please execute "npm run configure-events"`);
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
  const workspaceConfig = await readWorkspaceConfig(workspaceFile);

  const res = await commerceClient.getEventProviders();
  if (!res.success) {
    return {
      success: false,
      message: 'Failed to fetch event providers due to API error: ' + res.body.message,
      details: { subscriptions: [] },
    };
  }

  const existingProviders = res.message;
  const isNonDefaultProviderAdded = existingProviders.some((provider) => provider.provider_id === eventProviderSpec.id);

  if (!isNonDefaultProviderAdded) {
    await addCommerceEventProvider(eventProviderSpec.id, eventProviderSpec.instance_id, workspaceConfig);
  }

  const result = await configureCommerceEventing(workspaceConfig);

  if (!result.success) {
    return {
      success: false,
      message: 'Failed to configure eventing in commerce: ' + result.body.message,
      details: { subscriptions: [] },
    };
  }

  const subscriptionSpec = eventProviderSpec.subscription ?? [];
  subscriptionSpec.forEach((item) => {
    item.event.provider_id = eventProviderSpec.id;
    item.event.name = EVENT_PREFIX + '.' + item.event.name;
  });

  const results = await ensureCommerceEventSubscriptions(subscriptionSpec);

  return {
    success: true,
    message: 'Commerce event configuration and subscription successful.',
    details: {
      subscriptions: results,
    },
  };

  /**
   * Configures eventing in the commerce instance with the given event provider.
   *
   * @param {object} workspaceConfig The workspace configuration object.
   * @returns {Promise<object>} The result of the configuration.
   */
  async function configureCommerceEventing(workspaceConfig) {
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
          logger.info(`Subscribed to event "${event.event.name}" in Commerce.`);
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
 * @returns {object} the workspace configuration
 */
function readWorkspaceConfig(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : `${process.env.INIT_CWD}/${filePath}`;
  return require(absolutePath);
}

module.exports = { main, configureCommerceEvents };
