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

import aioIms from '@adobe/aio-lib-ims';
import { allNonEmpty } from './params.js';

const { context, getToken } = aioIms;

/**
 * Generate access token to connect with Adobe services based on the given parameters.
 * Note these credentials are now retrieved from the action parameters but in a real-world scenario they should be treated
 * as secrets and stored in a dedicated secret manager.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<string>} returns the access token
 * @see https://developer.adobe.com/runtime/docs/guides/using/security_general/#secrets
 */
export async function getAdobeAccessToken(params) {
  const config = {
    client_id: params.AIO_COMMERCE_AUTH_IMS_CLIENT_ID,
    client_secrets: JSON.parse(params.AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS),
    technical_account_id: params.AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID,
    technical_account_email: params.AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL,
    ims_org_id: params.AIO_COMMERCE_AUTH_IMS_ORG_ID,
    scopes: JSON.parse(params.AIO_COMMERCE_AUTH_IMS_SCOPES),
    env: params.AIO_CLI_ENV ?? 'prod',
  };
  await context.set('commerce-starter-kit-creds', config);
  return getToken('commerce-starter-kit-creds', {});
}

/**
 * Generates the credentials for the Adobe services based on the given parameters.
 * Note these credentials are now retrieved from the action parameters but in a real-world scenario they should be treated
 * as secrets and stored in a dedicated secret manager.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<{apiKey: string, imsOrgId: string, accessToken: string}>} the generated credentials
 */
export async function resolveCredentials(params) {
  return {
    accessToken: await getAdobeAccessToken(params),
    imsOrgId: params.AIO_COMMERCE_AUTH_IMS_ORG_ID,
    apiKey: params.AIO_COMMERCE_AUTH_IMS_CLIENT_ID,
  };
}

/**
 * Resolve the authentication options based on the provided parameters.
 * Note that Commerce integration options is preferred over IMS authentication options.
 * @param {object} params action input parameters.
 * @returns {Promise<{imsOptions: object}|{integrationOptions: object}>} returns the resolved authentication options
 * @throws {Error} if neither Commerce integration options nor IMS options are provided as params
 */
export async function resolveAuthOptions(params) {
  if (
    allNonEmpty(params, [
      'AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_KEY',
      'AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_SECRET',
      'AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN',
      'AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN_SECRET',
    ])
  ) {
    return {
      integrationOptions: {
        consumerKey: params.AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_KEY,
        consumerSecret: params.AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_SECRET,
        accessToken: params.AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN,
        accessTokenSecret: params.AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN_SECRET,
      },
    };
  }

  if (
    allNonEmpty(params, [
      'AIO_COMMERCE_AUTH_IMS_CLIENT_ID',
      'AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS',
      'AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID',
      'AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL',
      'AIO_COMMERCE_AUTH_IMS_ORG_ID',
      'AIO_COMMERCE_AUTH_IMS_SCOPES',
    ])
  ) {
    return { imsOptions: await resolveCredentials(params) };
  }

  throw new Error(
    "Can't resolve authentication options for the given params. " +
      'Please provide either IMS options (AIO_COMMERCE_AUTH_IMS_CLIENT_ID, AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS, AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID, AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL, AIO_COMMERCE_AUTH_IMS_ORG_ID, AIO_COMMERCE_AUTH_IMS_SCOPES) ' +
      'or Commerce integration options (AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_KEY, AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_SECRET, AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN, AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN_SECRET). ' +
      'See https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/connect/#authentication for additional details.'
  );
}
