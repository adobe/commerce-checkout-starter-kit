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

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { buildApps } from "../src/build-apps.js";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:fs", () => ({ readdirSync: vi.fn() }));

beforeEach(() => {
  vi.mocked(spawnSync).mockReset().mockReturnValue({ status: 0 });
  vi.mocked(readdirSync)
    .mockReset()
    .mockReturnValue(
      [
        "payment-method",
        "shipping-method",
        "tax-integration",
        "totals-collector",
      ].map((name) => ({ isDirectory: () => true, name })),
    );
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildApps", () => {
  test("discovers directories in alphabetical order and ignores files", () => {
    vi.mocked(readdirSync).mockReturnValueOnce([
      { isDirectory: () => true, name: "new-app" },
      { isDirectory: () => false, name: "README.md" },
      { isDirectory: () => true, name: "another-app" },
    ]);

    expect(buildApps()).toBe(0);
    expect(readdirSync).toHaveBeenCalledWith(
      fileURLToPath(new URL("../../apps/", import.meta.url)),
      { withFileTypes: true },
    );
    expect(spawnSync).toHaveBeenCalledTimes(4);
    for (const [index, app] of ["another-app", "new-app"].entries()) {
      const options = {
        cwd: fileURLToPath(new URL(`../../apps/${app}`, import.meta.url)),
        stdio: "inherit",
      };
      expect(spawnSync).toHaveBeenNthCalledWith(
        index * 2 + 1,
        "npm",
        ["install"],
        options,
      );
      expect(spawnSync).toHaveBeenNthCalledWith(
        index * 2 + 2,
        "aio",
        ["app", "build"],
        options,
      );
    }
  });

  test("surfaces directory discovery failures without running commands", () => {
    const error = new Error("Cannot read apps directory");
    vi.mocked(readdirSync).mockImplementationOnce(() => {
      throw error;
    });

    expect(buildApps).toThrow(error);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  test("installs then builds all four apps in their own directories", () => {
    expect(buildApps()).toBe(0);
    expect(spawnSync).toHaveBeenCalledTimes(8);

    const apps = [
      "payment-method",
      "shipping-method",
      "tax-integration",
      "totals-collector",
    ];
    for (const [index, app] of apps.entries()) {
      const options = {
        cwd: fileURLToPath(new URL(`../../apps/${app}`, import.meta.url)),
        stdio: "inherit",
      };
      expect(spawnSync).toHaveBeenNthCalledWith(
        index * 2 + 1,
        "npm",
        ["install"],
        options,
      );
      expect(spawnSync).toHaveBeenNthCalledWith(
        index * 2 + 2,
        "aio",
        ["app", "build"],
        options,
      );
    }
  });

  test("stops before building when installation fails", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 2 });

    expect(buildApps()).toBe(2);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "payment-method: npm install failed: exit code 2",
    );
  });

  test("stops before the next app when a build fails", () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 3 });

    expect(buildApps()).toBe(3);
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      "payment-method: aio app build failed: exit code 3",
    );
  });

  test("reports a command that cannot start", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      error: new Error("spawn npm ENOENT"),
      status: null,
    });

    expect(buildApps()).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "payment-method: npm install failed: spawn npm ENOENT",
    );
  });

  test("reports a command terminated by a signal", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      signal: "SIGTERM",
      status: null,
    });

    expect(buildApps()).toBe(1);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "payment-method: npm install failed: terminated by SIGTERM",
    );
  });
});
