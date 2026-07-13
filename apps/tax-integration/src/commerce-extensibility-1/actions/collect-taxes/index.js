import {
  addOperation,
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
  EXCLUDING_TAX: [
    { code: "state_tax", rate: 4.5, title: "State Tax" },
    { code: "county_tax", rate: 3.6, title: "County Tax" },
  ],
  INCLUDING_TAX: [{ code: "vat", rate: 8.4, title: "VAT" }],
});

/**
 * This action calculates the tax for the given request.
 * It runs with require-adobe-auth: true; webhook signature verification is
 * handled by the App Management platform's declarative webhooks[] subscription,
 * not by this action.
 *
 * @param {object} params the input parameters, including the parsed `oopQuote` payload
 * @returns {{statusCode: number, body: object}} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function collectTaxes(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting tax collection process");

  try {
    const { oopQuote } = params;

    currentSpan.setAttribute("quote.items.count", oopQuote?.items?.length || 0);

    const operations = [];

    oopQuote.items.forEach((item, index) => {
      operations.push(...calculateTaxOperations(item, index));
    });

    logger.info(
      "Tax calculation response : ",
      JSON.stringify(operations, null, 2),
    );

    checkoutMetrics.collectTaxesCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in tax collection:", error);
    checkoutMetrics.collectTaxesCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}
/**
 * Calculates the tax operations for the given item.
 * @param {object} item the item to calculate the tax operations for
 * @param {number} index the index of the item in the quote
 * @returns {object[]} the tax operations
 */
function calculateTaxOperations(item, index) {
  const taxesToApply = obtainTaxRates(item);

  const operations = [];

  // This sample assumes that discount is applied before tax (Apply Tax After Discount = NO)
  const discountAmount = Math.min(
    item.unit_price * item.quantity,
    item.discount_amount,
  );
  const taxableAmount = item.unit_price * item.quantity - discountAmount;
  let itemTaxAmount = 0.0;
  let discountCompensationTaxAmount = 0.0;

  for (const tax of taxesToApply) {
    let taxAmount = 0;

    if (item.is_tax_included) {
      // Reverse tax calculation when tax is included in price
      taxAmount = taxableAmount - taxableAmount / (1 + tax.rate / 100);
      // Hidden tax calculation assumes discount is applied before tax
      const hiddenTax = discountAmount - discountAmount / (1 + tax.rate / 100);
      discountCompensationTaxAmount += hiddenTax;
    } else {
      taxAmount = taxableAmount * (tax.rate / 100);
    }

    taxAmount = Math.round(taxAmount * 100) / 100;
    itemTaxAmount += taxAmount;

    operations.push(createTaxBreakdownOperation(index, tax, taxAmount));
  }

  itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
  discountCompensationTaxAmount =
    Math.round(discountCompensationTaxAmount * 100) / 100;

  const netPrice = item.is_tax_included
    ? taxableAmount - itemTaxAmount
    : taxableAmount;
  const itemTaxRate =
    netPrice > 0 ? Math.round((itemTaxAmount / netPrice) * 10_000) / 100 : 0;

  operations.push(
    createTaxSummaryOperation(
      index,
      itemTaxRate,
      itemTaxAmount,
      discountCompensationTaxAmount,
    ),
  );

  return operations;
}

/**
 * Resolves the tax rates for the given item.
 * @param {object} item the item to resolve the tax rates for
 * @returns {{code: string, rate: number, title: string}[]} the tax rates
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
function obtainTaxRates(item) {
  // Replace this example with external tax service containing the tax rates
  return item.is_tax_included
    ? TAX_RATES.INCLUDING_TAX
    : TAX_RATES.EXCLUDING_TAX;
}

/**
 * Creates a tax breakdown operation for the given item.
 * @param {number} index operation index
 * @param {object} tax operation tax
 * @param {number} taxAmount operation tax amount
 * @returns {object} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#add-operation
 */
function createTaxBreakdownOperation(index, tax, taxAmount) {
  return addOperation(
    `oopQuote/items/${index}/tax_breakdown`,
    {
      data: {
        amount: taxAmount,
        code: tax.code,
        rate: tax.rate,
        tax_rate_key: `${tax.code}-${tax.rate}`,
        title: tax.title,
      },
    },
    "Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxBreakdownInterface",
  );
}

/**
 * Creates a tax summary operation for the given item.
 * @param {number} index operation index
 * @param {number} itemTaxRate operation item tax rate
 * @param {number} itemTaxAmount operation item tax amount
 * @param {number} discountCompensationTaxAmount operation discount compensation tax amount
 * @returns {object} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#replace-operation
 */
function createTaxSummaryOperation(
  index,
  itemTaxRate,
  itemTaxAmount,
  discountCompensationTaxAmount,
) {
  return replaceOperation(
    `oopQuote/items/${index}/tax`,
    {
      data: {
        amount: itemTaxAmount,
        discount_compensation_amount: discountCompensationTaxAmount,
        rate: itemTaxRate,
      },
    },
    "Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxInterface",
  );
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(collectTaxes, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
