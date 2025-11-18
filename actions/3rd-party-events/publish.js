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

import { Core, Events } from "@adobe/aio-sdk";
import { CloudEvent } from "cloudevents";
import { v4 as uuidv4 } from "uuid";

import { resolveCredentials } from "../../lib/adobe-auth.js";
import { HTTP_INTERNAL_ERROR, HTTP_OK } from "../../lib/http.js";
import { decode as keyValueDecode } from "../../lib/key-values.js";
import { errorResponse } from "../utils.js";

/**
 * This is a web action to publish 3rd party events to an already created event provider in Adobe Events.
 * Note that this action should be annotated with `require-adobe-auth: false` in the manifest file since it relies
 * on a custom authentication mechanism which may vary depending on the source system
 *
 * @param {object} params action input parameters.
 * @returns {Promise<object>} the response object
 */
export async function main(params) {
  const logger = Core.Logger("3rd-party-events/publish", {
    level: params.LOG_LEVEL || "info",
  });

  try {
    const authError = validateCustomAuthRequest(params);
    if (authError) {
      return errorResponse(401, authError, logger);
    }

    logger.info(params);
    // Event validation
    const { event } = params;
    if (!event) {
      return errorResponse(400, "Missing event property", logger);
    }

    const { type, data } = event;
    if (!type) {
      return errorResponse(400, "Missing event.type property", logger);
    }
    if (!data) {
      return errorResponse(400, "Missing event.data property", logger);
    }

    const { "3rd_party_custom_events": providerId } = keyValueDecode(
      params.AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING,
    );
    if (!providerId) {
      return errorResponse(
        HTTP_INTERNAL_ERROR,
        "Can not find provider id in AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING",
        logger,
      );
    }

    logger.info(`Received 3rd party event of type '${type}'`);

    // Publish event
    const cloudEvent = new CloudEvent({
      id: uuidv4(),
      source: `urn:uuid:${providerId}`,
      datacontenttype: "application/json",
      type,
      data,
    });

    const { imsOrgId, apiKey, accessToken } = await resolveCredentials(params);
    const eventsClient = await Events.init(imsOrgId, apiKey, accessToken);
    await eventsClient.publishEvent(cloudEvent);

    logger.info(
      `Ingested 3rd party event with id '${cloudEvent.id}' of type '${cloudEvent.type}'`,
    );
    return {
      statusCode: HTTP_OK,
      body: {
        cloudEvent,
      },
    };
  } catch (error) {
    logger.error(error);
    return errorResponse(HTTP_INTERNAL_ERROR, "server error", logger);
  }
}

/**
 * If the 3rd party system is not able to handle the Oauth token generation it is probably using a custom authentication
 * mechanism, this function should be used to validate the request.
 *
 * @param {object} params the parameters received by the action
 * @returns {string} an error message if the request is not authenticated
 */
function validateCustomAuthRequest(params) {
  const {
    __ow_headers: { authorization },
  } = params;

  // The implementation of this function will be vendor specific, could involve checking a custom header, a custom
  // token, etc. As an example, we just check that the Authorization header is present
  if (!authorization) {
    return "Missing Authorization header";
  }

  return;
}
