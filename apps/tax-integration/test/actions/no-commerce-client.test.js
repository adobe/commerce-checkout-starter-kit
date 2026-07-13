import fs from "node:fs";

import { describe, expect, test } from "vitest";

const GET_COMMERCE_CLIENT_PATTERN = /getCommerceClient/;
const GET_ADOBE_COMMERCE_CLIENT_PATTERN = /getAdobeCommerceClient/;

describe("collect-taxes / collect-adjustment-taxes have no Commerce client dependency", () => {
  test.each([
    "src/commerce-extensibility-1/actions/collect-taxes/index.js",
    "src/commerce-extensibility-1/actions/collect-adjustment-taxes/index.js",
  ])("%s does not import getCommerceClient or a Commerce HTTP client", (file) => {
    const source = fs.readFileSync(
      new URL(`../../${file}`, import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(GET_COMMERCE_CLIENT_PATTERN);
    expect(source).not.toMatch(GET_ADOBE_COMMERCE_CLIENT_PATTERN);
  });
});
