import { allNonEmpty } from "@adobe/aio-commerce-sdk/core/params";
import aioIms from "@adobe/aio-lib-ims";

const { context, getToken } = aioIms;

/**
 * Generate access token to connect with Adobe services based on the given parameters.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<string>} returns the access token
 * @see https://developer.adobe.com/runtime/docs/guides/using/security_general/#secrets
 */
export async function getAdobeAccessToken(params) {
  const config = {
    client_id: params.OAUTH_CLIENT_ID,
    client_secrets: JSON.parse(params.OAUTH_CLIENT_SECRETS),
    env: params.AIO_CLI_ENV ?? "prod",
    ims_org_id: params.OAUTH_IMS_ORG_ID,
    scopes: JSON.parse(params.OAUTH_SCOPES),
    technical_account_email: params.OAUTH_TECHNICAL_ACCOUNT_EMAIL,
    technical_account_id: params.OAUTH_TECHNICAL_ACCOUNT_ID,
  };
  await context.set("shipping-method-creds", config);
  return getToken("shipping-method-creds", {});
}

/**
 * Generates the credentials for the Adobe services based on the given parameters.
 *
 * @param {object} params action input parameters.
 * @returns {Promise<{apiKey: string, imsOrgId: string, accessToken: string}>} the generated credentials
 */
export async function resolveCredentials(params) {
  return {
    accessToken: await getAdobeAccessToken(params),
    apiKey: params.OAUTH_CLIENT_ID,
    imsOrgId: params.OAUTH_IMS_ORG_ID,
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
      "COMMERCE_CONSUMER_KEY",
      "COMMERCE_CONSUMER_SECRET",
      "COMMERCE_ACCESS_TOKEN",
      "COMMERCE_ACCESS_TOKEN_SECRET",
    ])
  ) {
    return {
      integrationOptions: {
        accessToken: params.COMMERCE_ACCESS_TOKEN,
        accessTokenSecret: params.COMMERCE_ACCESS_TOKEN_SECRET,
        consumerKey: params.COMMERCE_CONSUMER_KEY,
        consumerSecret: params.COMMERCE_CONSUMER_SECRET,
      },
    };
  }

  if (
    allNonEmpty(params, [
      "OAUTH_CLIENT_ID",
      "OAUTH_CLIENT_SECRETS",
      "OAUTH_TECHNICAL_ACCOUNT_ID",
      "OAUTH_TECHNICAL_ACCOUNT_EMAIL",
      "OAUTH_IMS_ORG_ID",
      "OAUTH_SCOPES",
    ])
  ) {
    return { imsOptions: await resolveCredentials(params) };
  }

  throw new Error(
    "Can't resolve authentication options for the given params. " +
      "Please provide either IMS options (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRETS, OAUTH_TECHNICAL_ACCOUNT_ID, OAUTH_TECHNICAL_ACCOUNT_EMAIL, OAUTH_IMS_ORG_ID, OAUTH_SCOPES) " +
      "or Commerce integration options (COMMERCE_CONSUMER_KEY, COMMERCE_CONSUMER_SECRET, COMMERCE_ACCESS_TOKEN, COMMERCE_ACCESS_TOKEN_SECRET). ",
  );
}
