// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-admin-ui/web", () => ({
  useIms: vi.fn(),
}));
vi.mock(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-config.ts",
  () => {
    const config = {
      getActionUrl: () => "https://example.com/commerce-proxy-action",
    };
    return { useConfig: () => config };
  },
);

const { useIms } = await import("@adobe/aio-commerce-lib-admin-ui/web");
const { useCommerceProxyAction } = await import(
  "../../src/commerce-backend-ui-2/web-src/src/hooks/use-commerce-proxy-action.ts"
);

beforeEach(() => {
  vi.clearAllMocks();
  useIms.mockReturnValue({
    imsOrgId: "test-org-id",
    imsToken: "test-ims-token",
  });
  global.fetch = vi.fn();
});

describe("useCommerceProxyAction", () => {
  test("POSTs the operation/method to the proxy action URL with the admin's IMS credentials", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ items: [] }),
      ok: true,
    });

    const { result } = renderHook(() => useCommerceProxyAction());

    const response = await result.current("taxClasses/search", "GET");

    expect(response).toEqual({ items: [] });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("https://example.com/commerce-proxy-action");
    expect(options.method).toBe("POST");
    expect(options.headers.authorization).toBe("Bearer test-ims-token");
    expect(options.headers["x-gw-ims-org-id"]).toBe("test-org-id");

    const body = JSON.parse(options.body);
    expect(body.method).toBe("GET");
    expect(body.operation).toBe("taxClasses/search");
    expect(body.payload).toBeUndefined();
  });

  test("includes the payload for a POST operation", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({}),
      ok: true,
    });

    const { result } = renderHook(() => useCommerceProxyAction());

    await result.current("taxClasses", "POST", {
      taxClass: { class_name: "Taxable Goods" },
    });

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.method).toBe("POST");
    expect(body.payload).toEqual({
      taxClass: { class_name: "Taxable Goods" },
    });
  });

  test("throws with the action's error message when the request fails", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.resolve({ message: "Commerce request failed: boom" }),
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useCommerceProxyAction());

    await expect(result.current("taxClasses")).rejects.toThrow(
      "Commerce request failed: boom",
    );
  });

  test("falls back to a generic message when the error response has no body", async () => {
    global.fetch.mockResolvedValue({
      json: () => Promise.reject(new Error("no body")),
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useCommerceProxyAction());

    await expect(result.current("taxClasses")).rejects.toThrow(
      "Commerce request failed with status 500",
    );
  });
});
