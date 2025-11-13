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

import { defineMetrics } from '@adobe/aio-lib-telemetry';
import { ValueType } from '@adobe/aio-lib-telemetry/otel';

/** Metrics for checkout-related actions. */
export const checkoutMetrics = defineMetrics((meter) => {
  return {
    // Collect Taxes Metrics
    collectTaxesTotalCounter: meter.createCounter('checkout.collect_taxes.total_count', {
      description: 'Total number of collect taxes requests.',
      valueType: ValueType.INT,
    }),
    collectTaxesSuccessCounter: meter.createCounter('checkout.collect_taxes.success_count', {
      description: 'Number of successful collect taxes requests.',
      valueType: ValueType.INT,
    }),
    collectTaxesErrorCounter: meter.createCounter('checkout.collect_taxes.error_count', {
      description: 'Number of failed collect taxes requests.',
      valueType: ValueType.INT,
    }),

    // Filter Payment Metrics
    filterPaymentTotalCounter: meter.createCounter('checkout.filter_payment.total_count', {
      description: 'Total number of filter payment requests.',
      valueType: ValueType.INT,
    }),
    filterPaymentSuccessCounter: meter.createCounter('checkout.filter_payment.success_count', {
      description: 'Number of successful filter payment requests.',
      valueType: ValueType.INT,
    }),
    filterPaymentErrorCounter: meter.createCounter('checkout.filter_payment.error_count', {
      description: 'Number of failed filter payment requests.',
      valueType: ValueType.INT,
    }),

    // Shipping Methods Metrics
    shippingMethodsTotalCounter: meter.createCounter('checkout.shipping_methods.total_count', {
      description: 'Total number of shipping methods requests.',
      valueType: ValueType.INT,
    }),
    shippingMethodsSuccessCounter: meter.createCounter('checkout.shipping_methods.success_count', {
      description: 'Number of successful shipping methods requests.',
      valueType: ValueType.INT,
    }),
    shippingMethodsErrorCounter: meter.createCounter('checkout.shipping_methods.error_count', {
      description: 'Number of failed shipping methods requests.',
      valueType: ValueType.INT,
    }),

    // Validate Payment Metrics
    validatePaymentTotalCounter: meter.createCounter('checkout.validate_payment.total_count', {
      description: 'Total number of validate payment requests.',
      valueType: ValueType.INT,
    }),
    validatePaymentSuccessCounter: meter.createCounter('checkout.validate_payment.success_count', {
      description: 'Number of successful validate payment requests.',
      valueType: ValueType.INT,
    }),
    validatePaymentErrorCounter: meter.createCounter('checkout.validate_payment.error_count', {
      description: 'Number of failed validate payment requests.',
      valueType: ValueType.INT,
    }),
  };
});
