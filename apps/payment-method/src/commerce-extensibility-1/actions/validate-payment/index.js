import {
  exceptionOperation,
  isWebhookSuccessful,
  ok,
  successOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { PAYMENT_METHODS } from "../../payment-methods.js";
import { checkoutMetrics } from "../checkout-metrics.js";
import { telemetryConfig } from "../telemetry.js";

const SUPPORTED_PAYMENT_METHOD_CODES = PAYMENT_METHODS.map(
  (paymentMethod) => paymentMethod.payment_method.code,
);

/**
 * This action validates the payment information before the order is placed.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params input parameters
 * @returns {Promise<{type: string, statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function validatePayment(params) {
  const { logger, currentSpan } = getInstrumentationHelpers();

  logger.debug("Starting payment validation process");

  try {
    const {
      payment_method: paymentMethod,
      payment_additional_information: paymentInfo,
    } = params;

    logger.info(
      `Payment method ${paymentMethod} with additional info.`,
      paymentInfo,
    );
    currentSpan.setAttribute("payment.method", paymentMethod);

    if (!SUPPORTED_PAYMENT_METHOD_CODES.includes(paymentMethod)) {
      // The validation of this payment method is not implemented by this action, ideally the webhook subscription
      // has to be constrained to the payment method code implemented by this app so this should never happen.
      logger.debug(`Payment method ${paymentMethod} not handled by this app.`);
      checkoutMetrics.validatePaymentCounter.add(1, {
        result: "not_supported",
        status: "success",
      });
      return ok(successOperation());
    }

    if (!paymentInfo) {
      // payment_additional_information is set using the graphql mutation setPaymentMethodOnCart
      // see https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/set-payment-method/#paymentmethodinput-attributes
      logger.warn(
        "payment_additional_information not found in the request",
        paymentMethod,
      );
      checkoutMetrics.validatePaymentCounter.add(1, {
        error_code: "missing_info",
        status: "error",
      });
      return ok(
        exceptionOperation(
          "payment_additional_information not found in the request",
        ),
      );
    }

    // Check if the payment information is valid with the payment gateway, this is vendor specific
    logger.debug(
      "Validated payment information successfully.",
      paymentMethod,
      paymentInfo,
    );

    checkoutMetrics.validatePaymentCounter.add(1, { status: "success" });

    return ok(successOperation());
  } catch (error) {
    logger.error("Error in payment validation:", error);
    checkoutMetrics.validatePaymentCounter.add(1, {
      error_code: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(validatePayment, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
