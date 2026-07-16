import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-app", () => ({
  getCommerceClient: vi.fn(),
}));
vi.mock("@adobe/aio-commerce-sdk/auth", () => ({
  forwardImsAuthProvider: vi.fn((params) => params),
}));

const { getCommerceClient } = await import("@adobe/aio-commerce-lib-app");
const { forwardImsAuthProvider } = await import("@adobe/aio-commerce-sdk/auth");
const { main } = await import(
  "../../src/commerce-backend-ui-2/actions/commerce-proxy-action/index.js"
);

function mockClient({ get, post } = {}) {
  getCommerceClient.mockResolvedValue({
    get: get ?? vi.fn(),
    post: post ?? vi.fn(),
  });
}

function buildParams(overrides = {}) {
  return {
    __ow_headers: { authorization: "Bearer admin-ims-token" },
    operation: "taxClasses/search",
    ...overrides,
  };
}

describe("commerce-proxy-action admin-ui action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves the Commerce client from the caller's forwarded IMS auth and GETs the operation", async () => {
    mockClient({
      get: vi
        .fn()
        .mockReturnValue({ json: () => Promise.resolve({ items: [] }) }),
    });

    const params = buildParams();
    const result = await main(params);

    expect(forwardImsAuthProvider).toHaveBeenCalledWith(params);
    expect(result).toEqual({
      body: { items: [] },
      statusCode: 200,
      type: "success",
    });

    const client = await getCommerceClient.mock.results[0].value;
    expect(client.get).toHaveBeenCalledWith("taxClasses/search");
  });

  test("POSTs the payload for a create/update request", async () => {
    const post = vi.fn().mockReturnValue({ json: () => Promise.resolve({}) });
    mockClient({ post });

    await main(
      buildParams({
        method: "POST",
        operation: "taxClasses",
        payload: { taxClass: { class_name: "Taxable Goods" } },
      }),
    );

    expect(post).toHaveBeenCalledWith("taxClasses", {
      json: { taxClass: { class_name: "Taxable Goods" } },
    });
  });

  test("returns 405 for an unsupported method", async () => {
    const result = await main(buildParams({ method: "DELETE" }));

    expect(result).toEqual({
      body: { message: "Method DELETE not allowed" },
      statusCode: 405,
    });
    expect(getCommerceClient).not.toHaveBeenCalled();
  });

  test("returns 400 when the caller's credentials can't be forwarded", async () => {
    forwardImsAuthProvider.mockImplementationOnce(() => {
      throw new Error("Missing Authorization header");
    });

    const result = await main(buildParams({ __ow_headers: {} }));

    expect(result).toEqual({
      body: { message: "Missing Authorization header" },
      statusCode: 400,
    });
    expect(getCommerceClient).not.toHaveBeenCalled();
  });

  test("returns 500 when the app is not associated with a Commerce instance", async () => {
    getCommerceClient.mockRejectedValue(new Error("App is not associated"));

    const result = await main(buildParams());

    expect(result).toEqual({
      body: { message: "Commerce request failed: App is not associated" },
      statusCode: 500,
    });
  });

  test("returns 500 when the downstream Commerce request fails", async () => {
    mockClient({
      get: vi.fn().mockReturnValue({
        json: () => Promise.reject(new Error("Commerce unavailable")),
      }),
    });

    const result = await main(buildParams());

    expect(result).toEqual({
      body: { message: "Commerce request failed: Commerce unavailable" },
      statusCode: 500,
    });
  });
});
