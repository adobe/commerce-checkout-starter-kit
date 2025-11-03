/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { Core } from '@adobe/aio-sdk';
import { HTTP_INTERNAL_ERROR, HTTP_OK } from './http.js';
import { resolveAuthOptions } from './adobe-auth.js';
import got from 'got';
import Oauth1a from 'oauth-1.0a';
import crypto from 'crypto';

/**
 * Resolves the Adobe Commerce SDK API URL and flavor according to the given params
 * @param {object} params action input parameters.
 * @param {string} params.COMMERCE_BASE_URL the base url of the Adobe Commerce instance
 * @returns {object} the resolved `baseUrl` and `flavor`
 */
function resolveCommerceSdkApiUrl({ COMMERCE_BASE_URL: baseUrl }) {
  const isCommerceApiDomain = (url) => {
    try {
      const { hostname } = new URL(url);
      return /^([a-zA-Z0-9-]+\.)?api\.commerce\.adobe\.com$/.test(hostname);
    } catch {
      return false;
    }
  };

  if (!baseUrl) {
    throw new Error("Can't resolve sdk api url for the given params. Please provide COMMERCE_BASE_URL.");
  }

  return {
    baseUrl,
    flavor: isCommerceApiDomain(baseUrl) ? 'saas' : 'paas',
  };
}

/**
 * Initializes the Commerce client according to the given params
 *
 * @param {object} params to initialize the client
 * @returns {object} the available api calls
 */
async function getAdobeCommerceClient(params) {
  const logger = Core.Logger('adobe-commerce-client', {
    level: params.LOG_LEVEL ?? 'info',
  });

  const commerceClient = new AdobeCommerceHttpClient({
    config: {
      ...resolveCommerceSdkApiUrl(params),
    },
    auth: resolveCommerceSdkAuthProvider(params),
    fetchOptions: {
      throwHttpErrors: false,
      hooks: {
        afterResponse: [({ method, url }, _, { status }) => logger.debug(`"${method} ${url}" ${status}`)],
      },
    },
  });

  return ApiClient.create(commerceClient, {
    createOopePaymentMethod,
    getOopePaymentMethod,
    getOopePaymentMethods,
    createOopeShippingCarrier,
    getOopeShippingCarrier,
    getOopeShippingCarriers,
    createTaxIntegration,
    getTaxIntegration,
    getTaxIntegrations,
    configureEventing,
    getEventProviders,
    addEventProvider,
    subscribeEvent,
    getOrderByMaskedCartId,
    invoiceOrder,
    refundInvoice,
  });
}

const createOopePaymentMethod = async (client, paymentMethod) =>
  client.post('oope_payment_method', { json: paymentMethod });

const getOopePaymentMethod = async (client, paymentMethodCode) =>
  client.get(`oope_payment_method/${paymentMethodCode}`);

const getOopePaymentMethods = async (client) => client.get('oope_payment_method');

const createOopeShippingCarrier = async (client, shippingCarrier) =>
  client.post('oope_shipping_carrier', { json: shippingCarrier });

const getOopeShippingCarrier = async (client, shippingCarrierCode) =>
  client.get(`oope_shipping_carrier/${shippingCarrierCode}`);

const getOopeShippingCarriers = async (client) => client.get('oope_shipping_carrier');

const createTaxIntegration = async (client, taxIntegration) =>
  client.post('oope_tax_management/tax_integration', { json: taxIntegration });

const getTaxIntegration = async (client, taxIntegrationCode) =>
  client.get(`oope_tax_management/tax_integration/${taxIntegrationCode}`);

const getTaxIntegrations = async (client) => client.get('oope_tax_management/tax_integration');

const configureEventing = async (client, merchantId, environmentId, workspaceConfig) =>
  client.put('eventing/updateConfiguration', {
    json: {
      config: {
        enabled: true,
        merchant_id: merchantId,
        environment_id: environmentId,
        workspace_configuration: JSON.stringify(workspaceConfig),
      },
    },
  });

const getEventProviders = async (client) => client.get('eventing/getEventProviders');

const addEventProvider = async (client, eventProviderData) =>
  client.post('eventing/eventProvider', { json: eventProviderData });

const subscribeEvent = async (client, subscription) => client.post('eventing/eventSubscribe', { json: subscription });

const getOrderByMaskedCartId = async (client, cartId) =>
  client.get(
    `orders?searchCriteria[filter_groups][0][filters][0][field]=masked_quote_id&searchCriteria[filter_groups][0][filters][0][value]=${cartId}&searchCriteria[filter_groups][0][filters][0][condition_type]=eq`
  );

const invoiceOrder = async (client, orderId) => client.post(`order/${orderId}/invoice`, { json: { capture: true } });

const refundInvoice = async (client, invoiceId) => client.post(`invoice/${invoiceId}/refund`);

/**
 * Returns webhook response error according to Adobe Commerce Webhooks spec.
 *
 * @param {string} message the error message.
 * @returns {object} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
function webhookErrorResponse(message) {
  return {
    statusCode: HTTP_OK,
    body: {
      op: 'exception',
      message,
    },
  };
}

/**
 * Returns webhook response success according to Adobe Commerce Webhooks spec.
 *
 * @returns {object} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
function webhookSuccessResponse() {
  return {
    statusCode: HTTP_OK,
    body: {
      op: 'success',
    },
  };
}

/**
 * Verifies the signature of the webhook request.
 * @param {object} params input parameters
 * @param {object} params.__ow_headers request headers
 * @param {string} params.__ow_body request body, requires the following annotation in the action `raw-http: true`
 * @param {string} params.COMMERCE_WEBHOOKS_PUBLIC_KEY the public key to verify the signature configured in the Commerce instance
 * @returns {{success: boolean}|{success: boolean, error: string}} weather the signature is valid or not
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/signature-verification
 */
function webhookVerify({ __ow_headers: headers = {}, __ow_body: body, COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey }) {
  const signature = headers['x-adobe-commerce-webhook-signature'];
  if (!signature) {
    return {
      success: false,
      error:
        'Header `x-adobe-commerce-webhook-signature` not found. Make sure Webhooks signature is enabled in the Commerce instance.',
    };
  }
  if (!body) {
    return {
      success: false,
      error: 'Request body not found. Make sure the the action is configured with `raw-http: true`.',
    };
  }
  if (!publicKey) {
    return {
      success: false,
      error:
        'Public key not found. Make sure the the action is configured with the input `COMMERCE_WEBHOOKS_PUBLIC_KEY` and it is defined in .env file.',
    };
  }

  const verifier = crypto.createVerify('SHA256');
  verifier.update(body);
  const success = verifier.verify(publicKey, signature, 'base64');
  return { success, ...(!success && { error: 'Signature verification failed.' }) };
}

export { getAdobeCommerceClient, webhookErrorResponse, webhookSuccessResponse, webhookVerify };
