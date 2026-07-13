import {
  exceptionOperation,
  ok,
  replaceOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: 8.1,
  INCLUDING_TAX: 8.4,
});

/**
 * This action calculates the adjustment taxes for the given credit memo request.
 * It runs with require-adobe-auth: true; webhook signature verification is
 * handled by the App Management platform's declarative webhooks[] subscription,
 * not by this action.
 *
 * @param {object} params the input parameters, including the parsed `oopCreditMemo` payload
 * @returns {{statusCode: number, body: object}} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function collectAdjustmentTaxes(params) {
  const { logger } = getInstrumentationHelpers();

  logger.debug("Starting adjustment tax collection process");

  try {
    const { oopCreditMemo } = params;
    if (!oopCreditMemo?.items) {
      logger.error("Invalid or missing oopCreditMemo data");
      return ok(exceptionOperation("Invalid or missing oopCreditMemo data"));
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
      operations.push(
        replaceOperation("oopCreditMemo/adjustment/refund_tax", refundTax),
      );
    }

    // Calculate and add fee tax if applicable
    if (adjustmentFee) {
      const feeTax = calculateTaxAmount(adjustmentFee, taxRate);
      operations.push(
        replaceOperation("oopCreditMemo/adjustment/fee_tax", feeTax),
      );
    }

    logger.debug(
      "Adjustment Tax calculation response: ",
      JSON.stringify(operations, null, 2),
    );

    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in adjustment tax collection:", error);
    checkoutMetrics.collectAdjustmentTaxesCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

/**
 * Calculates the tax amount based on the taxable amount and tax rate.
 *
 * @param {number} taxableAmount the amount to calculate tax on
 * @param {number} taxRate the tax rate percentage
 * @returns {number} The calculated tax amount, rounded to two decimal places.
 */
function calculateTaxAmount(taxableAmount, taxRate) {
  const taxAmount = taxableAmount * (taxRate / 100);
  return Math.round(taxAmount * 100) / 100;
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectAdjustmentTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
