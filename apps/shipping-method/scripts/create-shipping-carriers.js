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

/**
 * Creates every carrier in SHIPPING_CARRIERS on the associated Commerce instance. Runs inside
 * the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the carrier codes successfully created
 */
export default defineCustomInstallationStep(async (_config, context) => {
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
      logger.warn(
        `Failed to create shipping carrier ${carrierCode}: ${error.message}`,
      );
    }
  }

  return created;
});
