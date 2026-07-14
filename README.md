# Adobe Commerce checkout starter kit

Welcome to the home of Adobe Commerce checkout starter kit.

This starter kit is designed to help you get started with building custom checkout experiences for Adobe Commerce. Its
goal is to showcase how to use Adobe Commerce Extensibility in combination with Adobe App Builder to build custom
checkout experiences.

For more details, please refer to the [Adobe Commerce checkout starter kit documentation](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/).

## Apps in this repo

The starter kit is split into independent Adobe Commerce App Management apps, one per checkout domain, so each can be
installed, associated, and versioned on its own. See the [App Management docs](https://developer.adobe.com/commerce/extensibility/app-management/)
for install, build/deploy, and association details common to all of them.

| App | What it does | Business context |
| --- | --- | --- |
| [`apps/shipping-method`](apps/shipping-method) | Out-of-process shipping carrier setup and the shipping rates webhook. | [Shipping in Checkout Starter Kit](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/shipping-install) |
| [`apps/payment-method`](apps/payment-method) | Out-of-process payment method validation and filtering. | [Payment in Checkout Starter Kit](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/payment-install) |
| [`apps/tax-integration`](apps/tax-integration) | Out-of-process tax calculation, tax-integration setup, and the Tax Management Admin UI. | [Tax in Checkout Starter Kit](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/tax-install) |
| [`apps/totals-collector`](apps/totals-collector) | Example out-of-process discount webhook implementations (cart totals collector rules). | [Totals Collector in Checkout Starter Kit](https://developer.adobe.com/commerce/extensibility/starter-kit/checkout/totals-collector-install) |

## Building your own app

Using this repo as a template for your own App Builder app submission? See [`SUBMISSION_TEMPLATE.md`](SUBMISSION_TEMPLATE.md)
for an example app installation guide.

## Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for how to contribute, and
[`.github/MAINTAINERS.md`](.github/MAINTAINERS.md) for how the `apps/*` CI/CD pipeline works and how to onboard a new app to it.
