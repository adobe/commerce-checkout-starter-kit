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

import {
  createConsoleClient,
  deleteWorkspaceByName,
  getAccessToken,
} from "../lib/app-builder-workspace.js";

/**
 * Deletes the App Builder workspace for a closed PR, if it was ever created.
 */
export async function main() {
  const { AIO_ORG_ID, AIO_PROJECT_ID, WORKSPACE_NAME } = process.env;

  const accessToken = await getAccessToken();
  const consoleClient = await createConsoleClient(accessToken);

  console.info(`Deleting workspace "${WORKSPACE_NAME}" if it exists...`);
  const deleted = await deleteWorkspaceByName(
    consoleClient,
    AIO_ORG_ID,
    AIO_PROJECT_ID,
    WORKSPACE_NAME,
  );

  console.info(
    deleted
      ? `Workspace "${WORKSPACE_NAME}" deleted.`
      : `Workspace "${WORKSPACE_NAME}" did not exist, nothing to do.`,
  );
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
