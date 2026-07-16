import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/collect-taxes/index.js";

// @adobe/aio-lib-telemetry's getInstrumentationHelpers() requires ENABLE_TELEMETRY on the params
// passed to the instrumented entrypoint — mirroring the ENABLE_TELEMETRY action input configured
// in ext.config.yaml. With require-adobe-auth: true (no raw-http), Runtime parses the JSON body
// directly into `params`, so `oopQuote` arrives as a top-level key, not a base64 __ow_body.
function buildParams(oopQuote) {
  return {
    ENABLE_TELEMETRY: true,
    oopQuote,
  };
}

describe("collect-taxes", () => {
  test("calculates excluding-tax breakdown and summary operations", async () => {
    const result = await main(
      buildParams({
        items: [
          {
            discount_amount: 0,
            is_tax_included: false,
            quantity: 1,
            unit_price: 100,
          },
        ],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 4.5, code: "state_tax" }),
        }),
      }),
    );
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 3.6, code: "county_tax" }),
        }),
      }),
    );
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "replace",
        path: "oopQuote/items/0/tax",
        value: expect.objectContaining({
          data: expect.objectContaining({ amount: 8.1 }),
        }),
      }),
    );
  });

  test("calculates including-tax (VAT) breakdown for tax-included items", async () => {
    const result = await main(
      buildParams({
        items: [
          {
            discount_amount: 0,
            is_tax_included: true,
            quantity: 1,
            unit_price: 100,
          },
        ],
      }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "add",
        path: "oopQuote/items/0/tax_breakdown",
        value: expect.objectContaining({
          data: expect.objectContaining({ code: "vat" }),
        }),
      }),
    );
  });

  test("returns an exception operation on unexpected error", async () => {
    const result = await main(buildParams(undefined));

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(expect.objectContaining({ op: "exception" }));
  });
});
