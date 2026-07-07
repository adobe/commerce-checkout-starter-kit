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

(This is a local dev-only helper — it needs `COMMERCE_BASE_URL` plus either `OAUTH_*` or
`COMMERCE_CONSUMER_*` credentials in your `.env`; see [`env.dist`](./env.dist).)

## Webhook signature setup

1. In Adobe Commerce, go to **Stores > Settings > Configuration > Adobe Services > Webhooks**.
1. Enable **Digital Signature Configuration** and click **Regenerate Key Pair**.
1. Add the generated **Public Key** to your `.env` as
   [documented here](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/#verify-the-signature-in-the-app-builder-action):

   ```env
   COMMERCE_WEBHOOKS_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   -----END PUBLIC KEY-----"
   ```

1. After deploying, [create the webhook](https://developer.adobe.com/commerce/extensibility/webhooks/create-webhooks/)
   pointing at `shipping-method/shipping-methods` (registered manually — see "Why not an automated
   installation step" below):
   - For SaaS: register under **System > Webhooks > Webhooks Subscriptions**.
   - For PaaS: use `webhooks.xml`, replacing the URL with your deployed action's URL.

See the [shipping use-cases documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-use-cases/)
for how to customize the rates returned by `shipping-methods`.

### Why not an automated installation step

`@adobe/aio-commerce-lib-webhooks/api`'s `subscribeWebhook` could in principle turn this into a
`customInstallationStep`, but it targets webhooks declared via `app.commerce.config.ts`'s native
`webhooks` array — a different, IMS-authenticated action-registration path than the
`raw-http: true` / `require-adobe-auth: false` + hand-rolled-signature pattern this action uses (see
the design spec's "Auth strategy for runtime (webhook) actions"). Adopting it here would mean
maintaining two different webhook mechanisms side by side, so the manual registration step above is
kept instead.

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
