import { getCommerceClient } from "@adobe/aio-commerce-lib-app";
import { defineCustomInstallationStep } from "@adobe/aio-commerce-lib-app/management";
import { resolveImsAuthParams } from "@adobe/aio-commerce-sdk/auth";

import { PAYMENT_METHODS } from "../src/commerce-extensibility-1/payment-methods.js";

/**
 * Creates every payment method in PAYMENT_METHODS on the associated Commerce instance. Runs
 * inside the App Management installation workflow.
 *
 * @param {object} _config the validated app.commerce.config.ts (unused by this step)
 * @param {object} context installation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<{createdPaymentMethods: string[]}>} the codes of the payment methods created
 */
async function install(_config, context) {
  const { logger, params } = context;

  logger.info("Creating payment methods...");
  const client = await getCommerceClient(resolveImsAuthParams(params));

  const createdPaymentMethods = [];
  for (const paymentMethod of PAYMENT_METHODS) {
    const paymentMethodCode = paymentMethod.payment_method.code;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: sequential creation matches the monolith's original script
      await client.post("oope_payment_method/", { json: paymentMethod }).json();
      logger.info(`Payment method ${paymentMethodCode} created`);
      createdPaymentMethods.push(paymentMethodCode);
    } catch (error) {
      logger.error(
        `Failed to create payment method ${paymentMethodCode}: ${error.message}`,
      );
      throw error;
    }
  }

  return { createdPaymentMethods };
}

export default defineCustomInstallationStep({ install });
