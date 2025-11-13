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
import { main } from '../../scripts/create-payment-methods.js';
import { getAdobeCommerceClient } from '../../lib/adobe-commerce.js';

vi.mock('../../lib/adobe-commerce.js');

describe('create-payment-methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('payment methods created', async () => {
    mockAdobeCommerceClient(ok({ success: true }), ok({ success: true }));
    const result = await main('test/scripts/payment-methods-test.yaml');
    expect(result).toEqual(['method-1', 'method-2']);
  });
  test('only one payment methods is created', async () => {
    mockAdobeCommerceClient(ok({ success: true }), error({ success: false }));
    const result = await main('test/scripts/payment-methods-test.yaml');
    expect(result).toEqual(['method-1']);
  });
  test('no one payment methods is created', async () => {
    mockAdobeCommerceClient(error({ success: false }), error({ success: false }));
    const result = await main('test/scripts/payment-methods-test.yaml');
    expect(result).toEqual([]);
  });
});

function mockAdobeCommerceClient(response1, response2) {
  getAdobeCommerceClient.mockResolvedValue({
    createOopePaymentMethod: vi.fn().mockResolvedValueOnce(response1).mockResolvedValueOnce(response2),
  });
}

function ok(json = {}) {
  return {
    ok: true,
    json: () => json,
  };
}

function error(json = {}) {
  return {
    ok: false,
    json: () => json,
  };
}
