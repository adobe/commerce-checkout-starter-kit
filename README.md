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

- `SERVICE_API_KEY`: The API key for the service.
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

1. You have the commerce eventing module installed in your commerce instance.
   - If not, install the Adobe I/O Events for Adobe Commerce module in your commerce instance following this [documentation](https://developer.adobe.com/commerce/extensibility/events/installation/).
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

To understand it we have to know what is going to be the flow:

- All starts in the frontend, when checkout ends, the frontend will send the masked cart id to the payment gateway.
- Then the payment gateway will send a request to the AppBuilder application with the masked cart id, because is the only information it has about the order. This request could be a webhook or a or an event.
- The AppBuilder application will use the Adobe Commerce HTTP Client to get the order details using the masked cart id. To do so, this starter kit provides the method `getOrderByMaskedCartId` in the Adobe Commerce HTTP Client.

![sequence.png](sequence.png)

### Payment methods

#### Validate payment info

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

## Adobe Commerce HTTP Client

### Authentication


Depending on your Adobe Commerce setup, there are 2 options to authenticate and communicate with the App Builder:

- Configure Adobe Identity Management Service (IMS) 
- Configure Commerce Integration

One of the common requirement for both type of authentications is setting the `COMMERCE_BASE_URL=<corresponding_base_url>` in the `.env` file. It's important to know that if commerce integration is detected, it will have precedence over IMS Auth. However, if none of them is detected or configured, than client instantiation will directly fail.

#### Configure Adobe Identity Management Service (IMS)

To proceed with this authentication, some previous setup needs to be done.

1. Configure IMS for Commerce following the steps in [Configure the Commerce Admin Integration with Adobe ID](https://experienceleague.adobe.com/en/docs/commerce-admin/start/admin/ims/adobe-ims-config).

2.  Create new IMS credentials through the [Adobe Developer Console](https://developer.adobe.com/console). To do so, add a new service of type `API` in the workspace. From the list of API's, select `I/O Management API` and follow the steps shown by the wizard. On completion, all credentials will be generated.

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

#### Configure Commerce Integration

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


### Example of use (Get one payment method by code):

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

getAdobeCommerceClient(process.env).then((client) => {
  client.getOopePaymentMethod('method-1').then((response) => {
    console.log(response);
  });
});
```

#### Endpoints

##### getOrderByMaskedCartId

###### Description:

Get the order by masked cart id from the Adobe Commerce instance. This is used when the app builder application receives a request (event or webhook) from the payment gateway with the masked cart id.. With this endpoint we could get the complete order information.

###### Example:

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

getAdobeCommerceClient(process.env).then((client) => {
  client.getOrderByMaskedCartId('marked-cart-id').then((response) => {
    console.log(response);
  });
});
```

###### Request parameters

- maskedCartId: String Cart id from the payment method webhook or event

###### Response success

This method uses the Adobe Commerce API order search criteria https://developer.adobe.com/commerce/webapi/rest/use-rest/performing-searches/#other-search-criteria

###### Response error

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Response code 404 (Not Found)",
  "body": { "message": "masked_quote_id not found" }
}
```

##### getOopePaymentMethods

###### Description:

Get the list of all out of process payment methods in the Adobe Commerce instance.

###### Example:

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

getAdobeCommerceClient(process.env).then((client) => {
  client.getOopePaymentMethods().then((response) => {
    console.log(response);
  });
});
```

###### Request parameters

\*\* No request parameters

###### Response success

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
    },
    {
      "id": 2,
      "code": "method-2",
      "title": "Method Two",
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

##### getOopePaymentMethod

###### Description:

Get one out of process payment method by code from the Adobe Commerce instance.

###### Example:

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

getAdobeCommerceClient(process.env).then((client) => {
  client.getOopePaymentMethod('method-1').then((response) => {
    console.log(response);
  });
});
```

###### Request parameters

- code: String: Code of the OOP payment method, must be unique including the regular payment methods

###### Response success:

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
        "key": "key1",
        "value": "value1"
      },
      {
        "key": "key2",
        "value": "value2"
      }
    ]
  }
}
```

###### Response error:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Response code 404 (Not Found)",
  "body": {
    "message": "Out of process payment method not found."
  }
}
```

##### createOopePaymentMethod

###### Description:

Create a new out of process payment method in the Adobe Commerce instance.

###### Example:

```javascript
const { getAdobeCommerceClient } = require('../lib/adobe-commerce');

getAdobeCommerceClient(process.env).then((client) => {
  client
    .createOopePaymentMethod({
      code: 'method-1',
      title: 'Method 1',
      description: 'Method 1 description',
      active: true,
      backend_integration_url: 'https://example.com',
      stores: ['store-1', 'store-2'],
      order_status: 'processing',
      countries: ['US', 'ES'],
      currencies: ['USD', 'EUR'],
      custom_config: [
        {
          key1: 'value1',
        },
        {
          key2: 'value2',
        },
      ],
    })
    .then((response) => {
      console.log(response);
    });
});
```

###### Request parameters:

```json
{
  "code": "method-code", // String
  "title": "Method Title", // String
  "description": "Method description", // String
  "active": true, // Boolean
  "backend_integration_url": "https://integration-url.com", // String
  "stores": ["store-1", "store-2"], // Array[String]
  "order_status": "pending", // String
  "countries": ["US", "ES"], // Array[String]
  "currencies": ["USD", "EUR"], // Array[String]
  "custom_config": [
    {
      "key1": "value1"
    },
    {
      "key2": "value2"
    }
  ]
}
```

###### Response success:

```json
{
  "success": true,
  "message": {
    "id": 3,
    "code": "method-2",
    "title": "Method Two",
    "active": true,
    "backend_integration_url": "http://oope-payment-method.pay/event",
    "stores": ["default"],
    "order_status": "complete",
    "countries": ["ES", "US"],
    "currencies": ["EUR", "USD"],
    "custom_config": [
      {
        "key1": "value1"
      },
      {
        "key2": "value2"
      }
    ]
  }
}
```

###### Response error:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Response code 400 (Bad Request)",
  "body": {
    "message": "Error message"
  }
}
```
