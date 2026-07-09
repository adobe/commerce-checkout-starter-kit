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

import config from "../app.commerce.config.ts";

describe("app.commerce.config", () => {
  test("declares only metadata — no installation steps, no adminUi, no Commerce client wiring", () => {
    expect(config.metadata).toEqual({
      description:
        "Adobe Commerce checkout starter kit discount webhook actions (cart totals collector rules).",
      displayName: "Checkout Totals Collector",
      id: "checkout-totals-collector",
      version: "1.0.0",
    });
    expect(config.installation).toBeUndefined();
    expect(config.adminUi).toBeUndefined();
  });

  test("declares exactly one webhook subscription (PaaS + SaaS variants) pointing at a single swappable default discount action, requiring Adobe auth", () => {
    expect(config.webhooks).toHaveLength(2);

    const runtimeActions = new Set(
      config.webhooks.map((entry) => entry.runtimeAction),
    );
    expect(runtimeActions).toEqual(
      new Set(["totals-collector/tiered-quantity-discount"]),
    );

    for (const entry of config.webhooks) {
      expect(entry.category).toBe("modification");
      expect(entry.requireAdobeAuth).toBe(true);
    }

    const envs = config.webhooks.map((entry) => entry.env);
    expect(envs).toEqual(expect.arrayContaining([["paas"], ["saas"]]));

    const paasEntry = config.webhooks.find((entry) => entry.env[0] === "paas");
    expect(paasEntry.webhook).toEqual({
      batch_name: "totals_collector",
      fallback_error_message:
        "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
      fields: [
        { name: "total" },
        { name: "quote" },
        { name: "shippingAssignment" },
      ],
      hook_name: "totals_collector",
      method: "POST",
      soft_timeout: 1000,
      timeout: 30_000,
      webhook_method:
        "plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute",
      webhook_type: "after",
    });

    const saasEntry = config.webhooks.find((entry) => entry.env[0] === "saas");
    expect(saasEntry.webhook).toEqual({
      ...paasEntry.webhook,
      webhook_method:
        "plugin.out_of_process_totals_collector.api.get_total_modifications.execute",
    });
  });
});
