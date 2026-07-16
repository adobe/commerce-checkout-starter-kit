/**
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for the payment-method app's actions.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for payment-related actions. */
export const checkoutMetrics = defineMetrics((meter) => ({
  filterPaymentCounter: meter.createCounter(
    "checkout.filter_payment.requests_total",
    {
      description: "Total number of filter payment requests.",
      valueType: ValueType.INT,
    },
  ),
  validatePaymentCounter: meter.createCounter(
    "checkout.validate_payment.requests_total",
    {
      description: "Total number of validate payment requests.",
      valueType: ValueType.INT,
    },
  ),
}));
