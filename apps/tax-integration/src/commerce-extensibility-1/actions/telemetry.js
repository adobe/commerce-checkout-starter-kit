/**
 * Telemetry Configuration for Adobe App Builder Actions
 *
 * This file configures OpenTelemetry instrumentation using @adobe/aio-lib-telemetry.
 * @see https://github.com/adobe/aio-lib-telemetry
 */

import {
  defineTelemetryConfig,
  getAioRuntimeResource,
  getPresetInstrumentations,
} from "@adobe/aio-lib-telemetry";

/** The telemetry configuration to be used across all tax-integration actions */
export const telemetryConfig = defineTelemetryConfig((_params, _isDev) => ({
  sdkConfig: {
    instrumentations: getPresetInstrumentations("simple"),
    resource: getAioRuntimeResource(),
    serviceName: "checkout-tax-integration",
  },
}));
