/*
Copyright 2025 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/**
 * Extension Registration Component
 *
 * @returns {Promise<{statusCode: number, body: object}>} The HTTP response with status code and body
 */
async function main() {
  const extensionId = 'oope_tax_management';

  return {
    statusCode: 200,
    body: {
      registration: {
        menuItems: [
          {
            id: `${extensionId}::taxes`,
            title: 'Tax management',
            parent: `${extensionId}::apps`,
            sortOrder: 1,
          },
          {
            id: `${extensionId}::apps`,
            title: 'Apps',
            isSection: true,
            sortOrder: 100,
          },
        ],
        page: {
          title: 'Tax management',
        },
      },
    },
  };
}

exports.main = main;
