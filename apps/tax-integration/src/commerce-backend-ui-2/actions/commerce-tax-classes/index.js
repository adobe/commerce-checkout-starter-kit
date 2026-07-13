import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { forwardImsAuthProvider } from "@adobe/aio-commerce-sdk/auth";
import { ok } from "@adobe/aio-commerce-sdk/core/responses";

const SUPPORTED_METHODS = new Set(["GET", "POST"]);

/**
 * Proxies Commerce REST calls for the Tax management Admin UI, forwarding the caller's own IMS
 * bearer token — never this app's own association credentials — to a Commerce client resolved
 * from this app's stored association. No COMMERCE_BASE_URL input is needed: the instance URL
 * comes from the association, not from action config.
 * @param {object} params action input parameters.
 * @returns {Promise<object>} returns a response object
 */
export async function main(params) {
  const { operation, method = "GET", payload = null } = params;
  const httpMethod = method.toUpperCase();

  if (!SUPPORTED_METHODS.has(httpMethod)) {
    return {
      body: { message: `Method ${httpMethod} not allowed` },
      statusCode: 405,
    };
  }

  let authProvider;
  try {
    authProvider = forwardImsAuthProvider(params);
  } catch (error) {
    return { body: { message: error.message }, statusCode: 400 };
  }

  try {
    const client = await getCommerceClient(authProvider);
    const response =
      httpMethod === "GET"
        ? await client.get(`V1/${operation}`).json()
        : await client.post(`V1/${operation}`, { json: payload }).json();

    return ok({ body: response });
  } catch (error) {
    return {
      body: { message: `Commerce request failed: ${error.message}` },
      statusCode: 500,
    };
  }
}
