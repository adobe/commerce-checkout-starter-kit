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

/**
 * Creates all the payment methods defined in the extensibility.config.js file in the configured Adobe Commerce instance
 * @param {string} configFilePath path to the JavaScript configuration file
 * @returns {string[]} array of created payment method codes
 */
async function main(configFilePath) {
  console.info('Reading payment configuration file...');
  const { paymentMethods } = require(configFilePath);
  console.info('Creating payment methods...');
  const createdPaymentMethods = [];

  const client = await getAdobeCommerceClient(process.env);

  for (const method of paymentMethods) {
    const paymentMethod = { payment_method: method };
    const response = await client.createOopePaymentMethod(paymentMethod);
    const paymentMethodCode = method.code;
    if (response.success) {
      console.info(`Payment method ${paymentMethodCode} created`);
      createdPaymentMethods.push(paymentMethodCode);
    } else {
      console.error(`Failed to create payment method ${paymentMethodCode}: ` + response.message);
    }
  }
  return createdPaymentMethods;
}

module.exports = { main };
