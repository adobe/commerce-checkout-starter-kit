/**
 * Out-of-process payment methods this app implements. Shared between the
 * create-payment-methods install step (creates these on the associated Commerce instance) and
 * the validate-payment webhook action (checks incoming payment method codes against this list).
 */
export const PAYMENT_METHODS = [
  {
    payment_method: {
      active: true,
      backend_integration_url: "http://oope-payment-method.pay/event",
      code: "method-1",
      countries: ["US"],
      currencies: ["USD"],
      custom_config: [{ key: "can_refund", value: true }],
      order_status: "processing",
      stores: ["default"],
      title: "Method one",
    },
  },
];
