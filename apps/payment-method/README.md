# Checkout Payment Method

Out-of-process payment method validation and filtering for the Adobe Commerce checkout starter
kit, built as an independent Adobe Commerce App Management app.

See the [payment use-cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-use-cases/)
for the business context, and the App Management docs for install, build/deploy, and association.

## Configure payment methods

Edit the `PAYMENT_METHODS` array in `scripts/create-payment-methods.js`, then run the app's install
flow — the `Create Payment Methods` custom installation step creates them on the associated
Commerce instance automatically. After they're created, set `COMMERCE_PAYMENT_METHOD_CODES` to the
codes you defined, e.g. `["your-payment-code"]` — this is what `validate-payment` checks incoming
webhook calls against.
