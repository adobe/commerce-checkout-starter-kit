import crypto from "node:crypto";

/**
 * Verifies the signature of the webhook request.
 * @param {object} params input parameters
 * @param {object} params.__ow_headers request headers
 * @param {string} params.__ow_body request body, requires the following annotation in the action `raw-http: true`
 * @param {string} params.COMMERCE_WEBHOOKS_PUBLIC_KEY the public key to verify the signature configured in the Commerce instance
 * @returns {{success: boolean}|{success: boolean, error: string}} weather the signature is valid or not
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification
 */
export function webhookVerify({
  __ow_headers: headers = {},
  __ow_body: body,
  COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
}) {
  const signature = headers["x-adobe-commerce-webhook-signature"];
  if (!signature) {
    return {
      error:
        "Header `x-adobe-commerce-webhook-signature` not found. Make sure Webhooks signature is enabled in the Commerce instance.",
      success: false,
    };
  }
  if (!body) {
    return {
      error:
        "Request body not found. Make sure the the action is configured with `raw-http: true`.",
      success: false,
    };
  }
  if (!publicKey) {
    return {
      error:
        "Public key not found. Make sure the the action is configured with the input `COMMERCE_WEBHOOKS_PUBLIC_KEY` and it is defined in .env file.",
      success: false,
    };
  }

  const verifier = crypto.createVerify("SHA256");
  verifier.update(body);
  const success = verifier.verify(publicKey, signature, "base64");
  return {
    success,
    ...(!success && { error: "Signature verification failed." }),
  };
}
