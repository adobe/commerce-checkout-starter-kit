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
import { main } from '../../scripts/create-tax-integrations.js';
import { getAdobeCommerceClient } from '../../lib/adobe-commerce.js';

vi.mock('../../lib/adobe-commerce.js');

describe('create-tax-integrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('tax integrations created', async () => {
    mockAdobeCommerceClient({ success: true }, { success: true });
    const result = await main('test/scripts/tax-integrations-test.yaml');
    expect(result).toEqual(['tax-integration-1', 'tax-integration-2']);
  });
  test('only one tax integrations is created', async () => {
    mockAdobeCommerceClient({ success: true }, { success: false });
    const result = await main('test/scripts/tax-integrations-test.yaml');
    expect(result).toEqual(['tax-integration-1']);
  });
  test('no one tax integrations is created', async () => {
    mockAdobeCommerceClient({ success: false }, { success: false });
    const result = await main('test/scripts/tax-integrations-test.yaml');
    expect(result).toEqual([]);
  });
});

/**
 * Mocks the Adobe Commerce client with two predefined responses.
 * @param {object} response1 The response for the first tax integration request
 * @param {object} response2 The response for the second tax integration request
 */
function mockAdobeCommerceClient(response1, response2) {
  getAdobeCommerceClient.mockResolvedValue({
    createTaxIntegration: vi.fn().mockResolvedValueOnce(response1).mockResolvedValueOnce(response2),
  });
}
