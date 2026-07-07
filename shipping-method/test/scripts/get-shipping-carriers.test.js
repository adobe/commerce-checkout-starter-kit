import { beforeEach, describe, expect, test, vi } from "vitest";

import { getAdobeCommerceClient } from "../../lib/commerce-client.js";
import { main } from "../../scripts/get-shipping-carriers.js";

vi.mock("../../lib/commerce-client.js");

describe("get-shipping-carriers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  test("logs the fetched carriers on success", async () => {
    getAdobeCommerceClient.mockResolvedValue({
      getOopeShippingCarriers: vi
        .fn()
        .mockResolvedValue({ message: [{ code: "DPS" }], success: true }),
    });

    await main();

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("Total 1 shipping carriers fetched"),
    );
  });

  test("logs an error when the request fails", async () => {
    getAdobeCommerceClient.mockResolvedValue({
      getOopeShippingCarriers: vi
        .fn()
        .mockResolvedValue({ message: "boom", success: false }),
    });

    await main();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to retrieve shipping carriers"),
    );
  });
});
