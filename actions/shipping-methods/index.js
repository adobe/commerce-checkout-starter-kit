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
 * @param params the input parameters
 * @returns {Promise<{body: {op: string}, statusCode: number}>}
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function main(params) {
  const logger = Core.Logger('shipping-methods', { level: params.LOG_LEVEL || 'info' });
  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    const { rateRequest: request } = params;

    logger.info('Received request: ', request);

    let operations = [];

    operations.push({
      op: 'add',
      path: 'result',
      value: {
        carrier_code: 'CPS',
        method: 'cps_shipping_one',
        method_title: 'CPS Custom Shipping One',
        price: 17,
        cost: 17,
        additional_data: [
          {
            key: 'additional_data_key',
            value: 'additional_data_value'
          },
          {
            key: 'additional_data_key2',
            value: 'additional_data_value2'
          },
          {
            key: 'additional_data_key3',
            value: 'additional_data_value3'
          }
        ]
      },
    });

    const postCode = request.dest_postcode;

    // Based on the postal code, we can add another shipping method
    if (postCode > 30000) {
      operations.push({
        op: 'add',
        path: 'result',
        value: {
          carrier_code: 'CPS',
          method: 'cps_shipping_two',
          method_title: 'CPS Custom Shipping Two',
          price: 18,
          cost: 18,
          additional_data: {
            key: 'additional_data_key',
            value: 'additional_data_value'
          },
        }
      });
    }

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations)
    }
  } catch (error) {
    logger.error(error);
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

exports.main = main
