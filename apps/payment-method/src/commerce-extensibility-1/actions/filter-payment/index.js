import {
  addOperation,
  exceptionOperation,
  ok,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { checkoutMetrics } from "../checkout-metrics.js";
import { isWebhookSuccessful, telemetryConfig } from "../telemetry.js";

/**
 * This action returns the list of out-of-process payment method codes
 * that needs to be filtered out from the list of available payment methods.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<{type: string, statusCode: number, body: object}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function filterPayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting payment filter process");

  try {
    const { payload = {} } = params;

    logger.info("Received payload: ", payload);

    const operations = [];

    // The payment method can be filtered out based on some conditions.
    operations.push(addOperation("result", { code: "checkmo" }));

    // If the Commerce customer is logged in, the payload contains customer data otherwise the customer is set to null
    // In the next example, the payment method is filtered out based on Customer group id
    const { customer: Customer = {} } = payload;

    if (
      Customer !== null &&
      typeof Customer === "object" &&
      Object.hasOwn(Customer, "group_id") &&
      Customer.group_id === "1"
    ) {
      operations.push(addOperation("result", { code: "cashondelivery" }));
    }

    // The payment method can be filtered out based on product custom attribute values.
    // In the next example, payment method can is filtered out if any of `country_origin` attributes is equal to China
    const { items: cartItems = [] } = payload.cart;

    currentSpan.setAttribute("cart.items.count", cartItems.length);

    for (const cartItem of cartItems) {
      const { country_origin: country = "" } =
        cartItem?.product?.attributes ?? {};

      if (country.toLowerCase() === "china") {
        operations.push(addOperation("result", { code: "banktransfer" }));
      }
    }

    logger.info(`Filtered ${operations.length} payment methods`);

    checkoutMetrics.filterPaymentCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in payment filtering:", error);
    checkoutMetrics.filterPaymentCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(filterPayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
