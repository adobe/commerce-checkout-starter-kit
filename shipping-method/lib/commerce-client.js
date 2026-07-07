import crypto from "node:crypto";

import { HTTP_INTERNAL_SERVER_ERROR } from "@adobe/aio-commerce-sdk/core/responses";
import got from "got";
import Oauth1a from "oauth-1.0a";

import { resolveAuthOptions } from "./adobe-auth.js";

/**
 * Minimal console-based logger, gated by level. Used instead of `@adobe/aio-sdk`'s `Core.Logger`
 * because this dev-only legacy client only needs `debug`/`error` and keeping it dependency-free
 * avoids pulling in a package this app doesn't otherwise need.
 *
 * @param {string} level the minimum level to log at ("debug" enables debug output)
 * @returns {{debug: Function, error: Function}} a minimal logger
 */
function createLogger(level) {
  const debugEnabled = level === "debug";
  return {
    debug: (...args) => {
      if (debugEnabled) {
        console.debug(...args);
      }
    },
    error: (...args) => console.error(...args),
  };
}

/**
 * Provides an instance of the Commerce HTTP client
 *
 * @param {string} commerceUrl Base URL of the Commerce API
 * @param {object} options Configuration options for the client
 * @param {object} [options.integrationOptions] Integration options for OAuth1.0a
 * @param {object} [options.imsOptions] IMS options for bearer token authentication
 * @param {object} options.logger Logger instance for logging requests
 * @returns {Promise<object>} Configured Got instance for making HTTP requests
 */
function getCommerceHttpClient(
  commerceUrl,
  { integrationOptions, imsOptions, logger },
) {
  if (!commerceUrl) {
    throw new Error("Commerce URL must be provided");
  }

  const commerceGot = got.extend({
    headers: {
      "Content-Type": "application/json",
    },
    hooks: {
      beforeError: [
        (error) => {
          const { response } = error;
          if (response?.body) {
            error.responseBody = response.body;
          }
          return error;
        },
      ],
      beforeRequest: [
        (options) => logger.debug(`Request [${options.method}] ${options.url}`),
      ],
    },
    http2: true,
    prefixUrl: commerceUrl,
    responseType: "json",
  });

  if (integrationOptions) {
    logger.debug("Using Commerce client with integration options");
    const oauth1aHeaders = oauth1aHeadersProvider(integrationOptions);

    return commerceGot.extend({
      handlers: [
        (options, next) => {
          options.headers = {
            ...options.headers,
            ...oauth1aHeaders(options.url.toString(), options.method),
          };
          return next(options);
        },
      ],
    });
  }

  logger.debug("Using Commerce client with IMS options");
  return commerceGot.extend({
    headers: {
      Authorization: `Bearer ${imsOptions.accessToken}`,
      "x-api-key": imsOptions.apiKey,
      "x-ims-org-id": imsOptions.imsOrgId,
    },
  });
}

/**
 * Generates OAuth1.0a headers for the given integration options
 *
 * @param {object} integrationOptions Options for OAuth1.0a
 * @returns {Function} Function that returns OAuth1.0a headers for a given URL and method
 */
function oauth1aHeadersProvider(integrationOptions) {
  const oauth = Oauth1a({
    consumer: {
      key: integrationOptions.consumerKey,
      secret: integrationOptions.consumerSecret,
    },
    hash_function: (baseString, key) =>
      crypto.createHmac("sha256", key).update(baseString).digest("base64"),
    signature_method: "HMAC-SHA256",
  });

  const oauthToken = {
    key: integrationOptions.accessToken,
    secret: integrationOptions.accessTokenSecret,
  };

  return (url, method) =>
    oauth.toHeader(oauth.authorize({ method, url }, oauthToken));
}

/**
 * Initializes the Commerce client according to the given params. Legacy dev-only client, used by
 * `scripts/get-shipping-carriers.js`. Not used by the App Management install step (that uses
 * `getCommerceClient` from `@adobe/aio-commerce-lib-app`, see `scripts/create-shipping-carriers.js`).
 *
 * @param {object} params to initialize the client
 * @returns {Promise<object>} the available api calls
 */
export async function getAdobeCommerceClient(params) {
  const logger = createLogger(params.LOG_LEVEL ?? "info");
  const options = {
    logger,
    ...(await resolveAuthOptions(params)),
  };

  const commerceGot = await getCommerceHttpClient(
    params.COMMERCE_BASE_URL ?? process.env.COMMERCE_BASE_URL,
    options,
  );

  const wrapper = async (callable) => {
    try {
      const message = await callable();
      return { message, success: true };
    } catch (e) {
      if (e.code === "ERR_GOT_REQUEST_ERROR") {
        logger.error("Error while calling Commerce API", e);
        return {
          message: `Unexpected error, check logs. Original error "${e.message}"`,
          statusCode: HTTP_INTERNAL_SERVER_ERROR,
          success: false,
        };
      }
      return {
        body: e.responseBody,
        message: e.message,
        statusCode: e.response?.statusCode || HTTP_INTERNAL_SERVER_ERROR,
        success: false,
      };
    }
  };

  return {
    // Out-of-process Shipping API: https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-reference/
    createOopeShippingCarrier: async (shippingCarrier) =>
      wrapper(() =>
        commerceGot("V1/oope_shipping_carrier", {
          json: shippingCarrier,
          method: "POST",
        }).json(),
      ),
    getOopeShippingCarrier: async (shippingCarrierCode) =>
      wrapper(() =>
        commerceGot(`V1/oope_shipping_carrier/${shippingCarrierCode}`, {
          method: "GET",
        }).json(),
      ),
    getOopeShippingCarriers: async () =>
      wrapper(() =>
        commerceGot("V1/oope_shipping_carrier/", {
          method: "GET",
        }).json(),
      ),
  };
}
