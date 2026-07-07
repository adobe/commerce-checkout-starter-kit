/**
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for the shipping-method app's actions.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for shipping-related actions. */
export const checkoutMetrics = defineMetrics((meter) => ({
  shippingMethodsCounter: meter.createCounter(
    "checkout.shipping_methods.requests_total",
    {
      description: "Total number of shipping methods requests.",
      valueType: ValueType.INT,
    },
  ),
}));
