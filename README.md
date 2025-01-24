# Adobe Commerce checkout starter kit

Welcome to home of Adobe Commerce checkout starter kit.

This starter kit is designed to help you get started with building custom checkout experiences for Adobe Commerce. Its
goal is to showcase how to use Adobe Commerce Extensibility in combination with Adobe App Builder to build custom
checkout experiences.

## References

- Adobe Developer Console [documentation](https://developer.adobe.com/developer-console/docs/guides/)
- App Builder [documentation](https://developer.adobe.com/app-builder/docs/overview)
- Adobe I/O Runtime [documentation](https://developer.adobe.com/runtime/docs)
- Adobe I/O Events [documentation](https://developer.adobe.com/events/docs)
- Adobe Commerce extensibility [documentation](https://developer.adobe.com/commerce/extensibility)

## How to use this repo

- See [DEVELOPMENT.md](DEVELOPMENT.md) for information about the prerequisites and how to set up and run the project
  locally.
- See [CICD.md](CICD.md) for information about the CI/CD setup.
- See [EDS.md](EDS.md) for information about the Edge Delivery Service(EDS) Storefront integration.

## Prerequisites

Before starting with the starter kit, ensure that your Adobe Commerce installation meets the following prerequisites:

### Install Out-of-Process Payment Extensions (OOPE) Module in Adobe Commerce

To enable out-of-process payment methods in your Commerce instance, install the `magento/module-out-of-process-payment-methods` in your Commerce instance. This module enables out-of-process payment functionalities.
Execute the following command using Composer:

```bash
composer require magento/module-out-of-process-payment-methods --with-dependencies
```

### Install Out-of-Process Shipping Extensions (OOPE) Module in Adobe Commerce

To enable out-of-process shipping methods in your Commerce instance, install the `magento/module-out-of-process-shipping-methods` in your Commerce instance. This module enables out-of-process shipping functionalities.
Execute the following command using Composer:

```bash
composer require magento/module-out-of-process-shipping-methods --with-dependencies
```

### Install Commerce Eventing Module in Adobe Commerce

The [Commerce Eventing module](https://developer.adobe.com/commerce/extensibility/events/) is crucial for handling events within Adobe Commerce and has been included in the core since Adobe Commerce version 2.4.6.
Ensure your installation is up-to-date, especially if you are using this starter kit, which requires at least version 1.10.0 of the Commerce Eventing module:

```bash
composer update magento/commerce-eventing --with-dependencies
```

For Adobe Commerce versions 2.4.4 or 2.4.5, the Adobe I/O Events for Adobe Commerce module will need to be installed manually. Follow the instructions provided in the [Adobe I/O Events installation documentation](https://developer.adobe.com/commerce/extensibility/events/installation/).

## Project structure

### Configurations

All configurations align with the guidelines found on the [App Builder Configuration Files page](https://developer.adobe.com/app-builder/docs/guides/configuration/).
In addition to the configurations mentioned there, this starter kit requires the following additional configurations:

#### events.config.yaml

The `events.config.yaml` file is used to define the event providers and their metadata.

| Field             | Description                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| label             | Label of the event provider.                                                                                                                                                                                                 |
| provider_metadata | Metadata of the event provider (e.g., `dx_commerce_events` for the commerce event provider).                                                                                                                                 |
| description       | Description of the event provider.                                                                                                                                                                                           |
| docs_url          | Documentation URL for the event provider.                                                                                                                                                                                    |
| events_metadata   | List of event metadata to register. Not required for Commerce event provider as it will be done by event subscription.                                                                                                       |
| subscription      | Required only for the commerce event provider. List of commerce events to subscribe to. <br/>Payload specifications can be found [here](https://developer.adobe.com/commerce/extensibility/events/api/#subscribe-to-events). |

### Scripts

A set of scripts has been provided to help you get started with the project. You can find them in the `scripts/` and they
can be run using `npm run <script-name>`.

#### configure-events

The `configure-events` script configures the Adobe I/O Events integration for your project with a single command.

It performs the following actions:

1. It reads the event providers specification from the [events.config.yaml](#eventsconfigyaml) file and synchronizes the event providers and their metadata.
   - Note that the labels of the event providers defined in the specification are suffixed with the Adobe I/O Runtime namespace to ensure uniqueness across the projects of the organization.
2. The script also updates the `AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING` environment variable with the latest provider metadata.

To run the `configure-events` script, ensure that your project configuration (`.aio` file) includes the following:

- **Organization ID**: `project.org.id`
- **IMS Organization ID**: `project.org.ims_org_id`
- **Project ID**: `project.id`
- **Workspace ID**: `project.workspace.id`

Additionally, the script uses the following environment variables:

- `AIO_runtime_namespace`: The Adobe I/O Runtime namespace used as suffix for the Adobe I/O Events provider label.
- `AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING`: (Optional) Existing provider metadata to provider mapping.

Note that event providers deletion is not supported by the script. If you need to delete an event provider, you can do
it through AIO cli with the following command `aio event provider delete <provider-id>`.

#### configure-commerce-events

The `configure-commerce-events` script configures the commerce event provider for your Commerce instance.

It reads `dx_commerce_events` event provider specification from the [events.config.yaml](#eventsconfigyaml) and `.env` files, and performs the following actions:

1. It configures commerce eventing in the Commerce instance.
   - If the Commerce instance has already been configured with a different provider, the script will return an error to prevent overriding another project's configuration.
2. It subscribes to the required commerce events.

To run the script, ensure you have set the followings up:

1. You have the [commerce eventing module](#install-commerce-eventing-module-in-adobe-commerce) installed in your commerce instance.
2. Make sure you have already set up the [Adobe Commerce HTTP Client](#adobe-commerce-http-client) to authenticate with the commerce instance.
3. Ensure that your [events.config.yaml](#eventsconfigyaml) and `.env` files are correctly configured with the commerce event provider specification.
   - The event provider needs to be created in advance, which you can do by running the [configure-events](#configure-events) script.
   - If you already have a commerce event provider, please ensure that
     - `events.config.yaml` file matches the existing provider metadata.
     - The environment variable `AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING` contains the commerce event provider id.
4. Additionally, the script requires the following environment variables, which will be used to update the values in Stores > Configuration > Adobe Services > Adobe I/O Events > Commerce events:
   - `COMMERCE_ADOBE_IO_EVENTS_MERCHANT_ID`: The merchant ID of the commerce instance.
   - `COMMERCE_ADOBE_IO_EVENTS_ENVIRONMENT_ID`: The environment ID of the commerce instance.

Note that this script must be completed before deploying the application for event registration.

#### create-payment-methods

The `create-payment-methods` script is used to create payment methods in Adobe Commerce.
It reads the payment methods configuration from the `payment-methods.yaml` file and creates the payment methods in Adobe Commerce.

To run the `create-payment-methods` script, ensure that the [Adobe Commerce HTTP Client](#adobe-commerce-http-client) is configured.

## Use cases

### 3rd party events processing

3rd party systems usually offer a way to subscribe to events that are emitted when certain actions are performed. For
example, with a payment gateway we may subscribe to Authorization, Capture or Refund events.

Adobe I/O Events can be used to offload the events processing which requires to configure an Event Provider. The
`configure-events` script provided in this project can be used to manage the 3rd party event providers required for
your integration. See the [Scripts/configure-events](#configure-events) section for more information.

Once the event provider is configured, the 3rd party events can be published and a consumer can be registered to process
them accordingly.

(3rd party system) -> (Adobe I/O Events) -> (AppBuilder app)

#### Publication

There are different options on how to publish these events with an AppBuilder app, depending on the flexibility of the
3rd party system.

The options are ordered by preference.

##### Directly from 3rd party system

The best option is to ingest the events directly from the 3rd party system. This is the most efficient way to process
events but the source system has to be adapted to send the events to Adobe I/O Events.

(3rd party system) -> (Event provider) -> (Consumer runtime action)

The Events Publishing API is described in
the [Adobe I/O Events documentation](https://developer.adobe.com/events/docs/guides/api/eventsingress_api/).

Note this example is not exemplified in this project since it depends on source system details.

##### Publication using an action

If the 3rd party system does not support sending events to Adobe I/O Events, it usually supports registering a webhook
that should be called when an event occurs. Additionally, the 3rd party system may be configured to use an
authentication mechanism in the webhook (basic auth, OAuth, etc.) so that only authorized requests are accepted.

(3rd party system) -> (Consumer runtime action) -> (Event provider) -> (Consumer runtime action)

This use case is implemented in the `actions/3rd-party-events/publish.js` action.

Note that for implementing this use case correctly the action should receive the `OAUTH_*` environment variables to be
able to retrieve an access token to publish in the event provider. This configuration is done by specifying the env vars
in the `.env` file and setting them as `app.config.yaml`.

#### Consumption

Consumption of events can be done using webhooks where the action is registered as a consumer of the event provider.

An example of a consumer is the `actions/3rd-party-events/consume.js` action which is registered declaratively as
a Webhook in `app.config.yaml`. Note that in this config file, the value used in the `provider_metadata` field is
specified in the `AIO_EVENTS_PROVIDERMETADATA_TO_PROVIDER_MAPPING` environment variable so the registration can know to
which provider the action should be registered.

AIO cli provides an interactive command to register the webhook and the action as a consumer of the event provider:

```shell
aio app add event
```

Extended documentation about how to implement a consumer action and register it as a webhook can be found in
the [AppBuilder Applications with Adobe I/O Events documentation](https://developer.adobe.com/events/docs/guides/appbuilder/)

See also [Adobe I/O Events Webhook FAQ](https://developer.adobe.com/events/docs/support/faq/#webhook-faq) which
contains interesting information about how to handle event consumption (state of registration, retries, debugging).

### Payment flow: Obtain order details from Adobe Commerce using the masked cart id

To understand the payment flow, we need to consider the following steps:

1. It all starts on the frontend. When checkout is completed, the frontend sends the masked cart ID to the payment gateway.
2. The payment gateway then sends a request to the AppBuilder application with the masked cart ID, as this is the only information it has about the order. This request could be a webhook or an event.
3. The AppBuilder application uses the Adobe Commerce HTTP Client to retrieve the order details using the masked cart ID. To facilitate this, the starter kit provides the method `getOrderByMaskedCartId` in the Adobe Commerce HTTP Client.

![sequence.png](sequence.png)

### Payment methods: Validate payment info

Since the checkout process and the payment of the order is expected to be done in a headless way, the Commerce instance
has to ensure that the payment has succeeded and the order can be placed.

In order to ingest the payment gateway specific information in the payment process, it is expected that the checkout process
uses [`setPaymentMethodOnCart` mutation](https://developer.adobe.com/commerce/webapi/graphql/schema/cart/mutations/set-payment-method/)
in combination with `payment_method.additional_data` field in order to persist all the information required to validate
later the payment once the order is placed.

```graphql
setPaymentMethodOnCart(
  input: {
    cart_id: $cartId
    payment_method: {
      code: $code
      additional_data: [
        {
          key: 'sessionId',
          value: '86A76C95-8F56-4922-B226-636533C06708',
        },
        {
          key: 'status',
          value: 'DONE',
        },
      ]
    }
  }
) {
  cart {
    selected_payment_method {
      code
      title
    }
  }
}
```

With this information persisted, a webhook can be configured with the help of [Adobe Commerce Webhooks](https://developer.adobe.com/commerce/extensibility/webhooks)
so every time there's an order placed a synchronous call is dispatched to the AppBuilder application implementing the payment
method to validate the payment.

In order to register a webhook, go to the Adobe Commerce Admin > System > Webhooks and create a new webhook with the following configuration:

```
Hook Settings
  Webhook Method: observer.sales_order_place_before
  Webhook Type: before
  Batch Name validate_payment
  Hook Name: oope_payment_methods_sales_order_place_before
  URL: https://yourappbuilder.runtime.adobe.io/api/v1/web/commerce-checkout-starter-kit/validate-payment
  Active: Yes
  Method: POST

Hook Fields
  Field: payment_method Source: order.payment.method
  Field: payment_additional_information Source: order.payment.additional_information

Hook Rules
  Field: payment_method Value: yourpaymentmethodcode Operator: equal
```

Additionally, you can enable webhook signature generation according to [Webhooks signature verification](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/)

See the action implemented in `actions/payment-methods/validate-payment.js` for an example of how to receive the request
and validate the payment according to the payment gateway needs.

## Shipping methods: configure webhooks

In order to add out-of-process shipping methods the webhooks should be configured [Adobe Commerce Webhooks](https://developer.adobe.com/commerce/extensibility/webhooks).

Each time when the Adobe Commerce application retrieves the shipping methods, a synchronous call is dispatched to the AppBuilder application to retrieve the out-of-process shipping methods. 
To add the out-of-process shipping methods to the list of available shipping methods the appropriate shipping carrier should be created in the Adobe Commerce instance.

In order to register a webhook, go to the Adobe Commerce Admin > System > Webhooks and create a new webhook with the following configuration:

```
Hook Settings
  Webhook Method: plugin.magento.out_of_process_shipping_methods.api.shipping_rate_repository.get_rates
  Webhook Type: after
  Batch Name shipping_methods
  Hook Name: oope_shipping_methods_carrier_one
  URL: https://yourappbuilder.runtime.adobe.io/api/v1/web/commerce-checkout-starter-kit/shipping-methods
  Active: Yes
  Method: POST

Hook Fields
  Field: rateRequest
```

You can add additional hook rules if you want to trigger the webhook only for specific countries, stores, websites or any other condition.

For example for the filtration by the destination country, you can add the following rule:

```
Hook Rules
  Field: rateRequest.dest_country_id Value: EN,US,ES Operator: in
```

Additionally, you can enable webhook signature generation according to [Webhooks signature verification](https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification/)

See the action implemented in `actions/shipping-methods/validate-payment.js` for an example of how to return the shipping methods from the AppBuilder action.

## Adobe Commerce HTTP Client

`adobe-commerce.js` provides a set of methods to interact with the Adobe Commerce instance. The client is built using the Adobe Commerce HTTP Client, which is a wrapper around the Adobe Commerce REST API.

To utilize the Adobe Commerce HTTP Client, update `COMMERCE_BASE_URL=<commerce_instance_url>` in the `.env` file, and complete the authentication setup.

### Authentication

Depending on your Adobe Commerce setup, there are 2 options to authenticate and communicate with the App Builder:

1. [Configure Adobe Identity Management Service (IMS)](#option-1-configure-adobe-identity-management-service-ims)
2. [Configure Commerce Integration](#option-2-configure-commerce-integration)

It's important to know that if commerce integration is detected, it will have precedence over IMS Auth. However, if none of them is detected or configured, than client instantiation will directly fail.

#### Option 1. Configure Adobe Identity Management Service (IMS)

To proceed with this authentication, some previous setup needs to be done.

1. Configure IMS for Commerce following the steps in [Configure the Commerce Admin Integration with Adobe ID](https://experienceleague.adobe.com/en/docs/commerce-admin/start/admin/ims/adobe-ims-config).

2. Create new IMS credentials through the [Adobe Developer Console](https://developer.adobe.com/console). To do so, add a new service of type `API` in the workspace. From the list of API's, select `I/O Management API` and follow the steps shown by the wizard. On completion, all credentials will be generated.

3. Add Technical Account to Commerce Admin

   1. Ensure that the technical account associated with the server-to-server credentials is added to the Commerce Admin with the appropriate permissions. If not, you can add it using [Admin User Creation Guide](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/user-accounts/permissions-users-all#create-a-user).
   2. When associating the user, make sure to find your actual `Technical Account email` as a part of generated IMS credentials with following pattern: <technical-account>@techacct.adobe.com and use that value in the `Email` field shown in the following image:
      ![img.png](userCreation.png)

   3. When selecting the user role from the `User Role`tab shown in the previous image, make sure to select the `Administrators` to have all the necessary permissions.

Finally, copy the generated credentials (client id, client secret, technical account id, technical account email) to the `.env` file in the root of the project as following:

```text
OAUTH_CLIENT_ID=<client id>
OAUTH_CLIENT_SECRETS=<client secret>
OAUTH_TECHNICAL_ACCOUNT_ID=<technical account id>
OAUTH_TECHNICAL_ACCOUNT_EMAIL=<technical account email>
OAUTH_SCOPES=<scope>
OAUTH_IMS_ORG_ID=<img org>
```

#### Option 2. Configure Commerce Integration

This option also enables us to communicate with the platform. It requires some setup as following:

1. Create a new Adobe Commerce Integration by following [this](https://experienceleague.adobe.com/en/docs/commerce-admin/systems/integrations) guide.
2. Copy the integration details (consumer key, consumer secret, access token, and access token secret) to the `.env` file in the root of the project.
   ```text
   COMMERCE_CONSUMER_KEY=<key>
   COMMERCE_CONSUMER_SECRET=<secret>
   COMMERCE_ACCESS_TOKEN=<access token>
   COMMERCE_ACCESS_TOKEN_SECRET=<access token secret>
   ```

### Debugging of requests

From now, you can also debug and see some customized logs using the `LOG_LEVEL` environment variable. If this variable is set, logs from different phases of the commerce client instantiation will be shown with detailed information.

### Commerce API Methods

To call the Commerce REST endpoints, initialize the Adobe Commerce Client as follows:

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');
const commerceClient = await getAdobeCommerceClient(process.env);
```

#### Create a new OOPE payment method

`createOopePaymentMethod` creates a new out-of-process payment method with the necessary details such as code, title, and configuration.

**Payload parameters:**

| Parameter                 | Type    | Description                                                                                                                                                                      |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                    | String  | Unique identifier for the payment method.                                                                                                                                        |
| `title`                   | String  | Display name of the payment method.                                                                                                                                              |
| `description`             | String  | Description of the payment method.                                                                                                                                               |
| `active`                  | Boolean | Status indicating if the method is active.                                                                                                                                       |
| `backend_integration_url` | String  | URL for backend integration, which is an app builder URL                                                                                                                         |
| `stores`                  | Array   | List of store codes that payment method is available                                                                                                                             |
| `order_status`            | String  | Initial [order status](https://experienceleague.adobe.com/en/docs/commerce-admin/stores-sales/order-management/orders/order-status) when using this method. Default is `pending` |
| `countries`               | Array   | List of countries where the method is available.                                                                                                                                 |
| `currencies`              | Array   | Currencies supported by the payment method.                                                                                                                                      |
| `custom_config`           | Array   | Custom configuration settings for payment methods                                                                                                                                |

**Example usage:**

```javascript
try {
  const createResponse = await commerceClient.createOopePaymentMethod({
    code: 'method-1',
    title: 'Method 1',
    description: 'Description for Method 1',
    active: true,
    backend_integration_url: 'https://example.com',
    stores: ['store-1', 'store-2'],
    order_status: 'processing',
    countries: ['US', 'ES'],
    currencies: ['USD', 'EUR'],
    custom_config: [{ key: 'key1', value: 'value1' }],
  });

  if (!createResponse.success) {
    return errorResponse(createResponse.statusCode, 'Failed to create payment method');
  }

  console.log('Created payment method:', createResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while creating payment method');
}
```

**Example response:**

```json
{
  "success": true,
  "message": {
    "id": 3,
    "code": "method-1",
    "title": "Method 1",
    "description": "Description for Method 1",
    "active": true,
    "backend_integration_url": "http://example.com",
    "stores": ["store-1", "store-2"],
    "order_status": "processing",
    "countries": ["ES", "US"],
    "currencies": ["EUR", "USD"],
    "custom_config": [
      {
        "key1": "value1"
      }
    ]
  }
}
```

#### List all payment methods

`getOopePaymentMethods` retrieves the list of all out of process payment methods in the Adobe Commerce instance.

**Example usage:**

```javascript
try {
  const listResponse = await commerceClient.getOopePaymentMethods();
  if (!listResponse.success) {
    return errorResponse(listResponse.statusCode, 'Failed to list payment methods');
  }
  console.log('List of payment methods:', listResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while listing payment methods');
}
```

**Example response:**

```json
{
  "success": true,
  "message": [
    {
      "id": 1,
      "code": "method-1",
      "title": "Method one",
      "active": true,
      "backend_integration_url": "http://oope-payment-method.pay/event",
      "stores": [],
      "order_status": "complete",
      "countries": [],
      "currencies": [],
      "custom_config": []
    }
  ]
}
```

#### Get an OOPE payment method by code

`getOopePaymentMethod` retrieves one out of process payment method by code from the Adobe Commerce instance.

**Payload parameters:**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `code`    | String | Unique identifier for the payment method. |

**Example usage:**

```javascript
try {
  const getResponse = await commerceClient.getOopePaymentMethod('method-1');
  if (!getResponse.success) {
    return errorResponse(getResponse.statusCode, 'Failed to retrieve payment method');
  }
  console.log('Retrieved payment method details:', getResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while retrieving payment method');
}
```

**Example response:**

```json
{
  "success": true,
  "message": {
    "id": 2,
    "code": "method-1",
    "title": "Method one",
    "active": true,
    "backend_integration_url": "http://oope-payment-method.pay/event",
    "stores": ["default"],
    "order_status": "complete",
    "countries": ["ES", "US"],
    "currencies": ["EUR", "USD"],
    "custom_config": [
      {
        "key": "can_refund",
        "value": "true"
      }
    ]
  }
}
```

#### Retrieve an order by masked cart ID

`getOrderByMaskedCartId` retrieves order details from the Adobe Commerce instance using a masked cart ID. This is typically used when the app builder application receives a webhook or event from the payment gateway.
This method uses the Adobe Commerce API [order search criteria](https://developer.adobe.com/commerce/webapi/rest/use-rest/performing-searches/#other-search-criteria).

**Payload parameters:**

| Parameter      | Type   | Description                                           |
| -------------- | ------ | ----------------------------------------------------- |
| `maskedCartId` | String | The cart ID from the payment method webhook or event. |

**Example usage:**

```javascript
try {
  const orderResponse = await commerceClient.getOrderByMaskedCartId(maskedCartId);
  if (!orderResponse.success) {
    const errMsg =
      orderResponse.statusCode === HTTP_NOT_FOUND
        ? 'Order not found for the given maskedCartId.'
        : 'Unexpected error getting order by maskedCartId';
    return errorResponse(orderResponse.statusCode, errMsg);
  }
  console.log('Order details:', orderResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Failed to fetch order due to an unexpected error');
}
```

#### Create a new OOPE shipping carrier

`createOopeShippingCarrier` creates a new out-of-process shipping carrier with the necessary details such as code, title, and configuration.

**Payload parameters:**

| Parameter                    | Type    | Description                                                             |
|------------------------------|---------|-------------------------------------------------------------------------|
| `code`                       | String  | Unique identifier for the shipping carrier.                             |
| `title`                      | String  | Display name of the shipping carrier.                                   |
| `stores`                     | Array   | List of store codes that the shipping carrier is available              |
| `countries`                  | Array   | List of countries where the shipping carrier is available.              |
| `active`                     | Boolean | Status indicating if the shipping carrier is active.                    |
| `sort_order`                 | Integer | The sort order of shipping carriers.                                    |
| `tracking_available`         | Boolean | Status indicating if the shipping carrier has available tracking.       |
| `shipping_labels_available`  | Boolean | Status indicating if the shipping carrier has available sipping labels. |

**Example usage:**

```javascript
try {
  const createResponse = await commerceClient.createOopeShippingCarrier({
    code: 'DPS',
    title: 'Demo Postal Service',
    countries: ['US', 'ES'],
    stores: ['store-1', 'store-2'],
    active: true,
    sort_order: 100,
    tracking_available: true,
    shipping_labels_available: true
  });

  if (!createResponse.success) {
    return errorResponse(createResponse.statusCode, 'Failed to create shipping carrier');
  }

  console.log('Created shipping carrier:', createResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while creating shipping carrier');
}
```

**Example response:**

```json
{
  "success": true,
  "message": {
    "id": 3,
    "code": "DPS",
    "title": "Demo Postal Service",
    "countries": ["US", "ES"],
    "stores": ["store-1", "store-2"],
    "active": true,
    "sort_order": 100,
    "tracking_available": true,
    "shipping_labels_available": true
  }
}
```

#### List all shipping carriers methods

`getOopeShippingCarriers` retrieves the list of all out of process shipping carriers in the Adobe Commerce instance.

**Example usage:**

```javascript
try {
  const listResponse = await commerceClient.getOopeShippingCarriers();
  if (!listResponse.success) {
    return errorResponse(listResponse.statusCode, 'Failed to list shipping carriers');
  }
  console.log('List of shipping carriers:', listResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while listing shipping carriers');
}
```

**Example response:**

```json
{
  "success": true,
  "message": [
    {
      "id": 3,
      "code": "DPS",
      "title": "Demo Postal Service",
      "countries": ["US", "ES"],
      "stores": ["store-1", "store-2"],
      "active": true,
      "sort_order": 50,
      "tracking_available": true,
      "shipping_labels_available": true
    },
    {
      "id": 4,
      "code": "FPS",
      "title": "France Postal Service",
      "countries": ["US", "FR"],
      "stores": ["store-1", "store-2"],
      "active": true,
      "sort_order": 100,
      "tracking_available": true,
      "shipping_labels_available": true
    }
  ]
}
```

#### Get an OOPE shipping carrier by code

`getOopeShippingCarrier` retrieves one out of process shipping carrier by code from the Adobe Commerce instance.

**Payload parameters:**

| Parameter | Type   | Description                               |
| --------- | ------ | ----------------------------------------- |
| `code`    | String | Unique identifier for the shipping carrier. |

**Example usage:**

```javascript
try {
  const getResponse = await commerceClient.getOopeShippingCarrier('EPS');
  if (!getResponse.success) {
    return errorResponse(getResponse.statusCode, 'Failed to retrieve shipping carrier');
  }
  console.log('Retrieved shipping carrier details:', getResponse.message);
} catch (error) {
  return errorResponse(HTTP_INTERNAL_ERROR, 'Error occurred while retrieving shipping carrier');
}
```

**Example response:**

```json
{
  "success": true,
  "message": {
    "id": 3,
    "code": "DPS",
    "title": "Demo Postal Service",
    "countries": ["US", "ES"],
    "stores": ["store-1", "store-2"],
    "active": true,
    "sort_order": 100,
    "tracking_available": true,
    "shipping_labels_available": true
  }
}
```

## CI/CD

To read about continuous integration and continuous delivery for any application built using App builder visit [CI/CD for App Builder Applications](https://developer.adobe.com/app-builder/docs/guides/deployment/ci_cd_for_firefly_apps/).

In addition, to help with the implementation, workflow samples are also provided under `workflow-samples`. To understand these workflows, visit `CICD.md` file in this project.
