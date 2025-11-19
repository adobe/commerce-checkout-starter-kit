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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getAdobeCommerceClient, webhookVerify } from '../../lib/adobe-commerce.js';
import crypto from 'crypto';
import nock from 'nock';

vi.mock('@adobe/aio-lib-ims', async () => {
  const actual = await vi.importActual('@adobe/aio-lib-ims');
  const mockGetToken = vi.fn();
  return {
    default: {
      context: actual.context,
      getToken: mockGetToken,
    },
    context: actual.context,
    getToken: mockGetToken,
  };
});

// Get the mocked module to access mockGetToken
const { getToken: mockGetToken } = await import('@adobe/aio-lib-ims');

describe('getAdobeCommerceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAdobeCommerceClient', () => {
    const sharedParams = {
      AIO_COMMERCE_API_BASE_URL: 'http://mycommerce.com',
      LOG_LEVEL: 'debug',
    };
    test('with IMS auth', async () => {
      const params = {
        ...sharedParams,
        AIO_COMMERCE_AUTH_IMS_CLIENT_ID: 'test-client-id',
        AIO_COMMERCE_AUTH_IMS_CLIENT_SECRETS: JSON.stringify(['supersecret']),
        AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_ID: 'test-technical-account-id',
        AIO_COMMERCE_AUTH_IMS_TECHNICAL_ACCOUNT_EMAIL: 'test-email@example.com',
        AIO_COMMERCE_AUTH_IMS_ORG_ID: 'test-org-id',
        AIO_COMMERCE_AUTH_IMS_SCOPES: JSON.stringify(['scope1', 'scope2']),
      };
      mockGetToken.mockResolvedValue('supersecrettoken');
      const scope = nock(params.AIO_COMMERCE_API_BASE_URL)
        .get('/V1/testauth')
        .matchHeader('Content-Type', 'application/json')
        .matchHeader('x-ims-org-id', params.AIO_COMMERCE_AUTH_IMS_ORG_ID)
        .matchHeader('x-api-key', params.AIO_COMMERCE_AUTH_IMS_CLIENT_ID)
        .matchHeader('Authorization', 'Bearer supersecrettoken')
        .reply(200);

      const client = await getAdobeCommerceClient(params);
      expect(mockGetToken).toHaveBeenCalled();

      const { success } = await client.get('testauth');
      expect(success).toBeTruthy();
      scope.done();
    });

    test('with Commerce integration auth', async () => {
      const params = {
        ...sharedParams,
        AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_KEY: 'test-consumer-key',
        AIO_COMMERCE_AUTH_INTEGRATION_CONSUMER_SECRET: 'test-consumer-secret',
        AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN: 'test-access-token',
        AIO_COMMERCE_AUTH_INTEGRATION_ACCESS_TOKEN_SECRET: 'test-access-token-secret',
      };

      const scope = nock(params.AIO_COMMERCE_API_BASE_URL)
        .get('/V1/testauth')
        .matchHeader('Content-Type', 'application/json')
        .matchHeader(
          'Authorization',
          /^OAuth oauth_consumer_key="test-consumer-key", oauth_nonce="[^"]+", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA256", oauth_timestamp="[^"]+", oauth_token="test-access-token", oauth_version="1\.0"$/
        )
        .reply(200);

      const client = await getAdobeCommerceClient(params);

      const { success } = await client.get('testauth');
      expect(success).toBeTruthy();
      scope.done();
    });

    test('throws when missing auth method', async () => {
      await expect(getAdobeCommerceClient(sharedParams)).rejects.toThrow(
        "Can't resolve authentication options for the given params."
      );
    });
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
