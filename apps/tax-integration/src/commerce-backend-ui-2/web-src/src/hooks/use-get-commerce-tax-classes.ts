import { useCallback, useEffect, useState } from "react";

import { useCommerceProxyAction } from "./use-commerce-proxy-action.ts";

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

function mapTaxClassItem(
  item: CommerceTaxClassApiItem,
  index: number,
): CommerceTaxClassRow {
  return {
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
  };
}

/**
 * Fetches the first page of Commerce tax classes on mount and maps them into the row shape the
 * tax-classes table renders.
 */
export function useGetCommerceTaxClasses() {
  const callProxyAction = useCommerceProxyAction();

  const [commerceTaxClasses, setCommerceTaxClasses] = useState<
    CommerceTaxClassRow[]
  >([]);
  const [isLoadingCommerceTaxClasses, setIsLoadingCommerceTaxClasses] =
    useState(true);

  const fetchCommerceTaxClasses = useCallback(async () => {
    setIsLoadingCommerceTaxClasses(true);

    try {
      const queryParams = new URLSearchParams({
        "searchCriteria[currentPage]": "1",
        "searchCriteria[pageSize]": "100",
      }).toString();

      const { items } = (await callProxyAction(
        `taxClasses/search?${queryParams}`,
      )) as { items: CommerceTaxClassApiItem[] };

      setCommerceTaxClasses(items.map(mapTaxClassItem));
    } catch (error) {
      console.error("Error fetching commerce tax classes:", error);
      setCommerceTaxClasses([]);
    } finally {
      setIsLoadingCommerceTaxClasses(false);
    }
  }, [callProxyAction]);

  useEffect(() => {
    fetchCommerceTaxClasses();
  }, [fetchCommerceTaxClasses]);

  return {
    commerceTaxClasses,
    isLoadingCommerceTaxClasses,
    refetchCommerceTaxClasses: fetchCommerceTaxClasses,
  };
}
