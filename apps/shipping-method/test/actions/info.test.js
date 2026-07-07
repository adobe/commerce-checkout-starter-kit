import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/info/index.js";

describe("commerce-checkout-starter-kit/info", () => {
  test("returns HTTP 200", () => {
    expect(main({})).toEqual({ statusCode: 200, type: "success" });
  });
});
