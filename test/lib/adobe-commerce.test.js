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

jest.mock('../../lib/adobe-auth');
jest.mock('got');

const { getAdobeCommerceClient, webhookVerify } = require('../../lib/adobe-commerce');
const { resolveCredentials } = require('../../lib/adobe-auth');
const got = require('got');
const crypto = require('crypto');

describe('getAdobeCommerceClient', () => {
  const params = {
    COMMERCE_BASE_URL: 'https://example.com',
    OAUTH_CLIENT_ID: 'test-client-id',
    OAUTH_CLIENT_SECRET: JSON.stringify({ secret: 'test-client-secret' }),
    OAUTH_TECHNICAL_ACCOUNT_ID: 'test-technical-account-id',
    OAUTH_TECHNICAL_ACCOUNT_EMAIL: 'test-email@example.com',
    OAUTH_IMS_ORG_ID: 'test-org-id',
    OAUTH_SCOPES: JSON.stringify(['scope1', 'scope2']),
    AIO_CLI_ENV: 'prod',
    LOG_LEVEL: 'debug',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize the Commerce client with IMS options', async () => {
    resolveCredentials.mockResolvedValue({
      apiKey: params.OAUTH_CLIENT_ID,
      imsOrgId: params.OAUTH_IMS_ORG_ID,
      accessToken: 'mock-access-token',
    });
    got.extend.mockReturnValue({
      extend: jest.fn().mockResolvedValue(
        jest.fn().mockReturnValue({
          json: jest.fn().mockReturnValue({}),
        })
      ),
    });

    const client = await getAdobeCommerceClient(params);

    expect(resolveCredentials).toHaveBeenCalledWith(params);
    expect(resolveCredentials).toHaveBeenCalledTimes(1);
    expect(got.extend).toHaveBeenCalledTimes(1);

    expect(client).toHaveProperty('createOopePaymentMethod');
    expect(client).toHaveProperty('getOopePaymentMethod');
    expect(client).toHaveProperty('getOopePaymentMethods');

    const createPaymentMethod = await client.createOopePaymentMethod();
    expect(createPaymentMethod.success).toBeTruthy();
    const getPaymentMethod = await client.getOopePaymentMethod();
    expect(getPaymentMethod.success).toBeTruthy();
    const getPaymentMethods = await client.getOopePaymentMethods();
    expect(getPaymentMethods.success).toBeTruthy();
  });

  test('should handle errors when initializing the Commerce client', async () => {
    resolveCredentials.mockRejectedValue(new Error('Failed to get token'));

    await expect(getAdobeCommerceClient(params)).rejects.toThrow('Failed to get token');
  });
});

describe('webhookVerify', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 512 });
  const body = JSON.stringify({ test: 'data' });
  const signature = crypto.createSign('SHA256').update(body).sign(privateKey, 'base64');

  test('should return success true for valid signature', () => {
    const params = {
      __ow_headers: { 'x-adobe-commerce-webhook-signature': signature },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);
    expect(result).toEqual({ success: true });
  });

  test('should return success false for missing signature header', () => {
    const params = {
      __ow_headers: {},
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test('should return success false for missing body', () => {
    const params = {
      __ow_headers: { 'x-adobe-commerce-webhook-signature': signature },
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test('should return success false for missing public key', () => {
    const params = {
      __ow_headers: { 'x-adobe-commerce-webhook-signature': signature },
      __ow_body: body,
    };

    const result = webhookVerify(params);

    expect(result).toEqual({ success: false, error: expect.any(String) });
  });

  test('should return success false for invalid signature', () => {
    const invalidSignature = 'invalid-signature';
    const params = {
      __ow_headers: { 'x-adobe-commerce-webhook-signature': invalidSignature },
      __ow_body: body,
      COMMERCE_WEBHOOKS_PUBLIC_KEY: publicKey,
    };

    const result = webhookVerify(params);
    expect(result).toEqual({ success: false, error: expect.any(String) });
  });
});
