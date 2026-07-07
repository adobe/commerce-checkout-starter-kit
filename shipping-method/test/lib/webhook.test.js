import crypto from "node:crypto";

import { describe, expect, test } from "vitest";

import { webhookVerify } from "../../lib/webhook.js";

describe("webhookVerify", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 512,
  });
  const body = JSON.stringify({ test: "data" });
  const signature = crypto
    .createSign("SHA256")
    .update(body)
    .sign(privateKey, "base64");

  test("returns success true for a valid signature", () => {
    const params = {
      __ow_body: body,
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({ success: true });
  });

  test("returns success false when the signature header is missing", () => {
    const params = {
      __ow_body: body,
      __ow_headers: {},
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      error: expect.any(String),
      success: false,
    });
  });

  test("returns success false when the body is missing", () => {
    const params = {
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      error: expect.any(String),
      success: false,
    });
  });

  test("returns success false when the public key is missing", () => {
    const params = {
      __ow_body: body,
      __ow_headers: { "x-adobe-commerce-webhook-signature": signature },
    };

    expect(webhookVerify(params)).toEqual({
      error: expect.any(String),
      success: false,
    });
  });

  test("returns success false for an invalid signature", () => {
    const params = {
      __ow_body: body,
      __ow_headers: { "x-adobe-commerce-webhook-signature": "invalid" },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    expect(webhookVerify(params)).toEqual({
      error: expect.any(String),
      success: false,
    });
  });
});
