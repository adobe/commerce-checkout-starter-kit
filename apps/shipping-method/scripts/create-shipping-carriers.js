import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";

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

function isNotFoundError(error) {
  const statusCode = error?.response?.statusCode ?? error?.response?.status;
  return statusCode === 404;
}

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
  const { logger } = context;
  const client = await getCommerceClient(resolveImsAuthParams(context.params));

  const created = [];
  for (const shippingCarrier of SHIPPING_CARRIERS) {
    const carrierCode = shippingCarrier.carrier.code;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential creation matches the monolith's original script exactly
      await client
        .post("V1/oope_shipping_carrier", { json: shippingCarrier })
        .json();
      logger.info(`Shipping carrier ${carrierCode} created`);
      created.push(carrierCode);
    } catch (error) {
      logger.error(
        `Failed to create shipping carrier ${carrierCode}: ${error.message}`,
      );
      throw error;
    }
  }

  return created;
}

/**
 * Deletes every carrier in SHIPPING_CARRIERS from the associated Commerce instance.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<void>}
 */
async function uninstallShippingCarriers(_config, context) {
  const { logger } = context;
  const client = await getCommerceClient(resolveImsAuthParams(context.params));

  for (const shippingCarrier of SHIPPING_CARRIERS) {
    const carrierCode = shippingCarrier.carrier.code;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential deletion keeps uninstall logs deterministic
      await client
        .delete(`V1/oope_shipping_carrier/${encodeURIComponent(carrierCode)}`)
        .json();
      logger.info(`Shipping carrier ${carrierCode} deleted`);
    } catch (error) {
      if (isNotFoundError(error)) {
        logger.warn(`Shipping carrier ${carrierCode} does not exist`);
        continue;
      }

      logger.error(
        `Failed to delete shipping carrier ${carrierCode}: ${error.message}`,
      );
      throw error;
    }
  }
}

export default defineCustomInstallationStep({
  install: installShippingCarriers,
  uninstall: uninstallShippingCarriers,
});
