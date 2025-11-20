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

import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import {
  webhookErrorResponse,
  webhookVerify,
} from "../../lib/adobe-commerce.js";
import { HTTP_OK } from "../../lib/http.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: 8.1,
  INCLUDING_TAX: 8.4,
});

/**
 * This action calculates the adjustment taxes for the given credit memo request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params - method params includes environment and request data
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function collectAdjustmentTaxes(params) {
  const { logger } = getInstrumentationHelpers();

  logger.debug("Starting adjustment tax collection process");

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      logger.error(`Webhook verification failed: ${error}`);
      checkoutMetrics.collectAdjustmentTaxesCounter.add(1, {
        status: "error",
        error_code: "verification_failed",
      });
      return webhookErrorResponse(
        `Failed to verify the webhook signature: ${error}`,
      );
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    logger.debug("Received request: ", body);

    const { oopCreditMemo } = body;
    if (!oopCreditMemo?.items) {
      logger.error("Invalid or missing oopCreditMemo data");
      return webhookErrorResponse("Invalid or missing oopCreditMemo data");
    }

    // Check if store has tax included setup
    const isTaxIncluded = oopCreditMemo.items.some(
      (item) => item.is_tax_included === true,
    );
    // Sample tax rates matched with collect-taxes action depending on tax-inclusive
    const taxRate = isTaxIncluded
      ? TAX_RATES.INCLUDING_TAX
      : TAX_RATES.EXCLUDING_TAX;

    // Adjustment Refund and Fee Amounts, remaining without tax
    // The calculated returned taxes will be summed up to the grand total in Commerce
    const adjustmentRefund = oopCreditMemo.adjustment?.refund;
    const adjustmentFee = oopCreditMemo.adjustment?.fee;
    const operations = [];

    // Calculate and add refund tax if applicable
    if (adjustmentRefund) {
      const refundTax = calculateTaxAmount(adjustmentRefund, taxRate);
      operations.push(createAdjustmentRefundTax(refundTax));
    }

    // Calculate and add fee tax if applicable
    if (adjustmentFee) {
      const feeTax = calculateTaxAmount(adjustmentFee, taxRate);
      operations.push(createAdjustmentFeeTax(feeTax));
    }

    logger.debug(
      "Adjustment Tax calculation response: ",
      JSON.stringify(operations, null, 2),
    );

    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: "success" });

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error("Error in adjustment tax collection:", error);
    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, {
      status: "error",
      error_code: "exception",
    });
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Calculates the tax amount based on the taxable amount and tax rate.
 *
 * @param taxableAmount
 * @param taxRate
 * @returns {number} The calculated tax amount, rounded to two decimal places.
 */
function calculateTaxAmount(taxableAmount, taxRate) {
  const taxAmount = taxableAmount * (taxRate / 100);
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
    op: "replace",
    path: "oopCreditMemo/adjustment/refund_tax",
    value,
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
    op: "replace",
    path: "oopCreditMemo/adjustment/fee_tax",
    value,
  };
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectAdjustmentTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
