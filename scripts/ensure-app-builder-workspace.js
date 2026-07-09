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

import fs from "node:fs";
import path from "node:path";

import { load } from "js-yaml";

import {
  attachServices,
  createConsoleClient,
  ensureWorkspace,
  getAccessToken,
} from "../lib/app-builder-workspace.js";

/**
 * Finds or creates the App Builder workspace for the current CI run (PR or main), provisions its
 * Runtime namespace, and - only when the workspace was just created - attaches the services
 * declared in the target app's install.yaml `apis` list.
 */
export async function main() {
  const {
    AIO_ORG_ID,
    AIO_PROJECT_ID,
    APP_WORKSPACE_NAME,
    APP_WORKSPACE_TITLE,
    APP_DIR,
  } = process.env;

  const accessToken = await getAccessToken();
  const consoleClient = await createConsoleClient(accessToken);

  console.info(`Ensuring workspace "${APP_WORKSPACE_NAME}"...`);
  const { workspace, created } = await ensureWorkspace(
    consoleClient,
    AIO_ORG_ID,
    AIO_PROJECT_ID,
    APP_WORKSPACE_NAME,
    APP_WORKSPACE_TITLE,
  );
  const workspaceId = workspace.id ?? workspace.workspaceId;

  if (created) {
    console.info(
      `Workspace "${APP_WORKSPACE_NAME}" created (id: ${workspaceId}).`,
    );

    const installConfigPath = path.join(APP_DIR, "install.yaml");
    const installConfig = load(fs.readFileSync(installConfigPath, "utf8"));
    const apis = installConfig?.apis ?? [];

    if (apis.length > 0) {
      console.info(
        `Attaching services: ${apis.map((api) => api.code).join(", ")}...`,
      );
      await attachServices(
        consoleClient,
        AIO_ORG_ID,
        AIO_PROJECT_ID,
        workspaceId,
        apis,
      );
    }
  } else {
    console.info(
      `Workspace "${APP_WORKSPACE_NAME}" already exists (id: ${workspaceId}).`,
    );
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
