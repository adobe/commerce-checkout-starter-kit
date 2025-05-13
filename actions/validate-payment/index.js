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

const { Core } = require('@adobe/aio-sdk');
const { webhookSuccessResponse, webhookErrorResponse, webhookVerify } = require('../../lib/adobe-commerce');

/**
 * This action validates the payment information before the order is placed.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param params the input parameters
 * @returns {Promise<{body: {op: string}, statusCode: number}>}
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function main(params) {
  const logger = Core.Logger('validate-payment', { level: params.LOG_LEVEL || 'info' });
  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    let payload = params;
    if (params.__ow_body) {
      // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
      payload = JSON.parse(atob(params.__ow_body));
    }

    const { additional_information: paymentInfo, method: paymentMethod } = payload.data.order.payment;

    logger.info(`Payment method ${paymentMethod} with additional info.`, paymentInfo);

    const supportedPaymentMethods = JSON.parse(params.COMMERCE_PAYMENT_METHOD_CODES);
    if (!supportedPaymentMethods.includes(paymentMethod)) {
      // The validation of this payment method is not implemented by this action, ideally the webhook subscription
      // has to be constrained to the payment method code implemented by this app so this should never happen.
      logger.debug(`Payment method ${paymentMethod} not handled by this app.`);
      return webhookSuccessResponse();
    }

    if (!paymentInfo) {
      // payment_additional_information is set using the graphql mutation setPaymentMethodOnCart
      // see https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/set-payment-method/#paymentmethodinput-attributes
      logger.warn('payment_additional_information not found in the request', paymentMethod);
      return webhookErrorResponse('payment_additional_information not found in the request');
    }

    // Check if the payment information is valid with the payment gateway, this is vendor specific
    logger.debug('Validated payment information successfully.', paymentMethod, paymentInfo);
    return webhookSuccessResponse();
  } catch (error) {
    logger.error(error);
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

exports.main = main;
