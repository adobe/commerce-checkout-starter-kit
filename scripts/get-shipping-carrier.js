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
 * Retrieves a shipping carrier from the configured Adobe Commerce instance
 */
async function main() {
  const args = process.argv[1];
  const result = extractAndValidateCarrierCode(args);

  if (result.isValid) {
    const client = await getAdobeCommerceClient(process.env);
    const response = await client.getOopeShippingCarrier(result.carrierCode);
    console.info('Fetching shipping carriers...');
    if (response.success) {
      console.info(`Shipping carrier details fetched for ${response.message.code}`);
      console.info(`${JSON.stringify(response.message)}`);
    } else {
      console.error(`Failed to retrieve shipping carriers ` + response.message);
    }
  } else {
    console.log(`Error: ${result.message}`);
  }
}

/**
 * Validates the option carrier-code.
 * @param {string} input argument_value
 * @returns {object} validation_result
 */
function extractAndValidateCarrierCode(input) {
  const option = 'carrier-code';
  const regex = new RegExp(`${option}=([^&]*)`);
  const match = input.match(regex);

  if (match) {
    const carrierCode = match[1];
    return {
      isValid: true,
      carrierCode,
      message: 'Carrier code found and extracted successfully.',
    };
  } else {
    return {
      isValid: false,
      carrierCode: null,
      message: `The option '${option}' was not found in the command.`,
    };
  }
}

module.exports = { main };
