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

const TAX_RATES = Object.freeze({
  EXCLUDING_TAX: [
    { code: 'state_tax', rate: 4.5, title: 'State Tax' },
    { code: 'county_tax', rate: 3.6, title: 'County Tax' },
  ],
  INCLUDING_TAX: [{ code: 'vat', rate: 8.4, title: 'VAT' }],
});

/**
 * @param {object} params include the parameters received in the runtime action
 * @returns {object} success status and error message
 */
async function collectTaxes(params) {
  const operations = [];

  for (let i = 0; i < params.oopQuote.items.length; i++) {
    const item = params.oopQuote.items[i];
    const taxesToApply = item.is_tax_included ? TAX_RATES.INCLUDING_TAX : TAX_RATES.EXCLUDING_TAX;

    // discount is applied before tax (Apply Tax After Discount = NO)
    const discountAmount = Math.min(item.unit_price * item.quantity, item.discount_amount);
    let taxableAmount = item.unit_price * item.quantity - discountAmount;
    let itemTaxAmount = 0.0;
    let discountCompensationTaxAmount = 0.0;

    taxesToApply.forEach((tax) => {
      let taxAmount = 0;
      let hiddenTax = 0;
      if (item.is_tax_included) {
        // Reverse tax calculation when tax is included in price
        taxAmount = taxableAmount - taxableAmount / (1 + tax.rate / 100);
        // Hidden tax calculation assumes discount is applied before tax
        hiddenTax = discountAmount - discountAmount / (1 + tax.rate / 100);
        discountCompensationTaxAmount += hiddenTax;
      } else {
        // Standard tax calculation when tax is excluded
        taxAmount = taxableAmount * (tax.rate / 100);
      }
      taxAmount = Math.round(taxAmount * 100) / 100;

      itemTaxAmount += taxAmount;

      operations.push({
        op: 'add',
        path: `oopQuote/items/${i}/tax_breakdown`,
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
      });
    });

    itemTaxAmount = Math.round(itemTaxAmount * 100) / 100;
    discountCompensationTaxAmount = Math.round(discountCompensationTaxAmount * 100) / 100;

    // Final tax rate is calculated based on the item net price
    const netPrice = item.is_tax_included ? taxableAmount - itemTaxAmount : taxableAmount;
    const itemTaxRate = netPrice > 0 ? Math.round((itemTaxAmount / netPrice) * 10000) / 100 : 0;

    operations.push({
      op: 'replace',
      path: `oopQuote/items/${i}/tax`,
      value: {
        data: {
          rate: itemTaxRate,
          amount: itemTaxAmount,
          discount_compensation_amount: discountCompensationTaxAmount,
        },
      },
      instance: 'Magento\\OutOfProcessTaxManagement\\Api\\Data\\OopQuoteItemTaxInterface',
    });
  }

  return {
    success: true,
    body: operations,
  };
}

module.exports = {
  collectTaxes,
};