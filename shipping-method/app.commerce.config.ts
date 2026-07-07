import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  installation: {
    customInstallationSteps: [
      {
        description:
          "Creates the out-of-process shipping carriers defined in shipping-carriers.yaml.",
        name: "Create Shipping Carriers",
        script: "./scripts/create-shipping-carriers.js",
      },
    ],
  },
  metadata: {
    description:
      "Out-of-process shipping methods and carrier setup for the Adobe Commerce checkout starter kit.",
    displayName: "Checkout Shipping Method",
    id: "checkout-shipping-method",
    version: "1.0.0",
  },
  webhooks: [
    {
      // "append", not "modification": shipping-methods only ever calls addOperation (never
      // replaceOperation/removeOperation) — see src/commerce-extensibility-1/actions/shipping-methods/index.js.
      category: "append",
      description:
        "Adds out-of-process DPS shipping rates to the cart's available shipping methods (PaaS).",
      env: ["paas"],
      label: "Add DPS Shipping Rates (PaaS)",
      // Mirrors this action's require-adobe-auth: false annotation (see
      // src/commerce-extensibility-1/ext.config.yaml) — it's a raw-http action authenticated via
      // Commerce's own webhook signature, not Adobe IMS, so the SDK must not attach
      // developer_console_oauth credentials to the subscription it creates in Commerce.
      requireAdobeAuth: false,
      runtimeAction: "shipping-method/shipping-methods",
      webhook: {
        batch_name: "dps",
        hook_name: "add_shipping_rates_dps",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 1000,
        timeout: 5000,
        webhook_method:
          "plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
        webhook_type: "after",
      },
    },
    {
      // "append", not "modification": shipping-methods only ever calls addOperation (never
      // replaceOperation/removeOperation) — see src/commerce-extensibility-1/actions/shipping-methods/index.js.
      category: "append",
      description:
        "Adds out-of-process DPS shipping rates to the cart's available shipping methods (SaaS).",
      env: ["saas"],
      label: "Add DPS Shipping Rates (SaaS)",
      requireAdobeAuth: false,
      runtimeAction: "shipping-method/shipping-methods",
      webhook: {
        batch_name: "dps",
        hook_name: "add_shipping_rates_dps",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 1000,
        timeout: 5000,
        webhook_method:
          "plugin.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates",
        webhook_type: "after",
      },
    },
  ],
});
