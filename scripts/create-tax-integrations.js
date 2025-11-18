/*
Copyright 2024 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

import fs from "node:fs";

import { Core } from "@adobe/aio-sdk";
import yaml from "js-yaml";

import { getAdobeCommerceClient } from "../lib/adobe-commerce.js";

const logger = Core.Logger("create-tax-integrations", {
  level: process.env.LOG_LEVEL || "info",
});

/**
 * Creates all the payment methods defined in the payment-methods.yaml file in the configured Adobe Commerce instance
 * @param {string} configFilePath - The file path to the YAML configuration file
 * @returns {Promise<string[]>} An array of created tax integration codes
 */
export async function main(configFilePath) {
  logger.info("Reading tax configuration file...");
  const fileContents = fs.readFileSync(configFilePath, "utf8");
  const data = yaml.load(fileContents);
  logger.info("Creating tax integrations...");
  const createdTaxIntegrations = [];

  const client = await getAdobeCommerceClient(process.env);

  for (const taxIntegration of data.tax_integrations) {
    const response = await client.createTaxIntegration(taxIntegration);
    const taxIntegrationCode = taxIntegration.tax_integration.code;
    if (response.success) {
      logger.info(`Tax integration ${taxIntegrationCode} created or updated`);
      createdTaxIntegrations.push(taxIntegrationCode);
    } else {
      logger.error(formatErrorMessage(response));
    }
  }
  return createdTaxIntegrations;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const configFile = process.argv[2] || "tax-integrations.yaml";
  main(configFile).catch(console.error);
}

/**
 * Formats an error message by interpolating placeholder values from the response
 * @param {object} response - The response object returned from the API
 * @returns {string} A formatted error message string
 */
function formatErrorMessage(response) {
  let msg =
    response.statusCode === 400 && response.body?.message
      ? response.body.message
      : response.message || "Unknown error";

  if (response.body?.parameters) {
    for (const [key, value] of Object.entries(response.body.parameters)) {
      msg = msg.replaceAll(`%${key}%`, value);
    }
  }

  return msg;
}
