/**
 * Custom fees (out-of-process totals collector 1.2.0 and later):
 * Subtotal under $50 adds a $5 small order fee, and under $100 a $4.50 handling fee.
 * Returns the fees as a `result/fees` replace, or `success` when none apply, which also removes
 * fees added by an earlier call.
 *
 * Runs with `require-adobe-auth: true`; Commerce's webhook signature verification is handled by
 * the App Management platform via the declarative `webhooks[]` subscription in
 * `app.commerce.config.ts`, so `params` arrives as the already-parsed webhook payload
 * (`params.shippingAssignment`, `params.quote`, `params.total`).
 */
import {
  exceptionOperation,
  isWebhookSuccessful,
  ok,
  replaceOperation,
  successOperation,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  defineMetrics,
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

import { telemetryConfig } from "../telemetry.js";

const feeMetrics = defineMetrics((meter) => ({
  feeRequestsCounter: meter.createCounter(
    "checkout.totals_collector.custom_fee_requests_total",
    {
      description: "Total number of totals-collector custom fee requests.",
      valueType: ValueType.INT,
    },
  ),
}));

function collectCustomFees(params) {
  const { logger } = getInstrumentationHelpers();

  try {
    // `base_fee` is in base currency, so compare it with the base subtotal.
    const subtotal = params.total.base_subtotal;
    const fees = [];
    if (subtotal < 50) {
      fees.push({
        base_fee: 5,
        code: "small_order_fee",
        label: "Small Order Fee",
      });
    }
    if (subtotal < 100) {
      fees.push({ base_fee: 4.5, code: "handling_fee", label: "Handling Fee" });
    }

    if (!fees.length) {
      feeMetrics.feeRequestsCounter.add(1, { status: "zero" });
      return ok(successOperation());
    }

    feeMetrics.feeRequestsCounter.add(1, { status: "success" });
    return ok(replaceOperation("result/fees", fees));
  } catch (err) {
    logger.error("Error in custom-fees:", err);
    feeMetrics.feeRequestsCounter.add(1, {
      errorCode: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${err.message}`));
  }
}

export const main = instrumentEntrypoint(collectCustomFees, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
