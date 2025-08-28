/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

/**
 * Creates shipping carriers defined in the extensibility.config.js file in the configured Adobe Commerce instance
 * @param {string} configFilePath path to the JavaScript configuration file
 * @returns  {string[]} array of created shipping carrier codes
 */
async function main(configFilePath) {
  console.info('Reading shipping configuration file...');
  const { shippingCarriers } = require(configFilePath);
  console.info('Creating shipping carriers...');
  const createShippingMethods = [];

  const client = await getAdobeCommerceClient(process.env);

  for (const carrier of shippingCarriers) {
    const shippingCarrier = { carrier };
    const response = await client.createOopeShippingCarrier(shippingCarrier);
    const shippingCarrierCode = carrier.code;
    if (response.success) {
      console.info(`Shipping carrier ${shippingCarrierCode} created`);
      createShippingMethods.push(shippingCarrierCode);
    } else {
      console.error(`Failed to create shipping carrier ${shippingCarrierCode}: ` + response.message);
    }
  }
  return createShippingMethods;
}

module.exports = { main };
