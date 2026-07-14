import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-sdk/auth";

const SHIPPING_CARRIERS = [
  {
    carrier: {
      active: true,
      code: "DPS",
      countries: ["US", "CA"],
      shipping_labels_available: true,
      sort_order: 10,
      stores: ["default"],
      title: "Demo Postal Service",
      tracking_available: true,
    },
  },
  {
    carrier: {
      active: true,
      code: "Fedex",
      countries: ["US"],
      shipping_labels_available: true,
      sort_order: 50,
      stores: ["default"],
      title: "Fedex Service",
      tracking_available: false,
    },
  },
];

/**
 * Creates every carrier in SHIPPING_CARRIERS on the associated Commerce instance. Runs inside
 * the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the carrier codes successfully created
 */
async function installShippingCarriers(_config, context) {
  const { logger, params } = context;
  const client = await getCommerceClient(resolveImsAuthParams(params));

  return Promise.all(
    SHIPPING_CARRIERS.map(async (shippingCarrier) => {
      const carrierCode = shippingCarrier.carrier.code;
      try {
        await client
          .post("oope_shipping_carrier", { json: shippingCarrier })
          .json();
        logger.info(`Shipping carrier ${carrierCode} created`);
        return carrierCode;
      } catch (error) {
        logger.error(
          `Failed to create shipping carrier ${carrierCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );
}

/**
 * Deactivates every carrier in SHIPPING_CARRIERS on the associated Commerce instance. Runs
 * inside the App Management uninstallation workflow. Commerce has no delete endpoint for
 * out-of-process shipping carriers, so uninstalling means flagging them inactive instead.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context uninstallation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the carrier codes successfully deactivated
 */
async function uninstallShippingCarriers(_config, context) {
  const { logger, params } = context;
  const client = await getCommerceClient(resolveImsAuthParams(params));

  return Promise.all(
    SHIPPING_CARRIERS.map(async (shippingCarrier) => {
      const carrierCode = shippingCarrier.carrier.code;
      try {
        await client
          .post("oope_shipping_carrier", {
            json: { carrier: { ...shippingCarrier.carrier, active: false } },
          })
          .json();
        logger.info(`Shipping carrier ${carrierCode} deactivated`);
        return carrierCode;
      } catch (error) {
        logger.error(
          `Failed to deactivate shipping carrier ${carrierCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );
}

export default defineCustomInstallationStep({
  install: installShippingCarriers,
  uninstall: uninstallShippingCarriers,
});
