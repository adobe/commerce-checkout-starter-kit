import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/validate-payment/index.js";

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml, which Adobe I/O Runtime merges into `params` at invocation time. With
// require-adobe-auth: true, Commerce's webhook fields arrive directly as top-level params, already
// parsed — no raw-http/signature verification here.
function buildParams(overrides = {}) {
  return {
    COMMERCE_PAYMENT_METHOD_CODES: JSON.stringify(["method-1"]),
    ENABLE_TELEMETRY: true,
    ...overrides,
  };
}

describe("validate-payment", () => {
  test("returns a success operation for valid payment information", async () => {
    const result = await main(
      buildParams({
        payment_additional_information: { token: "abc" },
        payment_method: "method-1",
      }),
    );

    expect(result.body).toEqual({ op: "success" });
  });

  test("returns a success operation when the payment method isn't handled by this app", async () => {
    const result = await main(
      buildParams({
        payment_additional_information: { token: "abc" },
        payment_method: "not-configured",
      }),
    );

    expect(result.body).toEqual({ op: "success" });
  });

  test("returns an exception operation when payment_additional_information is missing", async () => {
    const result = await main(
      buildParams({
        payment_method: "method-1",
      }),
    );

    expect(result.body).toEqual({
      message: "payment_additional_information not found in the request",
      op: "exception",
    });
  });
});
