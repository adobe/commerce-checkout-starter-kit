import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/filter-payment/index.js";

// See validate-payment.test.js for why ENABLE_TELEMETRY is required and why the payload arrives
// as top-level params directly (no raw-http/signature verification for this app).
function buildParams(payload = {}) {
  return {
    ENABLE_TELEMETRY: true,
    payload: { cart: { items: [] }, ...payload },
  };
}

describe("filter-payment", () => {
  test("always removes checkmo", async () => {
    const result = await main(buildParams());

    expect(result.body).toContainEqual({
      op: "add",
      path: "result",
      value: { code: "checkmo" },
    });
  });

  test("removes cashondelivery when the customer's group_id is 1", async () => {
    const result = await main(buildParams({ customer: { group_id: "1" } }));

    expect(result.body).toContainEqual({
      op: "add",
      path: "result",
      value: { code: "cashondelivery" },
    });
  });

  test("does not remove cashondelivery for other customer groups", async () => {
    const result = await main(buildParams({ customer: { group_id: "2" } }));

    expect(result.body).not.toContainEqual(
      expect.objectContaining({ value: { code: "cashondelivery" } }),
    );
  });

  test("removes banktransfer when a cart item's country_origin is China", async () => {
    const result = await main(
      buildParams({
        cart: {
          items: [{ product: { attributes: { country_origin: "China" } } }],
        },
      }),
    );

    expect(result.body).toContainEqual({
      op: "add",
      path: "result",
      value: { code: "banktransfer" },
    });
  });
});
