import type { TaxClass } from "../components/tax-class-dialog.tsx";

export type CommerceTaxClassRow = {
  rowNumber: number;
  id: number;
  classType: string;
  className: string;
  customTaxCode: string;
  customTaxLabel: string;
};

export async function fetchCommerceTaxClasses(
  commerceHost: string,
  imsToken: string,
): Promise<CommerceTaxClassRow[]> {
  const queryParams = new URLSearchParams({
    "searchCriteria[currentPage]": "1",
    "searchCriteria[pageSize]": "100",
  }).toString();

  const response = await fetch(
    `${commerceHost}V1/taxClasses/search?${queryParams}`,
    {
      headers: { Authorization: `Bearer ${imsToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Commerce request failed with status ${response.status}`);
  }

  const { items } = await response.json();
  // biome-ignore lint/suspicious/noExplicitAny: Commerce REST response shape, not worth typing fully for a single mapping
  return items.map((item: any, index: number) => ({
    className: item.class_name,
    classType: item.class_type,
    customTaxCode:
      item.custom_attributes?.find(
        // biome-ignore lint/suspicious/noExplicitAny: see above
        (attr: any) => attr.attribute_code === "tax_code",
      )?.value || "",
    customTaxLabel:
      item.custom_attributes?.find(
        // biome-ignore lint/suspicious/noExplicitAny: see above
        (attr: any) => attr.attribute_code === "tax_label",
      )?.value || "",
    id: item.class_id,
    rowNumber: index + 1,
  }));
}

export async function createOrUpdateCommerceTaxClass(
  commerceHost: string,
  imsToken: string,
  taxClass: TaxClass,
  // biome-ignore lint/suspicious/noExplicitAny: passes through Commerce's raw response body
): Promise<any> {
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

  const response = await fetch(`${commerceHost}V1/taxClasses`, {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${imsToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Commerce request failed with status ${response.status}`);
  }

  return response.json();
}
