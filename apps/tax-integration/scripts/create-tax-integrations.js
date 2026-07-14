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
  const { logger, params } = context;
  const client = await getCommerceClient(resolveImsAuthParams(params));

  return Promise.all(
    TAX_INTEGRATIONS.map(async (taxIntegration) => {
      const taxIntegrationCode = taxIntegration.tax_integration.code;
      try {
        await client
          .post("oope_tax_management/tax_integration", {
            json: taxIntegration,
          })
          .json();
        logger.info(`Tax integration ${taxIntegrationCode} created`);
        return taxIntegrationCode;
      } catch (error) {
        logger.error(
          `Failed to create tax integration ${taxIntegrationCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );
}

/**
 * Deactivates every tax integration in TAX_INTEGRATIONS on the associated Commerce instance. Runs
 * inside the App Management uninstallation workflow. Commerce has no delete endpoint for
 * out-of-process tax integrations, so uninstalling means flagging them inactive instead.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context uninstallation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the tax integration codes successfully deactivated
 */
async function uninstallTaxIntegrations(_config, context) {
  const { logger, params } = context;
  const client = await getCommerceClient(resolveImsAuthParams(params));

  return Promise.all(
    TAX_INTEGRATIONS.map(async (taxIntegration) => {
      const taxIntegrationCode = taxIntegration.tax_integration.code;
      try {
        await client
          .post("oope_tax_management/tax_integration", {
            json: {
              tax_integration: {
                ...taxIntegration.tax_integration,
                active: false,
              },
            },
          })
          .json();
        logger.info(`Tax integration ${taxIntegrationCode} deactivated`);
        return taxIntegrationCode;
      } catch (error) {
        logger.error(
          `Failed to deactivate tax integration ${taxIntegrationCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );
}

export default defineCustomInstallationStep({
  install: installTaxIntegrations,
  uninstall: uninstallTaxIntegrations,
});
