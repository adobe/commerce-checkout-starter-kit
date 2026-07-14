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

  const createdPaymentMethods = await Promise.all(
    PAYMENT_METHODS.map(async (paymentMethod) => {
      const paymentMethodCode = paymentMethod.payment_method.code;
      try {
        await client
          .post("oope_payment_method/", { json: paymentMethod })
          .json();
        logger.info(`Payment method ${paymentMethodCode} created`);
        return paymentMethodCode;
      } catch (error) {
        logger.error(
          `Failed to create payment method ${paymentMethodCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );

  return { createdPaymentMethods };
}

/**
 * Deactivates every payment method in PAYMENT_METHODS on the associated Commerce instance. Runs
 * inside the App Management uninstallation workflow. Commerce has no delete endpoint for
 * out-of-process payment methods, so uninstalling means flagging them inactive instead.
 *
 * @param {object} _config the validated app.commerce.config.ts (unused by this step)
 * @param {object} context uninstallation context — `context.params` carries the IMS credentials
 *   resolved for the associated Commerce instance
 * @returns {Promise<{deactivatedPaymentMethods: string[]}>} the codes of the payment methods
 *   deactivated
 */
async function uninstall(_config, context) {
  const { logger, params } = context;

  logger.info("Deactivating payment methods...");
  const client = await getCommerceClient(resolveImsAuthParams(params));

  const deactivatedPaymentMethods = await Promise.all(
    PAYMENT_METHODS.map(async (paymentMethod) => {
      const paymentMethodCode = paymentMethod.payment_method.code;
      try {
        await client
          .post("oope_payment_method/", {
            json: {
              payment_method: {
                ...paymentMethod.payment_method,
                active: false,
              },
            },
          })
          .json();
        logger.info(`Payment method ${paymentMethodCode} deactivated`);
        return paymentMethodCode;
      } catch (error) {
        logger.error(
          `Failed to deactivate payment method ${paymentMethodCode}: ${error.message}`,
        );
        throw error;
      }
    }),
  );

  return { deactivatedPaymentMethods };
}

export default defineCustomInstallationStep({ install, uninstall });
