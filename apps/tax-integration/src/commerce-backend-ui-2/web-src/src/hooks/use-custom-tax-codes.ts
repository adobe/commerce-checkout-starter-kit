import { useCallback, useEffect, useState } from "react";

export type CustomTaxCode = {
  taxCode: string;
  name: string;
};

export function useCustomTaxCodes() {
  const [customTaxCodes, setCustomTaxCodes] = useState<CustomTaxCode[]>([]);
  const [isLoadingCustomTaxCodes, setIsLoadingCustomTaxCodes] = useState(true);

  const fetchCustomTaxCodes = useCallback(() => {
    setIsLoadingCustomTaxCodes(true);

    try {
      // fetch here your custom tax codes
      // Mock tax codes for example
      const codes = [
        { name: "Books", taxCode: "001" },
        { name: "Food", taxCode: "002" },
        { name: "Clothing", taxCode: "003" },
      ];

      setCustomTaxCodes(codes);
    } catch (error) {
      console.error("Error fetching custom tax codes:", error);
      setCustomTaxCodes([]);
    } finally {
      setIsLoadingCustomTaxCodes(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomTaxCodes();
  }, [fetchCustomTaxCodes]);

  return { customTaxCodes, isLoadingCustomTaxCodes };
}
