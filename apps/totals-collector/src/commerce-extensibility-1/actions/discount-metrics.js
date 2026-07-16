/**
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for the totals-collector app's discount actions.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics shared across the 9 discount example actions. */
export const discountMetrics = defineMetrics((meter) => ({
  discountRequestsCounter: meter.createCounter(
    "checkout.totals_collector.requests_total",
    {
      description: "Total number of totals-collector discount requests.",
      valueType: ValueType.INT,
    },
  ),
}));
