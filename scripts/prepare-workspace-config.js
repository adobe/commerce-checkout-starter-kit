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

import fs from "node:fs/promises";

const REQUIRED_FIELDS = [
  "CLIENTID",
  "CLIENTSECRET",
  "TECHNICALACCOUNTID",
  "TECHNICALACCOUNTEMAIL",
  "IMSORGID",
  "AIO_RUNTIME_NAMESPACE",
  "AIO_RUNTIME_AUTH",
  "AIO_PROJECT_ID",
  "AIO_PROJECT_NAME",
  "AIO_PROJECT_ORG_ID",
  "AIO_PROJECT_WORKSPACE_ID",
  "AIO_PROJECT_WORKSPACE_NAME",
];

/**
 * Builds the env var name a workspace's raw config is expected under, e.g.
 * `shipping-method` + `PR` -> `SHIPPING_METHOD_PR`.
 *
 * @param {string} app the apps/<app> directory name.
 * @param {string} purpose `MAIN` or `PR`.
 * @returns {string} the env var name.
 */
export function resolveWorkspaceEnvVarName(app, purpose) {
  return `${app.toUpperCase().replaceAll("-", "_")}_${purpose.toUpperCase()}`;
}

/**
 * Flattens a raw Adobe Developer Console `workspace.json` (as downloaded from the
 * "Download" button on a workspace's page) into the fields `aio app deploy` reads
 * from AIO_* env vars, replicating what `aio app use <workspace>.json` does locally
 * (see @adobe/aio-cli-plugin-app's src/lib/import-helper.js).
 *
 * @param {object} rawWorkspaceJson the parsed raw workspace.json.
 * @returns {object} the flattened workspace config.
 * @throws {Error} if a required field is missing from the raw workspace.json.
 */
export function extractWorkspaceConfig(rawWorkspaceJson) {
  const project = rawWorkspaceJson?.project ?? {};
  const workspaceDetails = project?.workspace?.details ?? {};
  const credentials = workspaceDetails.credentials ?? [];
  const credential =
    credentials.find((c) => c.integration_type === "oauth_server_to_server")
      ?.oauth_server_to_server ?? {};
  const runtime = workspaceDetails.runtime?.namespaces?.[0] ?? {};

  const config = {
    CLIENTID: credential.client_id,
    CLIENTSECRET: credential.client_secrets?.[0],
    TECHNICALACCOUNTID: credential.technical_account_id,
    TECHNICALACCOUNTEMAIL: credential.technical_account_email,
    IMSORGID: project.org?.ims_org_id,
    SCOPES: credential.scopes ?? [],
    AIO_RUNTIME_NAMESPACE: runtime.name,
    AIO_RUNTIME_AUTH: runtime.auth,
    AIO_PROJECT_ID: project.id,
    AIO_PROJECT_NAME: project.name,
    AIO_PROJECT_ORG_ID: project.org?.id,
    AIO_PROJECT_WORKSPACE_ID: project.workspace?.id,
    AIO_PROJECT_WORKSPACE_NAME: project.workspace?.name,
    AIO_PROJECT_WORKSPACE_DETAILS_SERVICES: workspaceDetails.services ?? [],
  };

  const missing = REQUIRED_FIELDS.filter((field) => !config[field]);
  if (missing.length > 0) {
    throw new Error(
      `Workspace config is missing required field(s): ${missing.join(", ")}`,
    );
  }

  return config;
}

/**
 * Reads the raw workspace.json for the current app/purpose from env, flattens it,
 * and writes each field to $GITHUB_ENV (masking every value first).
 *
 * @param {object} env process.env, or an equivalent object for testing.
 * @param {(value: string) => void} appendGithubEnv appends a `KEY=value` line to $GITHUB_ENV.
 * @param {(value: string) => void} mask emits a `::add-mask::` workflow command for a value.
 */
export function prepareWorkspaceConfig(env, appendGithubEnv, mask) {
  const { APP, PURPOSE } = env;
  const varName = resolveWorkspaceEnvVarName(APP, PURPOSE);
  const rawValue = env[varName];

  if (!rawValue) {
    throw new Error(
      `No workspace config secret set for ${APP} (${PURPOSE}). Expected env var ${varName} to be non-empty.`,
    );
  }

  let rawWorkspaceJson;
  try {
    rawWorkspaceJson = JSON.parse(rawValue);
  } catch (error) {
    throw new Error(
      `Workspace config for ${APP} (${PURPOSE}) is not valid JSON: ${error.message}`,
    );
  }

  const config = extractWorkspaceConfig(rawWorkspaceJson);

  for (const [key, value] of Object.entries(config)) {
    const serialized = Array.isArray(value) ? JSON.stringify(value) : value;
    mask(serialized);
    appendGithubEnv(`${key}=${serialized}`);
  }
}

export async function main() {
  const lines = [];
  prepareWorkspaceConfig(
    process.env,
    (line) => lines.push(line),
    (value) => console.log(`::add-mask::${value}`),
  );
  await fs.appendFile(process.env.GITHUB_ENV, `${lines.join("\n")}\n`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
