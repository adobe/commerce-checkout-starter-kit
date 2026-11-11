/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { describe, expect, test } from "vitest";

import { main } from "../../src/commerce-extensibility-1/actions/custom-fees/index.js";

const SMALL_ORDER_FEE = {
  base_fee: 5,
  code: "small_order_fee",
  label: "Small Order Fee",
};
const HANDLING_FEE = {
  base_fee: 4.5,
  code: "handling_fee",
  label: "Handling Fee",
};

function run(total) {
  return main({ ENABLE_TELEMETRY: true, total });
}

describe("custom-fees", () => {
  test.each([
    [49.99, [SMALL_ORDER_FEE, HANDLING_FEE]],
    [50, [HANDLING_FEE]],
    [99.99, [HANDLING_FEE]],
  ])("replaces result/fees for base subtotal %s", async (subtotal, fees) => {
    const result = await run({ base_subtotal: subtotal });

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      op: "replace",
      path: "result/fees",
      value: fees,
    });
  });

  test("returns success without fees from a base subtotal of 100", async () => {
    const result = await run({ base_subtotal: 100 });

    expect(result.body).toEqual({ op: "success" });
  });

  test("uses the base subtotal, not the store currency subtotal", async () => {
    const result = await run({ base_subtotal: 60, subtotal: 40 });

    expect(result.body.value).toEqual([HANDLING_FEE]);
  });

  test("returns an exception operation when total is missing", async () => {
    const result = await run(undefined);

    expect(result.body.op).toBe("exception");
  });
});
