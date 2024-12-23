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

jest.setTimeout(30 * 1000); // 30 seconds
const waitForExpect = require('wait-for-expect');

const {
  Core: { Config },
  State,
} = require('@adobe/aio-sdk');
const fetch = require('node-fetch');

// get action url
const namespace = Config.get('runtime.namespace');
const hostname = Config.get('cna.hostname') || 'adobeioruntime.net';
const actionUrl = `https://${namespace}.${hostname}/api/v1/web/3rd-party-events/publish`;

// state config
const owOptions = {
  namespace: Config.get('runtime.namespace'),
  auth: Config.get('runtime.auth'),
};

describe('3rd-party-events actions', () => {
  test('publish returns a 401 when missing Authorization header', async () => {
    const res = await fetch(actionUrl);
    expect(res?.status).toEqual(401);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        error: 'Missing Authorization header',
      })
    );
  });
  test('publish returns a 400 when missing event property in the body', async () => {
    const res = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        Authorization: 'supersecret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    expect(res?.status).toEqual(400);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        error: 'Missing event property',
      })
    );
  });
  test('publish returns a 200 when event has been ingested and it is consumed by the webhook', async () => {
    const type = 'com.3rdparty.events.test.Event1';
    const data = { foo: 'bar' };
    const res = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        Authorization: 'supersecret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: { type, data },
      }),
    });
    expect(res?.status).toEqual(200);
    const { cloudEvent } = await res.json();
    expect(cloudEvent).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type,
        data,
      })
    );

    const state = await State.init({ ow: owOptions });

    await waitForExpect(async () => {
      const { value } = (await state.get(cloudEvent.id)) || {};
      expect(value).toEqual(JSON.stringify(data));
    });
  });
});
