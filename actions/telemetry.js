/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { defineTelemetryConfig, getAioRuntimeResource, getPresetInstrumentations } from '@adobe/aio-lib-telemetry';
import { commerceEvents } from '@adobe/aio-lib-telemetry/integrations';
import { HTTP_OK } from '../lib/http.js';

/** The telemetry configuration to be used across all checkout actions */
const telemetryConfig = defineTelemetryConfig((params, isDev) => {
  return {
    integrations: [commerceEvents()],
    sdkConfig: {
      serviceName: 'commerce-checkout-starter-kit',
      instrumentations: getPresetInstrumentations('simple'),
      resource: getAioRuntimeResource(),
    },
    diagnostics: {
      logLevel: isDev ? 'debug' : 'info',
    },
  };
});

/**
 * Helper function to determine if a webhook response is successful.
 * Webhooks return HTTP_OK even for errors, so we check the body.op field.
 * @param {unknown} result - The result of the instrumented webhook action.
 * @returns {boolean} - True if the webhook response is successful, false otherwise.
 */
function isWebhookSuccessful(result) {
  if (result && typeof result === 'object') {
    if ('statusCode' in result && result.statusCode === HTTP_OK) {
      // Check if body contains an error operation
      if ('body' in result && typeof result.body === 'object') {
        return result.body.op !== 'exception';
      }
      return true;
    }
    return false;
  }
  return false;
}

export { telemetryConfig, isWebhookSuccessful };
