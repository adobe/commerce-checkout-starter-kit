# Integrate your OOPE payment method with EDS Storefront

## Pre-requisites

- You have EDS Storefront integrated with Adobe Commerce: [EDS Storefront](https://experienceleague.adobe.com/developer/commerce/storefront/).
- You have Storefront in Edge Delivery Service (EDS) with [checkout dropin](https://experienceleague.adobe.com/developer/commerce/storefront/dropins/checkout/).
  - The checkout dropin component allows users to enter shipping and payment information, review their order details, and confirm their purchase.
  - The latest EDS Storefront boilerplate with dropins can be found here: [EDS Adobe Commerce Boilerplate](https://github.com/hlxsites/aem-boilerplate-commerce).

## Integrate with Checkout Dropin

Usually, the payment gateway requires a session to start the payment process, and it provides a dropin UI to draw on the payment form using that session ID.

The following is an example of how to integrate the OOPE method with the checkout dropin. It shows creating a session from the payment gateway action in App Builder and setting up the payment form based on the session response.

The way of integration can vary depending on your use case. Please refer to the latest documentation of the [checkout dropin](https://experienceleague.adobe.com/developer/commerce/storefront/dropins/checkout/) and your payment gateway docs for the most up-to-date information.

1. Import your payment gateway SDK in your project.
   ```html
   <script src="https://cdn.your-paymentgateway.com/sdk.js"></script>
   ```
2. Create a session from the OOPE payment gateway and get the session data.
   ```javascript
   async function createSession(endpoint, request) {
     return (
       await fetch(endpoint, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
         },
         body: JSON.stringify(request),
       })
     ).json();
   }
   ```
3. Start payment in the checkout dropin.
   The following is an example of starting the payment instead of placing the order when the user selects the OOPE payment method.

   ```javascript
   export default async function decorate(block) {
       ...
       CheckoutProvider.render(PlaceOrder, {
           onPlaceOrder: async (_ctx) => {
               try {
                   if (_ctx.code === 'oope_adyen') {
                       // Start payment when OOPE payment method is selected
                       await startPayment(cartData, environment, sessionUrl, clientKey, returnUrl);
                   } else {
                       await checkoutApi.placeOrder();
                   }
               } catch (error) {
                   console.error(error);
                   throw error;
               }
           },
       })($placeOrder),
       ...
   ]);

   async function startPayment(cartData, environment, sessionUrl, clientKey, returnUrl) {
     const createSessionRequest = {
       amount: {
         value: cartData.prices.grandTotal.value,
         currency: cartData.prices.grandTotal.currency,
       },
       reference: cartData.id,
       returnUrl: returnUrl,
       countryCode: cartData.billingAddress.country.code,
     };

     // Create a session from the OOPE payment gateway, a function from the previous step
     const sessionData = await createSession(
       createSessionEndpoint,
       createSessionRequest,
     );

     const configuration = {
       session: {
         id: sessionData.message.id,
         sessionData: sessionData.message.sessionData,
       },
       environment: environment,
       amount: {
         value: sessionData.message.amount.value,
         currency: sessionData.message.amount.currency,
       },
       locale: sessionData.message.shopperLocale,
       countryCode: sessionData.message.countryCode,
       clientKey: clientKey,
       analytics: {
         enabled: true,
       },
       onPaymentCompleted: async () => {
           // Place an order once payment is completed
           await checkoutApi.placeOrder();
       },
       ...
     };

     // Draw your payment gateway dropin UI on the page
     await mountPaymentDropin('#id-to-mount', configuration);
   }
   ```

4. Mount the payment gateway dropin UI on the page using the session created through your OOPE gateway.
   For example, the following is an example of Adyen library draws dropin UI on the page.
   ```javascript
   async function mountPaymentDropin(mountId, configuration) {
     await window.AdyenWeb.AdyenCheckout(configuration).then((checkout) => {
       const dropin = new window.AdyenWeb.Dropin(checkout, {
         paymentMethodComponents: [window.AdyenWeb.Card],
       });
       dropin.mount('#id-to-mount');
     });
   }
   ```

## Extend OOPE GraphQL Schema

If you want to retrieve OOPE payment method information from the Commerce instance, the dropins provide a way to extend the GraphQL query: [GraphQL Extensibility API](https://experienceleague.adobe.com/developer/commerce/storefront/dropins/all/extending/).

1. In `build.mjs` of the boilerplate, add the following code to extend the OOPE GraphQL schema.

   ```javascript
   overrideGQLOperations([
     {
       npm: '@dropins/storefront-checkout',
       operations: [
         `
      fragment CHECKOUT_DATA_FRAGMENT on Cart {
        available_payment_methods {
          code
          title
          oope_payment_method_config {
            backend_integration_url
            custom_config {
              ... on CustomConfigKeyValue {
                  key
                  value
              }
            }
          }
        }
        selected_payment_method {
          code
          title
          oope_payment_method_config {
            backend_integration_url
            custom_config {
              ... on CustomConfigKeyValue {
                  key
                  value
              }
            }
          }
        }
      }
    `,
       ],
     },
   ]);
   ```

2. Extend OOPE GraphQL schema in the checkout dropin initializer. It enables the dropin to retrieve the OOPE data.

   ```javascript
   await initializeDropin(async () => {
      ...
      return initializers.mountImmediately(initialize, {
         langDefinitions,
         models: {
            CartModel: {
               transformer: (data) => {
                  return {
                     availablePaymentMethods: data?.available_payment_methods,
                     selectedPaymentMethod: data?.selected_payment_method,
                  };
               },
            },
         },
      });
   })();
   ```

3. Now you can retrieve the OOPE payment method information from the data coming from the event responses.
   ```javascript
   events.on('checkout/initialized', handleCheckoutInitialized, { eager: true });
   ```
