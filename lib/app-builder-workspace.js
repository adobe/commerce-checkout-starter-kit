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

const CREDENTIAL_TYPE_OAUTH = "oauth_server_to_server";
const CREDENTIAL_TYPE_ENTERPRISE = "entp";

/**
 * Gets an IMS access token for the OAuth Server-to-Server credential configured via env vars
 * (CLIENTID, CLIENTSECRET, IMSORGID, SCOPES as a JSON array string).
 *
 * @returns {Promise<string>} the access token
 */
export async function getAccessToken() {
  const token = await generateAccessToken(
    {
      clientId: process.env.CLIENTID,
      clientSecret: process.env.CLIENTSECRET,
      orgId: process.env.IMSORGID,
      scopes: JSON.parse(process.env.SCOPES ?? "[]"),
    },
    process.env.AIO_CLI_ENV ?? "prod",
  );
  return token.access_token;
}

/**
 * Creates an Adobe Developer Console API client.
 *
 * @param {string} accessToken IMS access token.
 * @returns {Promise<object>} the console API client.
 */
export function createConsoleClient(accessToken) {
  return consoleSdk.init(
    accessToken,
    process.env.CLIENTID,
    process.env.AIO_CLI_ENV ?? "prod",
  );
}

/**
 * Finds a workspace by name in the given project.
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {string} projectId the project id.
 * @param {string} name the workspace name to look for.
 * @returns {Promise<object|undefined>} the matching workspace, or undefined if not found.
 */
export async function findWorkspace(consoleClient, orgId, projectId, name) {
  const { body: workspaces } = await consoleClient.getWorkspacesForProject(
    orgId,
    projectId,
  );
  return workspaces.find((workspace) => workspace.name === name);
}

/**
 * Finds a workspace by name, creating it (with a Runtime namespace) if it doesn't exist yet.
 * Mirrors the create + createRuntimeNamespace pairing that Adobe's own
 * `@adobe/aio-lib-console-project-installation` uses, since a bare `createWorkspace` call alone
 * does not reliably provision a working Runtime namespace.
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {string} projectId the project id.
 * @param {string} name the workspace name (must be under 20 characters).
 * @param {string} title the workspace title (free-form, shown in the Console UI).
 * @returns {Promise<{workspace: object, created: boolean}>} the workspace (with at least `id`/`workspaceId` and `name`) and whether it was just created.
 */
export async function ensureWorkspace(
  consoleClient,
  orgId,
  projectId,
  name,
  title,
) {
  const existing = await findWorkspace(consoleClient, orgId, projectId, name);
  if (existing) {
    return { workspace: existing, created: false };
  }

  const { body: workspace } = await consoleClient.createWorkspace(
    orgId,
    projectId,
    { name, title },
  );
  await consoleClient.createRuntimeNamespace(
    orgId,
    projectId,
    workspace.workspaceId,
  );
  return { workspace, created: true };
}

/**
 * Gets an existing credential for the workspace, preferring OAuth Server-to-Server,
 * creating a new OAuth Server-to-Server credential if none exists yet.
 * Mirrors `getFirstWorkspaceCredential` from `@adobe/aio-lib-console-project-installation`.
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {string} projectId the project id.
 * @param {string} workspaceId the workspace id.
 * @returns {Promise<{credentialId: string, credentialType: string}>} the credential id and type.
 */
async function getOrCreateWorkspaceCredential(
  consoleClient,
  orgId,
  projectId,
  workspaceId,
) {
  const { body: credentials } = await consoleClient.getCredentials(
    orgId,
    projectId,
    workspaceId,
  );

  const oauthCredential = credentials.find(
    (c) =>
      c.flow_type === CREDENTIAL_TYPE_ENTERPRISE &&
      c.integration_type === CREDENTIAL_TYPE_OAUTH,
  );
  if (oauthCredential) {
    return {
      credentialId: oauthCredential.id_integration,
      credentialType: CREDENTIAL_TYPE_OAUTH,
    };
  }

  const enterpriseCredential = credentials.find(
    (c) =>
      c.flow_type === CREDENTIAL_TYPE_ENTERPRISE &&
      c.integration_type === "service",
  );
  if (enterpriseCredential) {
    return {
      credentialId: enterpriseCredential.id_integration,
      credentialType: CREDENTIAL_TYPE_ENTERPRISE,
    };
  }

  const { body: created } =
    await consoleClient.createOAuthServerToServerCredential(
      orgId,
      projectId,
      workspaceId,
      `cred-oauth-${Date.now()}`,
      "OAuth Server-to-Server credential created by the App Builder CI pipeline",
    );
  return { credentialId: created.id, credentialType: CREDENTIAL_TYPE_OAUTH };
}

/**
 * Resolves the org's service/license info for the given SDK codes, matching the shape
 * `subscribeCredentialToServices` expects. Mirrors `getServicesInfo` from
 * `@adobe/aio-lib-console-project-installation`.
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {Array<{code: string, type?: string}>} apis the SDK codes to resolve (type defaults to "entp").
 * @returns {Promise<Array<object>>} the resolved service info, ready to pass to `subscribeCredentialToServices`.
 */
async function resolveServicesInfo(consoleClient, orgId, apis) {
  const { body: orgServices } = await consoleClient.getServicesForOrg(orgId);
  const enabledOrgServices = orgServices.filter((service) => service.enabled);

  return apis.map(({ code, type = CREDENTIAL_TYPE_ENTERPRISE }) => {
    const orgService = enabledOrgServices.find(
      (service) => service.code === code && service.type === type,
    );
    if (!orgService) {
      throw new Error(
        `Service code "${code}" (type "${type}") not found or not enabled in the organization.`,
      );
    }
    return {
      sdkCode: code,
      name: orgService.name ?? null,
      roles: orgService.properties?.roles ?? null,
      licenseConfigs:
        orgService.properties?.licenseConfigs?.map((config) => ({
          op: "add",
          id: config?.id,
          productId: config?.productId,
        })) ?? null,
    };
  });
}

/**
 * Attaches the given SDK codes to exactly one workspace, scoped to that workspace only
 * (unlike `TemplateInstallManager.installTemplate`, which re-subscribes services to every
 * workspace in the project on every call).
 *
 * @param {object} consoleClient the console API client.
 * @param {string} orgId the organization id.
 * @param {string} projectId the project id.
 * @param {string} workspaceId the workspace id to attach services to.
 * @param {Array<{code: string, type?: string}>} apis the SDK codes to attach.
 * @returns {Promise<void>}
 */
export async function attachServices(
  consoleClient,
  orgId,
  projectId,
  workspaceId,
  apis,
) {
  if (!apis || apis.length === 0) {
    return;
  }

  const { credentialId, credentialType } = await getOrCreateWorkspaceCredential(
    consoleClient,
    orgId,
    projectId,
    workspaceId,
  );
  const servicesInfo = await resolveServicesInfo(consoleClient, orgId, apis);
  await consoleClient.subscribeCredentialToServices(
    orgId,
    projectId,
    workspaceId,
    credentialType,
    credentialId,
    servicesInfo,
  );
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
export async function deleteWorkspaceByName(
  consoleClient,
  orgId,
  projectId,
  name,
) {
  const workspace = await findWorkspace(consoleClient, orgId, projectId, name);
  if (!workspace) {
    return false;
  }
  await consoleClient.deleteWorkspace(orgId, projectId, workspace.id);
  return true;
}
