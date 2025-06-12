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

const { Core } = require('@adobe/aio-sdk');
const { HTTP_OK } = require('../../lib/http');
const { webhookErrorResponse, webhookVerify } = require('../../lib/adobe-commerce');

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: [
    { code: 'state_tax', rate: 4.5, title: 'State Tax' },
    { code: 'county_tax', rate: 3.6, title: 'County Tax' },
  ],
  INCLUDING_TAX: [{ code: 'vat', rate: 8.4, title: 'VAT' }],
});

/**
 * This action calculates the tax for the given request.
 * It has to be configured as Commerce Webhook in the Adobe Commerce Admin.
 *
 * @param {object} params - method params includes environment and request data
 * @returns {Promise<{statusCode: number, body: {op: string}}>} the response object
 * @see https://developer.adobe.com/commerce/extensibility/webhooks
 */
async function main(params) {
  const logger = Core.Logger('tax-calculation', { level: params.LOG_LEVEL || 'info' });

  try {
    const { success, error } = webhookVerify(params);
    if (!success) {
      return webhookErrorResponse(`Failed to verify the webhook signature: ${error}`);
    }

    // in the case when "raw-http: true" the body needs to be decoded and converted to JSON
    const body = JSON.parse(atob(params.__ow_body));
    logger.debug('Received request: ', body);

    const operations = [];

    body.oopQuote.items.forEach((item, index) => {
      operations.push(...calculateTaxOperations(item, index));
    });

    logger.info('Tax calculation response : ', JSON.stringify(operations, null, 2));

    return {
      statusCode: HTTP_OK,
      body: JSON.stringify(operations),
    };
  } catch (error) {
    logger.error(error);
    return webhookErrorResponse(`Server error: ${error.message}`);
  }
}

/**
 * Calculates the tax operations for the given item.
 * @param {object} item the item to calculate the tax operations for
 * @param {number} index the index of the item in the quote
 * @returns {{op: string, path: string, value: object, instance: string}[]} the tax operations
 */
function calculateTaxOperations(item, index) {
  const taxesToApply = obtainTaxRates(item);

  const operations = [];

  // This sample assumes that discount is applied before tax (Apply Tax After Discount = NO)
  const discountAmount = Math.min(item.unit_price * item.quantity, item.discount_amount);
  const taxableAmount = item.unit_price * item.quantity - discountAmount;
  let itemTaxAmount = 0.0;
  let discountCompensationTaxAmount = 0.0;

  taxesToApply.forEach((tax) => {
    let taxAmount = 0;

    if (item.is_tax_included) {
      // Reverse tax calculation when tax is included in price
      taxAmount = taxableAmount - taxableAmount / (1 + tax.rate / 100);
      // Hidden tax calculation assumes discount is applied before tax
      const hiddenTax = discountAmount - discountAmount / (1 + tax.rate / 100);
      discountCompensationTaxAmount += hiddenTax;
    } else {
      taxAmount = taxableAmount * (tax.rate / 100);
    }

    taxAmount = Math.round(taxAmount * 100) / 100;
    itemTaxAmount += taxAmount;

    operations.push(createTaxBreakdownOperation(index, tax, taxAmount));
  });

  itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
  discountCompensationTaxAmount = Math.round(discountCompensationTaxAmount * 100) / 100;

  const netPrice = item.is_tax_included ? taxableAmount - itemTaxAmount : taxableAmount;
  const itemTaxRate = netPrice > 0 ? Math.round((itemTaxAmount / netPrice) * 10000) / 100 : 0;

  operations.push(createTaxSummaryOperation(index, itemTaxRate, itemTaxAmount, discountCompensationTaxAmount));

  return operations;
}

/**
 * Resolves the tax rates for the given item.
 * @param {object} item the item to resolve the tax rates for
 * @returns {{code: string, rate: number, title: string}[]} the tax rates
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#responses
 */
function obtainTaxRates(item) {
  // Replace this example with external tax service containing the tax rates
  return item.is_tax_included ? TAX_RATES.INCLUDING_TAX : TAX_RATES.EXCLUDING_TAX;
}

/**
 * Creates a tax breakdown operation for the given item.
 * @param {number} index operation index
 * @param {object} tax operation tax
 * @param {number} taxAmount operation tax amount
 * @returns {{op: string, path: string, value: object, instance: string}} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#add-operation
 */
function createTaxBreakdownOperation(index, tax, taxAmount) {
  return {
    op: 'add',
    path: `oopQuote/items/${index}/tax_breakdown`,
    value: {
      data: {
        code: tax.code,
        rate: tax.rate,
        amount: taxAmount,
        title: tax.title,
        tax_rate_key: `${tax.code}-${tax.rate}`,
      },
    },
    instance: 'Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxBreakdownInterface',
  };
}

/**
 * Creates a tax summary operation for the given item.
 * @param {number} index operation index
 * @param {number} itemTaxRate operation item tax rate
 * @param {number} itemTaxAmount operation item tax amount
 * @param {number} discountCompensationTaxAmount operation discount compensation tax amount
 * @returns {{op: string, path: string, value: object, instance: string}} the response operation
 * @see https://developer.adobe.com/commerce/extensibility/webhooks/responses/#replace-operation
 */
function createTaxSummaryOperation(index, itemTaxRate, itemTaxAmount, discountCompensationTaxAmount) {
  return {
    op: 'replace',
    path: `oopQuote/items/${index}/tax`,
    value: {
      data: {
        rate: itemTaxRate,
        amount: itemTaxAmount,
        discount_compensation_amount: discountCompensationTaxAmount,
      },
    },
    instance: 'Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxInterface',
  };
}

exports.main = main;
