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
 * Retrieves all shipping carrier from the configured Adobe Commerce instance
 */
async function main() {
  const client = await getAdobeCommerceClient(process.env);
  const response = await client.getAllOopeShippingCarriers();
  console.info('Fetching shipping carriers...');
  if (response.success) {
    console.info(
      ` Total ${response.message.length} shipping carriers fetched with carrier_codes - ${response.message.map((carrier) => ' ' + carrier.code)}`
    );
  } else {
    console.error(`Failed to retrieve shipping carriers` + response.message);
  }
}

module.exports = { main };
