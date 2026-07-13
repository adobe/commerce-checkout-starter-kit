import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-sdk/auth";

const TAX_INTEGRATIONS = [
  {
    tax_integration: {
      active: true,
      code: "oop-tax-integration",
      stores: ["default"],
      title: "My tax integration",
    },
  },
];

/**
 * Creates every tax integration in TAX_INTEGRATIONS on the associated Commerce instance. Runs
 * inside the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the tax integration codes successfully created
 */
async function installTaxIntegrations(_config, context) {
  const { logger } = context;
  const client = await getCommerceClient(resolveImsAuthParams(context.params));

  const created = [];
  for (const taxIntegration of TAX_INTEGRATIONS) {
    const taxIntegrationCode = taxIntegration.tax_integration.code;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential creation matches the monolith's original script exactly
      await client
        .post("V1/oope_tax_management/tax_integration", {
          json: taxIntegration,
        })
        .json();
      logger.info(`Tax integration ${taxIntegrationCode} created`);
      created.push(taxIntegrationCode);
    } catch (error) {
      logger.error(
        `Failed to create tax integration ${taxIntegrationCode}: ${error.message}`,
      );
      throw error;
    }
  }

  return created;
}

export default defineCustomInstallationStep({
  install: installTaxIntegrations,
});
