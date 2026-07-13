import actionUrls from "../config.json";

import type { TaxClass } from "../components/tax-class-dialog.tsx";

const COMMERCE_TAX_CLASSES_ACTION =
  "tax-integration-admin-ui/commerce-tax-classes";

export type CommerceTaxClassRow = {
  rowNumber: number;
  id: number;
  classType: string;
  className: string;
  customTaxCode: string;
  customTaxLabel: string;
};

type CommerceTaxClassApiItem = {
  class_id: number;
  class_type: string;
  class_name: string;
  custom_attributes?: { attribute_code: string; value: string }[];
};

/**
 * Calls a backend Adobe I/O Runtime action declared in `config.json` (rewritten by the app
 * builder CLI at build/dev time with each action's live URL), mirroring
 * `commerce-backend-ui-1`'s `callAction` utility.
 *
 * @param action the `<package>/<action>` key to look up in `config.json`
 * @param operation the specific operation name for the backend to execute
 * @param imsToken the logged-in admin's IMS bearer token (from `useIms()`)
 * @param imsOrgId the logged-in admin's IMS org ID (from `useIms()`)
 * @param method the HTTP method to be passed to the backend
 * @param payload the optional request payload
 */
async function callAction(
  action: string,
  operation: string,
  imsToken: string,
  imsOrgId: string,
  method: "GET" | "POST" = "GET",
  payload: Record<string, unknown> | null = null,
): Promise<unknown> {
  const actionUrl = (actionUrls as Record<string, string>)[action];

  const response = await fetch(actionUrl, {
    body: JSON.stringify({
      method,
      operation,
      ...(payload ? { payload } : {}),
    }),
    headers: {
      authorization: `Bearer ${imsToken}`,
      "Content-Type": "application/json",
      "x-gw-ims-org-id": imsOrgId,
    },
    method: "POST",
  });

  if (!response.ok) {
    const { message } = await response.json().catch(() => ({}));
    throw new Error(
      message || `Commerce request failed with status ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Fetches the first page of Commerce tax classes and maps them into the
 * row shape the tax-classes table renders.
 *
 * @param imsToken the logged-in admin's IMS bearer token (from `useIms()`)
 * @param imsOrgId the logged-in admin's IMS org ID (from `useIms()`)
 */
export async function fetchCommerceTaxClasses(
  imsToken: string,
  imsOrgId: string,
): Promise<CommerceTaxClassRow[]> {
  const queryParams = new URLSearchParams({
    "searchCriteria[currentPage]": "1",
    "searchCriteria[pageSize]": "100",
  }).toString();

  const { items } = (await callAction(
    COMMERCE_TAX_CLASSES_ACTION,
    `taxClasses/search?${queryParams}`,
    imsToken,
    imsOrgId,
  )) as { items: CommerceTaxClassApiItem[] };

  return items.map((item, index) => ({
    className: item.class_name,
    classType: item.class_type,
    customTaxCode:
      item.custom_attributes?.find((attr) => attr.attribute_code === "tax_code")
        ?.value || "",
    customTaxLabel:
      item.custom_attributes?.find(
        (attr) => attr.attribute_code === "tax_label",
      )?.value || "",
    id: item.class_id,
    rowNumber: index + 1,
  }));
}

/**
 * Creates or updates a Commerce tax class.
 *
 * @param imsToken the logged-in admin's IMS bearer token (from `useIms()`)
 * @param imsOrgId the logged-in admin's IMS org ID (from `useIms()`)
 * @param taxClass the tax class to create or update
 */
export function createOrUpdateCommerceTaxClass(
  imsToken: string,
  imsOrgId: string,
  taxClass: TaxClass,
) {
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

  return callAction(
    COMMERCE_TAX_CLASSES_ACTION,
    "taxClasses",
    imsToken,
    imsOrgId,
    "POST",
    payload,
  );
}
