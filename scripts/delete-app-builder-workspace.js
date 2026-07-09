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

import consoleSdk from "@adobe/aio-lib-console";
import { generateAccessToken } from "@adobe/aio-lib-core-auth";

/**
 * Gets an IMS access token for the OAuth Server-to-Server credential configured via env vars
 * (AIO_WORKSPACE_IMS_OAUTH_S2S_CLIENT_ID, AIO_WORKSPACE_IMS_OAUTH_S2S_CLIENT_SECRET,
 * AIO_WORKSPACE_IMS_OAUTH_S2S_ORG_ID, AIO_WORKSPACE_IMS_OAUTH_S2S_SCOPES as a JSON array string).
 *
 * @returns {Promise<string>} the access token
 */
async function getAccessToken() {
  const token = await generateAccessToken(
    {
      clientId: process.env.AIO_WORKSPACE_IMS_OAUTH_S2S_CLIENT_ID,
      clientSecret: process.env.AIO_WORKSPACE_IMS_OAUTH_S2S_CLIENT_SECRET,
      orgId: process.env.AIO_WORKSPACE_IMS_OAUTH_S2S_ORG_ID,
      scopes: JSON.parse(
        process.env.AIO_WORKSPACE_IMS_OAUTH_S2S_SCOPES ?? "[]",
      ),
    },
    process.env.AIO_CLI_ENV ?? "prod",
  );
  return token.access_token;
}

/**
 * Deletes a workspace by name. No-op if it doesn't exist.
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {string} projectId the project id.
 * @param {string} name the workspace name.
 * @returns {Promise<boolean>} true if a workspace was found and deleted, false if it didn't exist.
 */
async function deleteWorkspaceByName(consoleClient, orgId, projectId, name) {
  const { body: workspaces } = await consoleClient.getWorkspacesForProject(
    orgId,
    projectId,
  );
  const workspace = workspaces.find((ws) => ws.name === name);
  if (!workspace) {
    return false;
  }
  await consoleClient.deleteWorkspace(orgId, projectId, workspace.id);
  return true;
}

/**
 * Deletes the App Builder workspace for a closed PR, if it was ever created.
 */
export async function main() {
  const { AIO_ORG_ID, AIO_PROJECT_ID, APP_WORKSPACE_NAME } = process.env;

  const accessToken = await getAccessToken();
  const consoleClient = consoleSdk.init(
    accessToken,
    process.env.AIO_WORKSPACE_IMS_OAUTH_S2S_CLIENT_ID,
    process.env.AIO_CLI_ENV ?? "prod",
  );

  console.info(`Deleting workspace "${APP_WORKSPACE_NAME}" if it exists...`);
  const deleted = await deleteWorkspaceByName(
    consoleClient,
    AIO_ORG_ID,
    AIO_PROJECT_ID,
    APP_WORKSPACE_NAME,
  );

  console.info(
    deleted
      ? `Workspace "${APP_WORKSPACE_NAME}" deleted.`
      : `Workspace "${APP_WORKSPACE_NAME}" did not exist, nothing to do.`,
  );
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
