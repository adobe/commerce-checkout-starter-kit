import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@adobe/aio-commerce-lib-api", () => ({
  AdobeCommerceHttpClient: vi.fn(),
  resolveCommerceHttpClientParams: vi.fn((params) => params),
}));

const { AdobeCommerceHttpClient, resolveCommerceHttpClientParams } =
  await import("@adobe/aio-commerce-lib-api");
const { main } = await import("../../scripts/get-shipping-carriers.js");

describe("get-shipping-carriers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  test("resolves client params from process.env", async () => {
    // A regular function, not an arrow function: mockImplementation is invoked via `new`, and
    // arrow functions cannot be constructors.
    AdobeCommerceHttpClient.mockImplementation(function FakeClient() {
      return { get: () => ({ json: () => Promise.resolve([]) }) };
    });

    await main();

    expect(resolveCommerceHttpClientParams).toHaveBeenCalledWith(process.env);
  });

  test("logs the fetched carriers on success", async () => {
    AdobeCommerceHttpClient.mockImplementation(function FakeClient() {
      return {
        get: (path) => {
          expect(path).toBe("oope_shipping_carrier/");
          return { json: () => Promise.resolve([{ code: "DPS" }]) };
        },
      };
    });

    await main();

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("Total 1 shipping carriers fetched"),
    );
  });

  test("logs an error when the request fails", async () => {
    AdobeCommerceHttpClient.mockImplementation(function FakeClient() {
      return { get: () => ({ json: () => Promise.reject(new Error("boom")) }) };
    });

    await main();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to retrieve shipping carriers: boom"),
    );
  });
});
