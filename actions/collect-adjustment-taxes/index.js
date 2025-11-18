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

import { HTTP_OK } from '../../lib/http.js';
import { webhookErrorResponse, webhookVerify } from '../../lib/adobe-commerce.js';
import { telemetryConfig, isWebhookSuccessful } from '../telemetry.js';
import { instrumentEntrypoint, getInstrumentationHelpers } from '@adobe/aio-lib-telemetry';
import { checkoutMetrics } from '../checkout-metrics.js';

const TAX_RATE = 5.0; // 5 % tax rate as a sample

/**
 * This action calculates the adjustment taxes for the given credit memo request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params - method params includes environment and request data
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function collectAdjustmentTaxes(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug('Starting adjustment tax collection process');

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: 'error', error_code: 'verification_failed' });
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    logger.debug('Received request: ', body);

    const { oopCreditmemo } = body;
    if (!oopCreditmemo || !oopCreditmemo.items) {
      logger.error('Invalid or missing oopCreditmemo data');
      return webhookErrorResponse('Invalid or missing oopCreditmemo data');
    }

    const isTaxIncluded = oopCreditmemo.items.some((item) => item.is_tax_included === true);
    const adjustmentRefund = oopCreditmemo.adjustment?.refund;
    const adjustmentFee = oopCreditmemo.adjustment?.fee;

    let operations = [];
    if (adjustmentRefund) {
      const refundTax = calculateTaxAmount(adjustmentRefund, TAX_RATE, isTaxIncluded);
      operations.push(createAdjustmentRefundTax(refundTax));
    }

    if (adjustmentFee) {
      const feeTax = calculateTaxAmount(adjustmentFee, TAX_RATE, isTaxIncluded);
      operations.push(createAdjustmentFeeTax(feeTax));
    }

    logger.debug('Adjustment Tax calculation response: ', JSON.stringify(operations, null, 2));

    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: 'success' });

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error('Error in adjustment tax collection:', error);
    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: 'error', error_code: 'exception' });
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Calculates the tax amount based on the taxable amount, tax rate, and whether tax is included.
 *
 * @param taxableAmount
 * @param taxRate
 * @param isTaxIncluded
 * @returns {number} The calculated tax amount, rounded to two decimal places.
 */
function calculateTaxAmount(taxableAmount, taxRate, isTaxIncluded = false) {
  const taxAmount = isTaxIncluded
    ? taxableAmount - taxableAmount / (1 + taxRate / 100) // Reverse tax calculation
    : taxableAmount * (taxRate / 100);

  return Math.round(taxAmount * 100) / 100;
}

/**
 * Creates webhook operation to update the adjustment refund tax value.
 *
 * @param value
 * @returns {{op: string, path: string, value}}
 */
function createAdjustmentRefundTax(value) {
  return {
    op: 'replace',
    path: 'oopCreditmemo/adjustment/refund_tax',
    value: value,
  };
}

/**
 * Creates webhook operation to update the adjustment fee tax value.
 *
 * @param value
 * @returns {{op: string, path: string, value}}
 */
function createAdjustmentFeeTax(value) {
  return {
    op: 'replace',
    path: 'oopCreditmemo/adjustment/fee_tax',
    value: value,
  };
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectAdjustmentTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
