/**
 * Telemetry Configuration for Adobe App Builder Actions
 *
 * This file configures OpenTelemetry instrumentation using @adobe/aio-lib-telemetry.
 * @see https://github.com/adobe/aio-lib-telemetry
 */

import { HTTP_OK } from "@adobe/aio-commerce-sdk/core/responses";
import {
  defineTelemetryConfig,
  getAioRuntimeResource,
  getPresetInstrumentations,
} from "@adobe/aio-lib-telemetry";

/** The telemetry configuration to be used across all payment-method actions */
export const telemetryConfig = defineTelemetryConfig((_params, _isDev) => ({
  sdkConfig: {
    instrumentations: getPresetInstrumentations("simple"),
    resource: getAioRuntimeResource(),
    serviceName: "checkout-payment-method",
  },
}));

/**
 * Helper function to determine if a webhook response is successful.
 * Webhooks return HTTP_OK even for errors, so we check the body.op field.
 * @param {unknown} result - The result of the instrumented webhook action.
 * @returns {boolean} - True if the webhook response is successful, false otherwise.
 */
export function isWebhookSuccessful(result) {
  if (result && typeof result === "object") {
    if ("statusCode" in result && result.statusCode === HTTP_OK) {
      if ("body" in result && typeof result.body === "object") {
        return result.body.op !== "exception";
      }
      return true;
    }
    return false;
  }
  return false;
}
