/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { defineConfig } from "@adobe/aio-commerce-lib-app/config";

export default defineConfig({
  metadata: {
    description:
      "Adobe Commerce checkout starter kit discount webhook actions (cart totals collector rules).",
    displayName: "Checkout Totals Collector",
    id: "checkout-totals-collector",
    version: "1.0.0",
  },
  // Commerce exposes exactly ONE `get_total_modifications.execute` subscription slot for the
  // entire totals-collector contract — the 9 actions under actions/ are alternative EXAMPLE
  // implementations of that same contract, not 9 independently-active webhooks.
  //
  // PICK ONE: this `runtimeAction` is a swappable placeholder, defaulted to
  // `tiered-quantity-discount`. Before deploying to a real store, change BOTH entries below to
  // whichever single discount action you actually want live — never point this webhook at more
  // than one action at a time.
  webhooks: [
    {
      category: "modification",
      description:
        "Adds discount JSON-patch operations to the cart totals collector response (PaaS). Placeholder: swap runtimeAction for the one discount example you want live.",
      env: ["paas"],
      label: "Totals Collector Discount (PaaS)",
      requireAdobeAuth: true,
      runtimeAction: "totals-collector/tiered-quantity-discount",
      webhook: {
        batch_name: "totals_collector",
        fallback_error_message:
          "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
        fields: [
          { name: "total" },
          { name: "quote" },
          { name: "shippingAssignment" },
        ],
        hook_name: "totals_collector",
        method: "POST",
        soft_timeout: 1000,
        timeout: 30_000,
        webhook_method:
          "plugin.magento.out_of_process_totals_collector.api.get_total_modifications.execute",
        webhook_type: "after",
      },
    },
    {
      category: "modification",
      description:
        "Adds discount JSON-patch operations to the cart totals collector response (SaaS). Placeholder: swap runtimeAction for the one discount example you want live.",
      env: ["saas"],
      label: "Totals Collector Discount (SaaS)",
      requireAdobeAuth: true,
      runtimeAction: "totals-collector/tiered-quantity-discount",
      webhook: {
        batch_name: "totals_collector",
        fallback_error_message:
          "We encountered an issue while calculating your discounts. Please contact the store owner for further assistance.",
        fields: [
          { name: "total" },
          { name: "quote" },
          { name: "shippingAssignment" },
        ],
        hook_name: "totals_collector",
        method: "POST",
        soft_timeout: 1000,
        timeout: 30_000,
        webhook_method:
          "plugin.out_of_process_totals_collector.api.get_total_modifications.execute",
        webhook_type: "after",
      },
    },
  ],
});
