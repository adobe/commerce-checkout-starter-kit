import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-lib-auth";
import { load } from "js-yaml";

const SHIPPING_CARRIERS_YAML = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../shipping-carriers.yaml",
);

/**
 * Creates every shipping carrier defined in shipping-carriers.yaml on the associated Commerce
 * instance. Runs inside the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<string[]>} the carrier codes successfully created
 */
export default defineCustomInstallationStep(async (_config, context) => {
  const { logger } = context;
  const client = await getCommerceClient(resolveImsAuthParams(context.params));

  logger.info("Reading shipping-carriers.yaml...");
  const { shipping_carriers: carriers } = load(
    readFileSync(SHIPPING_CARRIERS_YAML, "utf8"),
  );

  const created = [];
  for (const shippingCarrier of carriers) {
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
