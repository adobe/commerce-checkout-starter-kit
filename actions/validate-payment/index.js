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

import { webhookSuccessResponse, webhookErrorResponse, webhookVerify } from '../../lib/adobe-commerce.js';
import { telemetryConfig, isWebhookSuccessful } from '../telemetry.js';
import { instrumentEntrypoint, getInstrumentationHelpers } from '@adobe/aio-lib-telemetry';
import { checkoutMetrics } from '../checkout-metrics.js';

/**
 * This action validates the payment information before the order is placed.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params input parameters
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function validatePayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug('Starting payment validation process');

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.validatePaymentCounter.add(1, { status: 'error', error_code: 'verification_failed' });
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));

    const { payment_method: paymentMethod, payment_additional_information: paymentInfo } = body;

    logger.info(`Payment method ${paymentMethod} with additional info.`, paymentInfo);
    currentSpan.setAttribute('payment.method', paymentMethod);

    const supportedPaymentMethods = JSON.parse(params.COMMERCE_PAYMENT_METHOD_CODES);
    if (!supportedPaymentMethods.includes(paymentMethod)) {
      // The validation of this payment method is not implemented by this action, ideally the webhook subscription
      // has to be constrained to the payment method code implemented by this app so this should never happen.
      logger.debug(`Payment method ${paymentMethod} not handled by this app.`);
      checkoutMetrics.validatePaymentCounter.add(1, { status: 'success', result: 'not_supported' });
      return webhookSuccessResponse();
    }

    if (!paymentInfo) {
      // payment_additional_information is set using the graphql mutation setPaymentMethodOnCart
      // see https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/set-payment-method/#paymentmethodinput-attributes
      logger.warn('payment_additional_information not found in the request', paymentMethod);
      checkoutMetrics.validatePaymentCounter.add(1, { status: 'error', error_code: 'missing_info' });
      return webhookErrorResponse('payment_additional_information not found in the request');
    }

    // Check if the payment information is valid with the payment gateway, this is vendor specific
    logger.debug('Validated payment information successfully.', paymentMethod, paymentInfo);

    checkoutMetrics.validatePaymentCounter.add(1, { status: 'success' });

    return webhookSuccessResponse();
  } catch (error) {
    logger.error('Error in payment validation:', error);
    checkoutMetrics.validatePaymentCounter.add(1, { status: 'error', error_code: 'exception' });
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(validatePayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
