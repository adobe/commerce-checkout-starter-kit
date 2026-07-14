/*
Copyright 2026 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import { readFileSync } from "node:fs";

import { describe, expect, test, vi } from "vitest";

import {
  parseWorkspaceConfig,
  resolveWorkspaceConfig,
  resolveWorkspaceEnvVarName,
  SECRET_FIELDS,
  serialize,
} from "../../scripts/prepare-workspace-config.js";

const rawWorkspaceJson = JSON.parse(
  readFileSync(
    new URL("./workspace-config-test.json", import.meta.url),
    "utf-8",
  ),
);

const MISSING_CLIENTID_ERROR = /CLIENTID/;
const MISSING_RUNTIME_NAMESPACE_ERROR = /AIO_RUNTIME_NAMESPACE/;
const MISSING_SECRET_ERROR = /TOTALS_COLLECTOR_PR/;
const INVALID_JSON_ERROR = /not valid JSON/;

describe("resolveWorkspaceEnvVarName", () => {
  test("uppercases and replaces hyphens with underscores", () => {
    expect(resolveWorkspaceEnvVarName("shipping-method", "PR")).toBe(
      "SHIPPING_METHOD_PR",
    );
    expect(resolveWorkspaceEnvVarName("totals-collector", "MAIN")).toBe(
      "TOTALS_COLLECTOR_MAIN",
    );
  });
});

describe("parseWorkspaceConfig", () => {
  test("flattens a raw workspace.json into the expected fields", () => {
    expect(parseWorkspaceConfig(rawWorkspaceJson)).toEqual({
      CLIENTID: "test-client-id",
      CLIENTSECRET: "test-client-secret",
      TECHNICALACCOUNTID: "test-tech-acct-id@techacct.adobe.com",
      TECHNICALACCOUNTEMAIL: "test-tech-acct@techacct.adobe.com",
      IMSORGID: "2BB51E2264CC11A30A495EE7@AdobeOrg",
      SCOPES: ["AdobeID", "openid", "adobeio_api"],
      AIO_RUNTIME_NAMESPACE: "12345-shippingmethodmain",
      AIO_RUNTIME_AUTH: "test-runtime-auth",
      AIO_PROJECT_ID: "4566206088345709923",
      AIO_PROJECT_NAME: "CommerceCheckoutStarterKit",
      AIO_PROJECT_ORG_ID: "1340225",
      AIO_PROJECT_WORKSPACE_ID: "4566206088345752619",
      AIO_PROJECT_WORKSPACE_NAME: "ShippingMethodMain",
      AIO_PROJECT_WORKSPACE_DETAILS_SERVICES: [
        { code: "AdobeIOManagementAPISDK", name: "I/O Management API" },
      ],
    });
  });

  test("defaults SCOPES and AIO_PROJECT_WORKSPACE_DETAILS_SERVICES to an empty array when absent", () => {
    const withoutScopesOrServices = structuredClone(rawWorkspaceJson);
    withoutScopesOrServices.project.workspace.details.credentials[0].oauth_server_to_server.scopes =
      undefined;
    withoutScopesOrServices.project.workspace.details.services = undefined;

    const config = parseWorkspaceConfig(withoutScopesOrServices);
    expect(config.SCOPES).toEqual([]);
    expect(config.AIO_PROJECT_WORKSPACE_DETAILS_SERVICES).toEqual([]);
  });

  test("ignores non-oauth_server_to_server credentials", () => {
    const withOtherCredential = structuredClone(rawWorkspaceJson);
    withOtherCredential.project.workspace.details.credentials.unshift({
      id: "9999",
      name: "some-other-credential",
      integration_type: "oauthweb",
      oauth2: { client_id: "should-not-be-used" },
    });

    expect(parseWorkspaceConfig(withOtherCredential).CLIENTID).toBe(
      "test-client-id",
    );
  });

  test.each([
    ["client_id", "CLIENTID"],
    ["technical_account_id", "TECHNICALACCOUNTID"],
    ["technical_account_email", "TECHNICALACCOUNTEMAIL"],
  ])("throws when %s is missing from the credential", (rawField, envKey) => {
    const missingField = structuredClone(rawWorkspaceJson);
    missingField.project.workspace.details.credentials[0].oauth_server_to_server[
      rawField
    ] = undefined;

    expect(() => parseWorkspaceConfig(missingField)).toThrow(
      new RegExp(envKey),
    );
  });

  test("throws when there is no oauth_server_to_server credential at all", () => {
    const noCredentials = structuredClone(rawWorkspaceJson);
    noCredentials.project.workspace.details.credentials = [];

    expect(() => parseWorkspaceConfig(noCredentials)).toThrow(
      MISSING_CLIENTID_ERROR,
    );
  });

  test("throws when the runtime namespace is missing", () => {
    const noRuntime = structuredClone(rawWorkspaceJson);
    noRuntime.project.workspace.details.runtime.namespaces = [];

    expect(() => parseWorkspaceConfig(noRuntime)).toThrow(
      MISSING_RUNTIME_NAMESPACE_ERROR,
    );
  });
});

describe("resolveWorkspaceConfig", () => {
  test("selects the right env var for the app/purpose and returns the parsed JSON", () => {
    const result = resolveWorkspaceConfig({
      APP: "shipping-method",
      PURPOSE: "MAIN",
      SHIPPING_METHOD_MAIN: JSON.stringify(rawWorkspaceJson),
    });

    expect(result).toEqual(rawWorkspaceJson);
  });

  test("throws a clear error when the expected secret env var is empty", () => {
    expect(() =>
      resolveWorkspaceConfig({
        APP: "totals-collector",
        PURPOSE: "PR",
        TOTALS_COLLECTOR_PR: "",
      }),
    ).toThrow(MISSING_SECRET_ERROR);
  });

  test("throws a clear error when the secret is not valid JSON", () => {
    expect(() =>
      resolveWorkspaceConfig({
        APP: "payment-method",
        PURPOSE: "MAIN",
        PAYMENT_METHOD_MAIN: "not json",
      }),
    ).toThrow(INVALID_JSON_ERROR);
  });

  test("logs the resolved env var name for audit purposes", () => {
    const logSpy = vi.spyOn(console, "log");

    resolveWorkspaceConfig({
      APP: "shipping-method",
      PURPOSE: "MAIN",
      SHIPPING_METHOD_MAIN: JSON.stringify(rawWorkspaceJson),
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("SHIPPING_METHOD_MAIN"),
    );

    logSpy.mockRestore();
  });

  test("logs the resolved env var name even when resolution later fails", () => {
    const logSpy = vi.spyOn(console, "log");

    expect(() =>
      resolveWorkspaceConfig({
        APP: "totals-collector",
        PURPOSE: "PR",
        TOTALS_COLLECTOR_PR: "",
      }),
    ).toThrow(MISSING_SECRET_ERROR);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("TOTALS_COLLECTOR_PR"),
    );

    logSpy.mockRestore();
  });
});

describe("serialize", () => {
  const config = parseWorkspaceConfig(rawWorkspaceJson);

  test("joins SCOPES into a plain comma-separated string, not JSON", () => {
    expect(serialize("SCOPES", config.SCOPES)).toBe(
      "AdobeID,openid,adobeio_api",
    );
  });

  test("still JSON-serializes other array fields", () => {
    expect(
      serialize(
        "AIO_PROJECT_WORKSPACE_DETAILS_SERVICES",
        config.AIO_PROJECT_WORKSPACE_DETAILS_SERVICES,
      ),
    ).toBe(JSON.stringify(config.AIO_PROJECT_WORKSPACE_DETAILS_SERVICES));
  });

  test("passes non-array values through unchanged", () => {
    expect(serialize("CLIENTID", config.CLIENTID)).toBe(config.CLIENTID);
  });
});

describe("SECRET_FIELDS", () => {
  test("marks only credential/auth fields as needing a mask", () => {
    expect([...SECRET_FIELDS].sort()).toEqual(
      [
        "CLIENTID",
        "CLIENTSECRET",
        "TECHNICALACCOUNTID",
        "TECHNICALACCOUNTEMAIL",
        "IMSORGID",
        "AIO_RUNTIME_AUTH",
      ].sort(),
    );
  });

  test("does not include project/workspace identifiers, SCOPES, or services", () => {
    const config = parseWorkspaceConfig(rawWorkspaceJson);
    const unmasked = Object.keys(config).filter(
      (key) => !SECRET_FIELDS.includes(key),
    );

    expect(unmasked.sort()).toEqual(
      [
        "SCOPES",
        "AIO_RUNTIME_NAMESPACE",
        "AIO_PROJECT_ID",
        "AIO_PROJECT_NAME",
        "AIO_PROJECT_ORG_ID",
        "AIO_PROJECT_WORKSPACE_ID",
        "AIO_PROJECT_WORKSPACE_NAME",
        "AIO_PROJECT_WORKSPACE_DETAILS_SERVICES",
      ].sort(),
    );
  });
});
