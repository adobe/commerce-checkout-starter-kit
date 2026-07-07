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
creates every carrier defined in [`shipping-carriers.yaml`](./shipping-carriers.yaml) on the
associated Commerce instance. To inspect what's currently registered without re-running install:

```bash
npm run get-shipping-carriers
```

(This is a local dev-only helper — it needs `AIO_COMMERCE_API_BASE_URL` in your `.env`, plus either
the same `AIO_COMMERCE_AUTH_IMS_*` credentials the install step already uses, or
`AIO_COMMERCE_AUTH_INTEGRATION_*` for PaaS with a Commerce integration instead of IMS; see
[`env.dist`](./env.dist). It uses `@adobe/aio-commerce-lib-api`'s `AdobeCommerceHttpClient` +
`resolveCommerceHttpClientParams` — no hand-rolled Commerce client.)

## Webhook subscription and signature setup

`app.commerce.config.ts` declares two `webhooks` entries for `shipping-methods` (one `env: ["paas"]`,
one `env: ["saas"]`, since the `webhook_method` string itself differs between the two — Commerce
drops the `magento.` segment on SaaS). At install/association time, App Management resolves the
deployed action's public Runtime URL and subscribes it to Commerce automatically via the
[Webhooks REST API](https://developer.adobe.com/commerce/extensibility/webhooks/api/#subscribe-a-webhook)
— no manual "System > Webhooks > Webhooks Subscriptions" step and no manual `webhooks.xml` editing
for either environment. Both entries set `requireAdobeAuth: false` to match this action's
`require-adobe-auth: false` annotation (it's authenticated via Commerce's own webhook signature, not
Adobe IMS), so the SDK doesn't attach unnecessary `developer_console_oauth` credentials to the
subscription it creates.

What the declarative config does **not** automate — signature verification is a separate Commerce
security feature this action's own code checks against, invisible to the subscription mechanism
above, and still needs manual setup:

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe Services > Webhooks**.
1. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**.
1. Add the generated **Public Key** to your `.env` as
   [documented here](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action):

   ```env
   COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----"
   ```

See the [shipping use-cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-use-cases/)
for how to customize the rates returned by `shipping-methods`.

## Validation

1. Deploy and associate the app.
1. Confirm `npm run get-shipping-carriers` lists the carriers from `shipping-carriers.yaml`.
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
