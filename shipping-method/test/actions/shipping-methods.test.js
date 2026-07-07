import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/shipping-methods/index.js";

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml, which Adobe I/O Runtime merges into `params` at invocation time. With
// require-adobe-auth: true (no raw-http), Runtime parses the JSON body directly into `params`.
function buildParams(rateRequest) {
  return {
    ENABLE_TELEMETRY: true,
    rateRequest,
  };
}

describe("shipping-methods", () => {
  test("always returns the DPS base rate", async () => {
    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "12345" }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "result",
        value: expect.objectContaining({ method: "dps_shipping_one" }),
      }),
    );
  });

  test("adds a second rate for postcodes above 30000", async () => {
    const result = await main(
      buildParams({ dest_country_id: "US", dest_postcode: "40000" }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_two" }),
      }),
    );
  });

  test("adds a Canada-only rate for CA destinations", async () => {
    const result = await main(
      buildParams({ dest_country_id: "CA", dest_postcode: "12345" }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        value: expect.objectContaining({ method: "dps_shipping_ca_one" }),
      }),
    );
  });
});
