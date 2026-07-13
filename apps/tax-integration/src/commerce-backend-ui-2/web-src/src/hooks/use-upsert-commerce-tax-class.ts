import { useCallback } from "react";

import { useCommerceProxyAction } from "./use-commerce-proxy-action.ts";

import type { TaxClass } from "../components/tax-class-dialog.tsx";

/**
 * Returns a function that creates or updates a Commerce tax class.
 */
export function useUpsertCommerceTaxClass() {
  const callProxyAction = useCommerceProxyAction();

  return useCallback(
    (taxClass: TaxClass) => {
      const payload = {
        taxClass: {
          class_id: taxClass.id,
          class_name: taxClass.className,
          class_type: taxClass.classType, // only the create request uses class_type
          custom_attributes: [
            { attribute_code: "tax_code", value: taxClass.customTaxCode },
            { attribute_code: "tax_label", value: taxClass.customTaxLabel },
          ],
        },
      };

      return callProxyAction("taxClasses", "POST", payload);
    },
    [callProxyAction],
  );
}
