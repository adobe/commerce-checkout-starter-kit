import { describe, expect, test } from "vitest";

import config from "../app.commerce.config.ts";

/**
 * Shared assertions for both PaaS and SaaS shipping-methods webhook entries — everything except
 * `env` and `webhook_method` (the PaaS/SaaS-specific fields) must be identical.
 */
function expectCommonShippingMethodsFields(entry) {
  expect(entry.runtimeAction).toBe("shipping-method/shipping-methods");
  // append, not modification: shipping-methods only ever calls addOperation.
  expect(entry.category).toBe("append");
  // require-adobe-auth: false on the deployed action (raw-http, hand-rolled signature
  // verification) — must be mirrored here or the SDK attaches unneeded
  // developer_console_oauth credentials to the Commerce subscription payload.
  expect(entry.requireAdobeAuth).toBe(false);
  expect(entry.webhook.webhook_type).toBe("after");
  expect(entry.webhook.batch_name).toBe("dps");
  expect(entry.webhook.hook_name).toBe("add_shipping_rates_dps");
  expect(entry.webhook.method).toBe("POST");
  expect(entry.webhook.timeout).toBe(5000);
  expect(entry.webhook.soft_timeout).toBe(1000);
  expect(entry.webhook.priority).toBe(100);
  expect(entry.webhook.required).toBe(true);
}

describe("app.commerce.config.ts webhooks", () => {
  test("declares exactly two shipping-methods entries, one per Commerce environment", () => {
    expect(config.webhooks).toHaveLength(2);
  });

  test("PaaS entry uses the magento-prefixed webhook_method", () => {
    const paas = config.webhooks.find((entry) => entry.env?.includes("paas"));

    expect(paas).toBeDefined();
    expect(paas.env).toEqual(["paas"]);
    expect(paas.webhook.webhook_method).toBe(
      "plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
    );
    expectCommonShippingMethodsFields(paas);
  });

  test("SaaS entry drops the magento prefix from webhook_method", () => {
    const saas = config.webhooks.find((entry) => entry.env?.includes("saas"));

    expect(saas).toBeDefined();
    expect(saas.env).toEqual(["saas"]);
    expect(saas.webhook.webhook_method).toBe(
      "plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
    );
    expectCommonShippingMethodsFields(saas);
  });
});
