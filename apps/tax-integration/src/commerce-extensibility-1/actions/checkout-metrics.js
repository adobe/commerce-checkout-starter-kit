/**
 * Checkout Metrics Definitions
 *
 * Defines OpenTelemetry metrics for the tax-integration app's actions.
 * For more information on metrics, see:
 * https://github.com/adobe/aio-lib-telemetry/blob/main/docs/usage.md#metrics
 */

import { defineMetrics } from "@adobe/aio-lib-telemetry";
import { ValueType } from "@adobe/aio-lib-telemetry/otel";

/** Metrics for tax-related actions. */
export const checkoutMetrics = defineMetrics((meter) => ({
  collectAdjustmentTaxesCounter: meter.createCounter(
    "checkout.collect_adjustment_taxes.requests_total",
    {
      description: "Total number of collect adjustment taxes requests.",
      valueType: ValueType.INT,
    },
  ),
  collectTaxesCounter: meter.createCounter(
    "checkout.collect_taxes.requests_total",
    {
      description: "Total number of collect taxes requests.",
      valueType: ValueType.INT,
    },
  ),
}));
