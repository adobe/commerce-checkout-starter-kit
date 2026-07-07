import { describe, expect, test, vi } from "vitest";

vi.mock(
  "../../src/commerce-extensibility-1/actions/shipping-methods/webhook.js",
  () => ({
    webhookVerify: vi.fn(),
  }),
);

const { webhookVerify } = await import(
  "../../src/commerce-extensibility-1/actions/shipping-methods/webhook.js"
);
const { main } = await import(
  "../../src/commerce-extensibility-1/actions/shipping-methods/index.js"
);

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml, which Adobe I/O Runtime merges into `params` at invocation time.
function buildParams(rateRequest) {
  return {
    __ow_body: btoa(JSON.stringify({ rateRequest })),
    ENABLE_TELEMETRY: true,
  };
}

describe("shipping-methods", () => {
  test("returns an exception operation when the signature is invalid", async () => {
    webhookVerify.mockReturnValue({ error: "bad signature", success: false });

    const result = await main(buildParams({}));

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      message: expect.stringContaining("bad signature"),
      op: "exception",
    });
  });

  test("always returns the DPS base rate", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "12345" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "result",
        value: expect.objectContaining({ method: "dps_shipping_one" }),
      }),
    );
  });

  test("adds a second rate for postcodes above 30000", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "40000" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_two" }),
      }),
    );
  });

  test("adds a Canada-only rate for CA destinations", async () => {
    webhookVerify.mockReturnValue({ success: true });

    const result = await main(
      buildParams({ dest_country_id: "CA", dest_postcode: "12345" }),
    );

    const operations = JSON.parse(result.body);
    expect(operations).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_ca_one" }),
      }),
    );
  });
});
