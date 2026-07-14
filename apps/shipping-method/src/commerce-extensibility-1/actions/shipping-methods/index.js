import {
  addOperation,
  exceptionOperation,
  isWebhookSuccessful,
  ok,
} from "@adobe/aio-commerce-sdk/webhooks/responses";
import {
  getInstrumentationHelpers,
  instrumentEntrypoint,
} from "@adobe/aio-lib-telemetry";

import { checkoutMetrics } from "../checkout-metrics.js";
import { telemetryConfig } from "../telemetry.js";

/**
 * This action returns the list of out-of-process shipping methods for the given request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params the input parameters
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
function shippingMethods(params) {
  const { logger } = getInstrumentationHelpers();

  logger.debug("Starting shipping methods process");

  try {
    const { rateRequest: request } = params;

    const {
      dest_country_id: destCountryId = "US",
      dest_postcode: destPostcode = "12345",
    } = request;

    logger.info("Received request: ", request);

    const operations = [];

    operations.push(
      addOperation("result", {
        additional_data: [
          { key: "additional_data_key", value: "additional_data_value" },
          { key: "additional_data_key2", value: "additional_data_value2" },
          { key: "additional_data_key3", value: "additional_data_value3" },
        ],
        carrier_code: "DPS",
        cost: 17,
        method: "dps_shipping_one",
        method_title: "Demo Custom Shipping One",
        price: 17,
      }),
    );

    // Based on the postal code, we can add another shipping method
    if (destPostcode > 30_000) {
      operations.push(
        addOperation("result", {
          additional_data: {
            key: "additional_data_key",
            value: "additional_data_value",
          },
          carrier_code: "DPS",
          cost: 18,
          method: "dps_shipping_two",
          method_title: "Demo Custom Shipping Two",
          price: 18,
        }),
      );
    }

    // Based on the country we can add another shipping method
    if (destCountryId === "CA") {
      operations.push(
        addOperation("result", {
          additional_data: {
            key: "additional_data_key",
            value: "additional_data_value",
          },
          carrier_code: "DPS",
          cost: 18,
          method: "dps_shipping_ca_one",
          method_title: "Demo Custom Shipping for Canada only",
          price: 18,
        }),
      );
    }

    // The shipping method can be added based on product custom attribute values.
    // In the next example, the shipping method is added if any of `country_origin` attributes is equal to China
    // The additional data based on attributes or another logic can be added to the shipping method as
    // part of the additional_data key-value array
    const { all_items: cartItems = [] } = request;

    for (const cartItem of cartItems) {
      const { country_origin: country = "" } =
        cartItem?.product?.attributes ?? {};

      if (country.toLowerCase() === "china") {
        operations.push(
          addOperation("result", {
            additional_data: [
              { key: "shipped_from", value: "China" },
              { key: "delivery_time", value: "15 days" },
            ],
            carrier_code: "DPS",
            cost: 230,
            method: "dps_shipping_from_china",
            method_title: "Demo Custom Shipping country origin China",
            price: 230,
          }),
        );
      }
    }

    // If the Commerce customer is logged in, the request contains customer data otherwise the customer is set to null
    // In the next example, the shipping method is added based on the Customer group id
    const { customer: Customer = {} } = request;

    if (
      Customer !== null &&
      typeof Customer === "object" &&
      Object.hasOwn(Customer, "group_id") &&
      Customer.group_id === "1"
    ) {
      operations.push(
        addOperation("result", {
          additional_data: [{ key: "group_special", value: "-20%" }],
          carrier_code: "DPS",
          cost: 7,
          method: "dps_shipping_customer_group_one",
          method_title: "Demo Custom Shipping based on customer group",
          price: 7,
        }),
      );
    }

    // You can remove the shipping method based on some conditions.
    // For this, provide the method name within the remove flag set to true
    //
    // operations.push({
    //   op: 'add',
    //   path: 'result',
    //   value: {
    //     method: 'flatrate',
    //     remove: true,
    //   },
    // });

    logger.info(`Generated ${operations.length} shipping method operations`);

    checkoutMetrics.shippingMethodsCounter.add(1, { status: "success" });

    return ok(operations);
  } catch (error) {
    logger.error("Error in shipping methods:", error);
    checkoutMetrics.shippingMethodsCounter.add(1, {
      errorCode: "exception",
      status: "error",
    });
    return ok(exceptionOperation(`Server error: ${error.message}`));
  }
}

// Export the instrumented function as main
export const main = instrumentEntrypoint(shippingMethods, {
  ...telemetryConfig,
  isSuccessful: isWebhookSuccessful,
});
