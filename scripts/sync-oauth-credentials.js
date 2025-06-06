const fs = require('fs');
const { Core } = require('@adobe/aio-sdk');
const { replaceEnvVar, resolveEnvPath } = require('../lib/env');
const dotenv = require('dotenv');

const keyMap = {
  client__id: 'OAUTH_CLIENT_ID',
  client__secrets: 'OAUTH_CLIENT_SECRETS',
  technical__account__email: 'OAUTH_TECHNICAL_ACCOUNT_EMAIL',
  technical__account__id: 'OAUTH_TECHNICAL_ACCOUNT_ID',
  scopes: 'OAUTH_SCOPES',
  ims__org__id: 'OAUTH_IMS_ORG_ID',
};

const logger = Core.Logger('scripts/sync-oauth-credentials', { level: process.env.LOG_LEVEL || 'info' });

/**
 * Syncs OAUTH environment variables from AIO_ims_contexts_* variables in the .env file.
 */
function main() {
  try {
    logger.debug('Sync OAUTH env vars from AIO_ims_contexts_* vars in .env file');
    const envPath = resolveEnvPath();
    const envVars = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const imsContextEnvVars = parseImsContextEnvVars(envVars);
    if (imsContextEnvVars.length === 0) {
      logger.warn('No AIO_ims_contexts_* environment variables found in .env file');
      return;
    }

    imsContextEnvVars.forEach(({ credential, key, value }) => {
      const oauthKey = keyMap[key];
      if (!oauthKey) {
        logger.warn(`No mapping found for key: ${key}`);
        return;
      }

      if (!envVars[oauthKey]) {
        replaceEnvVar(envPath, oauthKey, value);
        logger.info(`Added ${oauthKey} with value from AIO_ims_contexts_${credential}_${key}`);
      } else if (envVars[oauthKey] !== value) {
        replaceEnvVar(envPath, oauthKey, value);
        logger.info(`Replaced ${oauthKey} with value from AIO_ims_contexts_${credential}_${key}`);
      }
      logger.debug(`${oauthKey} is in sync with AIO_ims_contexts_${credential}_${key}`);
    });

    logger.info('OAUTH env vars synced successfully');
  } catch (e) {
    logger.error('Failed to sync OAUTH env vars', e);
  }
}

/**
 * Parses the environment variables to find those that start with 'AIO_ims_contexts_'.
 * @param {object} envVars the environment variables object
 * @returns {Array} an array of objects containing the credential, key and value from the AIO_ims_contexts_* variables
 */
function parseImsContextEnvVars(envVars) {
  return Object.entries(envVars)
    .filter(([key]) => key.startsWith('AIO_ims_contexts_'))
    .map(([key, value]) => ({
      ...parseAioImsContextKey(key),
      value,
    }));
}

/**
 * Parses the AIO_ims_contexts_* key to extract the credential and key.
 * @param {string} imsKey the environment variable key that starts with 'AIO_ims_contexts_'
 * @returns {object} an object containing the credential and key extracted from the imsKey
 */
function parseAioImsContextKey(imsKey) {
  const str = imsKey.replace('AIO_ims_contexts_', '');
  const [credential, key] = splitBySingleChar(str, '_');
  return { credential, key };
}

/**
 * Splits a string by a single character, ensuring that the character is not preceded or followed by the same character.
 * @param {string} str the string to split
 * @param {string} char the character to split by
 * @returns {Array} an array of strings split by the specified character
 */
function splitBySingleChar(str, char) {
  const result = [];
  let current = '';
  let i = 0;
  while (i < str.length) {
    if (
      str[i] === char &&
      (i === 0 || str[i - 1] !== char) && // not preceded by underscore
      (i === str.length - 1 || str[i + 1] !== char) // not followed by underscore
    ) {
      result.push(current);
      current = '';
      i++; // skip the underscore
    } else {
      current += str[i];
      i++;
    }
  }
  result.push(current);
  return result;
}

module.exports = { main };
