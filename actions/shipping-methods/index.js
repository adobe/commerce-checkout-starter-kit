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

const { Core } = require('@adobe/aio-sdk');
const { webhookErrorResponse, webhookVerify } = require('../../lib/adobe-commerce');
const { HTTP_OK } = require('../../lib/http');

/**
 * This action returns the list of out-of-process shipping methods for the given request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<object>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function main(params) {
  const logger = Core.Logger('shipping-methods', { level: params.LOG_LEVEL || 'info' });
  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    const payload = JSON.parse(atob(params.__ow_body));
    const { rateRequest: request } = payload;
    const { dest_country_id: destCountryId = 'US', dest_postcode: destPostcode = '12345' } = request;

    logger.info('Received request: ', request);

    const operations = [];

    operations.push(
      createShippingOperation({
        carrier_code: 'DPS',
        method: 'dps_shipping_one',
        method_title: 'Demo Custom Shipping One',
        price: 17,
        cost: 17,
        additional_data: [
          {
            key: 'additional_data_key',
            value: 'additional_data_value',
          },
          {
            key: 'additional_data_key2',
            value: 'additional_data_value2',
          },
          {
            key: 'additional_data_key3',
            value: 'additional_data_value3',
          },
        ],
      })
    );

    // Based on the postal code, we can add another shipping method
    if (destPostcode > 30000) {
      operations.push(
        createShippingOperation({
          carrier_code: 'DPS',
          method: 'dps_shipping_two',
          method_title: 'Demo Custom Shipping Two',
          price: 18,
          cost: 18,
          additional_data: {
            key: 'additional_data_key',
            value: 'additional_data_value',
          },
        })
      );
    }

    // Based on the country we can add another shipping method
    if (destCountryId === 'CA') {
      operations.push(
        createShippingOperation({
          carrier_code: 'DPS',
          method: 'dps_shipping_ca_one',
          method_title: 'Demo Custom Shipping for Canada only',
          price: 18,
          cost: 18,
          additional_data: {
            key: 'additional_data_key',
            value: 'additional_data_value',
          },
        })
      );
    }

    // You can remove the shipping method based on some conditions.
    // For this, provide the method name within the remove flag set to true
    //
    // operations.push({
    //   op: 'add',
    //   path: 'result',
    //   value: {
    //     method: 'flatrate',
    //     remove: true,
    //   },
    // });

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error(error);
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Creates a shipping operation
 *
 * @param {object} carrierData - The carrier data for the shipping operation
 * @returns {object} The shipping operation object
 */
function createShippingOperation(carrierData) {
  return {
    op: 'add',
    path: 'result',
    value: carrierData,
  };
}

exports.main = main;
