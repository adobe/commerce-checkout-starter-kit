import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

// biome-ignore assist/source/useSortedKeys: keep metadata at top level
export default defineConfig({
  metadata: {
    description:
      "Out-of-process tax calculation and tax-integration setup for the Adobe Commerce checkout starter kit.",
    displayName: "Checkout Tax Integration",
    id: "checkout-tax-integration",
    version: "1.0.0",
  },
  adminUi: {
    menu: {
      description: "Manage out-of-process Commerce tax classes.",
      id: "oope_tax_management",
      label: "Tax management",
    },
  },
  installation: {
    customInstallationSteps: [
      {
        description:
          "Creates the out-of-process tax integrations defined in create-tax-integrations.js.",
        name: "Create Tax Integrations",
        script: "./scripts/create-tax-integrations.js",
      },
    ],
  },
  webhooks: [
    {
      category: "modification",
      description:
        "Subscribes collect-taxes to the PaaS out-of-process tax collection webhook.",
      env: ["paas"],
      label: "Collect Taxes (PaaS)",
      requireAdobeAuth: true,
      runtimeAction: "tax-integration/collect-taxes",
      webhook: {
        batch_name: "collect_taxes",
        fallback_error_message:
          "Tax calculation failed. Please try again later.",
        hook_name: "collect_taxes",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 2000,
        timeout: 10_000,
        webhook_method:
          "plugin.magento.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
        webhook_type: "before",
      },
    },
    {
      category: "modification",
      description:
        "Subscribes collect-taxes to the SaaS out-of-process tax collection webhook.",
      env: ["saas"],
      label: "Collect Taxes (SaaS)",
      requireAdobeAuth: true,
      runtimeAction: "tax-integration/collect-taxes",
      webhook: {
        batch_name: "collect_taxes",
        fallback_error_message:
          "Tax calculation failed. Please try again later.",
        hook_name: "collect_taxes",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 2000,
        timeout: 10_000,
        webhook_method:
          "plugin.out_of_process_tax_management.api.oop_tax_collection.collect_taxes",
        webhook_type: "before",
      },
    },
    {
      category: "modification",
      description:
        "Subscribes collect-adjustment-taxes to the PaaS out-of-process credit memo tax collection webhook.",
      env: ["paas"],
      label: "Collect Adjustment Taxes (PaaS)",
      requireAdobeAuth: true,
      runtimeAction: "tax-integration/collect-adjustment-taxes",
      webhook: {
        batch_name: "collect_taxes",
        fallback_error_message:
          "Adjustment tax calculation failed. Please try again later.",
        hook_name: "collect_taxes",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 2000,
        timeout: 10_000,
        webhook_method:
          "plugin.magento.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
        webhook_type: "before",
      },
    },
    {
      category: "modification",
      description:
        "Subscribes collect-adjustment-taxes to the SaaS out-of-process credit memo tax collection webhook.",
      env: ["saas"],
      label: "Collect Adjustment Taxes (SaaS)",
      requireAdobeAuth: true,
      runtimeAction: "tax-integration/collect-adjustment-taxes",
      webhook: {
        batch_name: "collect_taxes",
        fallback_error_message:
          "Adjustment tax calculation failed. Please try again later.",
        hook_name: "collect_taxes",
        method: "POST",
        priority: 100,
        required: true,
        soft_timeout: 2000,
        timeout: 10_000,
        webhook_method:
          "plugin.out_of_process_tax_management.api.oop_credit_memo_tax_collection.collect_taxes",
        webhook_type: "before",
      },
    },
  ],
});
