# Checkout Shipping Method

Out-of-process shipping carrier setup and the `shipping-methods` out-of-process shipping rates
webhook, extracted from the Adobe Commerce checkout starter kit as an independent App Management
app.

## Install, build, deploy, and association

This app follows the standard Adobe Commerce App Management flow. Follow
[the App Management documentation](https://developer.adobe.com/commerce/extensibility/app-development/)
for:

- Creating the Developer Console project/workspace and installing the Adobe I/O CLI
- `npm install`, `aio app use --merge`
- `aio app build` / `aio app deploy`
- Associating the app with a Commerce instance (this is what populates the
  `AIO_COMMERCE_AUTH_IMS_*` credentials the installation step and the webhook auth path rely on)

During `aio app deploy`, the **Create Shipping Carriers** installation step runs automatically and
creates every carrier defined in [`scripts/create-shipping-carriers.js`](./scripts/create-shipping-carriers.js)
on the associated Commerce instance.

## Webhook subscription and auth setup

`app.commerce.config.ts` declares two `webhooks` entries for `shipping-methods` (one `env: ["paas"]`,
one `env: ["saas"]`, since the `webhook_method` string itself differs between the two — Commerce
drops the `magento.` segment on SaaS). At install/association time, App Management resolves the
deployed action's public Runtime URL and subscribes it to Commerce automatically via the
[Webhooks REST API](https://developer.adobe.com/commerce/extensibility/webhooks/api/#subscribe-a-webhook)
— no manual "System > Webhooks > Webhooks Subscriptions" step and no manual `webhooks.xml` editing
for either environment.

Both entries set `requireAdobeAuth: true` to match this action's `require-adobe-auth: true`
annotation (see `src/commerce-extensibility-1/ext.config.yaml`): Commerce authenticates its calls to
this action with an Adobe IMS token (`developer_console_oauth`), which the SDK provisions onto the
subscription automatically. There's no webhook signature to configure — no Digital Signature setup
in Commerce Admin, no public key in `.env`.

This requires `magento/module-adobe-commerce-webhooks` **>= 1.13.0** on the target Commerce instance
— that's the version that added the Webhooks Subscriber REST API to PaaS (it had previously been
SaaS-only) along with IMS/OAuth-based webhook auth. Older PaaS instances will need that module
updated before this app's automatic webhook subscription will work.

See the [shipping use-cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-use-cases/)
for how to customize the rates returned by `shipping-methods`.

## Validation

1. Deploy and associate the app.
1. In Commerce Admin, confirm the carriers defined in `create-shipping-carriers.js` are registered.
1. Place an order in Commerce and confirm the custom shipping methods appear at checkout.

## Auth pattern note

This app validated whether Adobe Commerce App Management's association-based Commerce client
(`getCommerceClient`/`getCommerceInstance`) can be used from a `raw-http: true` /
`require-adobe-auth: false` webhook action. **Result: GO** —
`resolveImsAuthParams`/`getCommerceClient` work correctly given only the params such an action
actually receives; validated against the real Adobe IMS token endpoint
(`ims-na1.adobelogin.com/ims/token/v2`) with intentionally invalid credentials, which produced a
clean, fast auth rejection rather than a hang or a raw-http-specific failure. See the "Spike result"
section in `docs/superpowers/plans/2026-07-07-shipping-method-app-management.md` for the full
writeup, including test-harness deviations encountered while validating this. The
`shipping-methods` action itself does not call Commerce today, so this finding is informational for
the payment and tax domain apps rather than something this app's own behavior depends on.
