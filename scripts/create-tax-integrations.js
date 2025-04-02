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

const { getAdobeCommerceClient } = require('../lib/adobe-commerce');
const fs = require('fs');
const yaml = require('js-yaml');
const { Core } = require('@adobe/aio-sdk');
const logger = Core.Logger('create-tax-integration', { level: process.env.LOG_LEVEL || 'info' });

/**
 * Creates all the payment methods defined in the payment-methods.yaml file in the configured Adobe Commerce instance
 * @param configFilePath
 * @returns array of strings
 */
async function main(configFilePath) {
  logger.info('Reading tax configuration file...');
  const fileContents = fs.readFileSync(configFilePath, 'utf8');
  const data = yaml.load(fileContents);
  logger.info('Creating tax integrations...');
  const createdTaxIntegrations = [];

  const client = await getAdobeCommerceClient(process.env);

  for (const taxIntegration of data.tax_integrations) {
    const response = await client.createTaxIntegration(taxIntegration);
    const taxIntegrationCode = taxIntegration.tax_integration.code;
    if (response.success) {
      logger.info(`Tax integration ${taxIntegrationCode} created`);
      createdTaxIntegrations.push(taxIntegrationCode);
    } else {
      logger.error(
        `Failed to create tax integration ${taxIntegrationCode}: ` +
          (response.statusCode === 400 && response.body.message !== undefined ? response.body.message : response.message)
      );
    }
  }
  return createdTaxIntegrations;
}

module.exports = { main };
