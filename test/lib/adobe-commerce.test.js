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

import { describe, test, expect } from 'vitest';
import { webhookVerify } from '../../lib/adobe-commerce.js';
import crypto from 'crypto';

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
