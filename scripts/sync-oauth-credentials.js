const fs = require('fs');
const { Core } = require('@adobe/aio-sdk');
const { replaceEnvVar, resolveEnvPath } = require('../lib/env');
const dotenv = require('dotenv');
const { context } = require('@adobe/aio-lib-ims');

const keyMap = {
  client_id: 'OAUTH_CLIENT_ID',
  client_secrets: 'OAUTH_CLIENT_SECRETS',
  technical_account_email: 'OAUTH_TECHNICAL_ACCOUNT_EMAIL',
  technical_account_id: 'OAUTH_TECHNICAL_ACCOUNT_ID',
  scopes: 'OAUTH_SCOPES',
  ims_org_id: 'OAUTH_IMS_ORG_ID',
};

const logger = Core.Logger('scripts/sync-oauth-credentials', { level: process.env.LOG_LEVEL || 'info' });

/**
 * Syncs OAUTH environment variables from the configured IMS context in the .env file.
 */
async function main() {
  try {
    logger.debug('Sync OAUTH env vars from configured IMS context in .env file');
    const envPath = resolveEnvPath();
    const envVars = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const imsContext = await resolveImsS2SContext();
    if (!imsContext) {
      logger.warn('IMS server 2 server OAuth credentials are not configured. Did you run `aio app use`?');
      return;
    }

    const { name: credential, data } = imsContext;

    Object.entries(data).forEach(([key, value]) => {
      const oauthKey = keyMap[key];
      if (!oauthKey) {
        logger.warn(`No mapping found for key: ${key}`);
        return;
      }

      if (!envVars[oauthKey]) {
        replaceEnvVar(envPath, oauthKey, value);
        logger.info(`Added ${oauthKey} with value from ${key} of IMS context ${credential}`);
      } else if (envVars[oauthKey] !== value) {
        replaceEnvVar(envPath, oauthKey, value);
        logger.info(`Replaced ${oauthKey} with value from ${key} of IMS context ${credential}`);
      }
      logger.debug(`${oauthKey} is in sync with ${key} of IMS context ${credential}`);
    });

    logger.info('OAUTH env vars synced successfully');
  } catch (e) {
    logger.error('Failed to sync OAUTH env vars', e);
  }
}

/**
 * Resolves the IMS server to server context from the project workspace credentials.
 * @returns {Promise<object> | undefined} The IMS context object containing OAuth credentials.
 */
function resolveImsS2SContext() {
  const [credential] =
    (Core.Config.get('project.workspace.details.credentials') ?? [])
      // eslint-disable-next-line camelcase
      .filter(({ integration_type }) => integration_type === 'oauth_server_to_server')
      .map(({ name }) => name) ?? [];

  if (!credential) {
    logger.warn('No oauth_server_to_server credentials found in the project workspace.');
    return;
  }

  return context.get(credential);
}

module.exports = { main };
