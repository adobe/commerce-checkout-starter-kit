import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/collect-adjustment-taxes/index.js";

function buildParams(oopCreditMemo) {
  return {
    ENABLE_TELEMETRY: true,
    oopCreditMemo,
  };
}

describe("collect-adjustment-taxes", () => {
  test("calculates refund and fee tax at the excluding-tax rate", async () => {
    const result = await main(
      buildParams({
        adjustment: { fee: 10, refund: 100 },
        items: [{ is_tax_included: false }],
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "replace",
        path: "oopCreditMemo/adjustment/refund_tax",
        value: 8.1,
      }),
    );
    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "replace",
        path: "oopCreditMemo/adjustment/fee_tax",
        value: 0.81,
      }),
    );
  });

  test("uses the including-tax rate when any item has tax included", async () => {
    const result = await main(
      buildParams({
        adjustment: { refund: 100 },
        items: [{ is_tax_included: true }],
      }),
    );

    expect(result.body).toContainEqual(
      expect.objectContaining({
        op: "replace",
        path: "oopCreditMemo/adjustment/refund_tax",
        value: 8.4,
      }),
    );
  });

  test("skips refund/fee tax operations that aren't present", async () => {
    const result = await main(
      buildParams({ adjustment: {}, items: [{ is_tax_included: false }] }),
    );

    expect(result.body).toEqual([]);
  });

  test("returns an exception operation for invalid oopCreditMemo data", async () => {
    const result = await main(buildParams({ items: undefined }));

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual(
      expect.objectContaining({
        message: "Invalid or missing oopCreditMemo data",
        op: "exception",
      }),
    );
  });
});
