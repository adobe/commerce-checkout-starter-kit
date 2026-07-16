import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

// biome-ignore assist/source/useSortedKeys: keep metadata at top level
export default defineConfig({
  metadata: {
    description:
      "Out-of-process shipping methods and carrier setup for the Adobe Commerce checkout starter kit.",
    displayName: "Checkout Shipping Method",
    id: "checkout-shipping-method",
    version: "1.0.0",
  },
  installation: {
    customInstallationSteps: [
      {
        description:
          "Creates the out-of-process shipping carriers defined in create-shipping-carriers.js.",
        name: "Create Shipping Carriers",
        script: "./scripts/create-shipping-carriers.js",
      },
    ],
  },
  webhooks: [
    {
      category: "append",
      description:
        "Adds out-of-process DPS shipping rates to the cart's available shipping methods (PaaS).",
      env: ["paas"],
      label: "Add DPS Shipping Rates (PaaS)",
      requireAdobeAuth: true,
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
      category: "append",
      description:
        "Adds out-of-process DPS shipping rates to the cart's available shipping methods (SaaS).",
      env: ["saas"],
      label: "Add DPS Shipping Rates (SaaS)",
      requireAdobeAuth: true,
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
