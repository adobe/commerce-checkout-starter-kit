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
});
