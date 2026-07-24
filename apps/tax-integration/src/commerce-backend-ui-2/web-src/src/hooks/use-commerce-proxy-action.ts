import { useIms } from "@adobe/aio-commerce-lib-admin-ui/web";
import { useCallback } from "react";

import { useConfig } from "./use-config.ts";

const COMMERCE_PROXY_ACTION = "tax-integration-admin-ui/commerce-proxy-action";

/**
 * Returns a function that POSTs an `operation` (a Commerce REST path fragment) to this
 * extension's generic Commerce proxy action, authenticated with the logged-in admin's IMS
 * credentials (from `useIms()`).
 */
export function useCommerceProxyAction() {
  const { data, error } = useIms();
  const { getActionUrl } = useConfig();

  const imsToken = data?.imsToken;
  const imsOrgId = data?.imsOrgId;

  return useCallback(
    async (
      operation: string,
      method: "GET" | "POST" = "GET",
      payload: Record<string, unknown> | null = null,
    ): Promise<unknown> => {
      if (!(imsToken && imsOrgId)) {
        throw error ?? new Error("IMS credentials are not available.");
      }

      const actionUrl = getActionUrl(COMMERCE_PROXY_ACTION);

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
    },
    [error, getActionUrl, imsOrgId, imsToken],
  );
}
