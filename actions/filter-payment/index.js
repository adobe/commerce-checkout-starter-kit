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

import { webhookErrorResponse, webhookVerify } from '../../lib/adobe-commerce.js';
import { HTTP_OK } from '../../lib/http.js';
import { telemetryConfig, isWebhookSuccessful } from '../telemetry.js';
import { instrumentEntrypoint, getInstrumentationHelpers } from '@adobe/aio-lib-telemetry';
import { checkoutMetrics } from '../checkout-metrics.js';

/**
 * This action returns the list of out-of-process payment method codes
 * that needs to be filtered out from the list of available payment methods.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function filterPayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug('Starting payment filter process');

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.filterPaymentCounter.add(1, { status: 'error', error_code: 'verification_failed' });
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    const { payload = {} } = body;

    // if the "raw-http: false" then the request can be used directly from params
    // const { payload = {} } = params;

    logger.info('Received payload: ', payload);

    const operations = [];

    // The payment method can be filtered out based on some conditions.
    operations.push(createPaymentRemovalOperation('checkmo'));

    // If the Commerce customer is logged in, the payload contains customer data otherwise the customer is set to null
    // In the next example, the payment method is filtered out based on Customer group id
    const { customer: Customer = {} } = payload;

    if (
      Customer !== null &&
      typeof Customer === 'object' &&
      Object.prototype.hasOwnProperty.call(Customer, 'group_id') &&
      Customer.group_id === '1'
    ) {
      operations.push(createPaymentRemovalOperation('cashondelivery'));
    }

    // The payment method can be filtered out based on product custom attribute values.
    // In the next example, payment method can is filtered out if any of `country_origin` attributes is equal to China
    const { items: cartItems = [] } = payload.cart;

    currentSpan.setAttribute('cart.items.count', cartItems.length);

    cartItems.forEach((cartItem) => {
      const { country_origin: country = '' } = cartItem?.product?.attributes ?? {};

      if (country.toLowerCase() === 'china') {
        operations.push(createPaymentRemovalOperation('banktransfer'));
      }
    });

    logger.info(`Filtered ${operations.length} payment methods`);

    checkoutMetrics.filterPaymentCounter.add(1, { status: 'success' });

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error('Error in payment filtering:', error);
    checkoutMetrics.filterPaymentCounter.add(1, { status: 'error', error_code: 'exception' });
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Creates a payment removal operation
 *
 * @param {string} paymentCode - The code of the payment method that needs to be filtered out
 * @returns {object} The payment removal operation object
 */
function createPaymentRemovalOperation(paymentCode) {
  return {
    op: 'add',
    path: 'result',
    value: {
      code: paymentCode,
    },
  };
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(filterPayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
