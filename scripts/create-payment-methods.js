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

import { getAdobeCommerceClient } from '../lib/adobe-commerce.js';
import fs from 'fs';
import yaml from 'js-yaml';

/**
 * Creates all the payment methods defined in the payment-methods.yaml file in the configured Adobe Commerce instance
 * @param {string} configFilePath path to the payment-methods.yaml file
 * @returns {string[]} array of created payment method codes
 */
export async function main(configFilePath) {
  console.info('Reading payment configuration file...');
  const fileContents = fs.readFileSync(configFilePath, 'utf8');
  const data = yaml.load(fileContents);
  console.info('Creating payment methods...');
  const createdPaymentMethods = [];

  const client = await getAdobeCommerceClient(process.env);

  for (const paymentMethod of data.methods) {
    const response = await client.createOopePaymentMethod(paymentMethod);
    const paymentMethodCode = paymentMethod.payment_method.code;
    if (response.success) {
      console.info(`Payment method ${paymentMethodCode} created`);
      createdPaymentMethods.push(paymentMethodCode);
    } else {
      console.error(`Failed to create payment method ${paymentMethodCode}: ` + response.message);
    }
  }
  return createdPaymentMethods;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const configFile = process.argv[2] || 'payment-methods.yaml';
  main(configFile).catch(console.error);
}
