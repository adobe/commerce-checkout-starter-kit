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
 *
 * @param props
 * @param action
 * @param operation
 * @param method
 * @param payload
 */
export async function callAction(props, action, operation, method = 'GET', payload = null) {
  const actions = require('./config.json');

  const res = await fetch(actions[action], {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-gw-ims-org-id': props.ims.org,
      authorization: `Bearer ${props.ims.token}`,
    },
    body: JSON.stringify({
      operation,
      method,
      ...(payload ? { payload } : {}),
    }),
  });

  return await res.json();
}
