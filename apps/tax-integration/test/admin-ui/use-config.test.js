// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("../../src/commerce-backend-ui-2/web-src/src/config.json", () => ({
  default: {
    "tax-integration-admin-ui/commerce-proxy-action":
      "https://example.com/commerce-proxy-action",
  },
}));

const { useConfig } = await import(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-config.ts"
);

describe("useConfig", () => {
  test("getActionUrl resolves an action's URL from config.json", () => {
    const { result } = renderHook(() => useConfig());

    expect(
      result.current.getActionUrl(
        "tax-integration-admin-ui/commerce-proxy-action",
      ),
    ).toBe("https://example.com/commerce-proxy-action");
  });

  test("getActionUrl returns undefined for an unknown action", () => {
    const { result } = renderHook(() => useConfig());

    expect(result.current.getActionUrl("unknown/action")).toBeUndefined();
  });
});
