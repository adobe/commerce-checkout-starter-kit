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

import { Core } from '@adobe/aio-sdk';
import { HTTP_OK } from '../../lib/http.js';
import { getHandler } from './events-handler.js';

/**
 * Events consumer for Adobe Commerce Event provider. Routes the events through the appropriate handler according to
 * the event code.
 * @param {object} params - The input parameters for the action.
 * @returns {object} The response object
 */
export async function main(params) {
  const logger = Core.Logger('commerce-events/consume', { level: params.LOG_LEVEL || 'info' });

  // eslint-disable-next-line no-unused-vars
  const { id, type, data } = params;
  logger.debug(`Received Commerce event ${type}`);

  const handler = getHandler(type);
  if (!handler) {
    logger.warn(`Commerce event ${type} is not supported, won't be retried`);
    return {
      statusCode: HTTP_OK,
    };
  }

  const response = await handler(params);

  logger.debug('Consumed Commerce event.', { response, type });

  return response;
}
