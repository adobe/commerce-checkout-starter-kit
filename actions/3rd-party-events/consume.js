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

import { Core, State } from "@adobe/aio-sdk";

import { HTTP_INTERNAL_ERROR, HTTP_OK } from "../../lib/http.js";
import { errorResponse } from "../utils.js";

/**
 * Simple action to consume 3rd party events produced by the publisher.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<object>} the response object. Note that depending on the statusCode, AdobeIO events might retry the action.
 * @see https://developer.adobe.com/events/docs/support/faq/#what-happens-if-my-webhook-is-down-why-is-my-event-registration-marked-as-unstable
 */
export async function main(params) {
  const logger = Core.Logger("3rd-party-events/consume", {
    level: params.LOG_LEVEL || "info",
  });

  // eslint-disable-next-line no-unused-vars
  const { id, type, data } = params;

  try {
    logger.info(`Consumed 3rd party event with id '${id}' of type '${type}'`);

    const state = await State.init();
    await state.put(id, JSON.stringify(data), { ttl: 5 * 60 }); // 5 minutes

    return {
      statusCode: HTTP_OK,
    };
  } catch (error) {
    logger.error(error);
    return errorResponse(HTTP_INTERNAL_ERROR, "server error", logger);
  }
}
