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

jest.mock('@adobe/aio-sdk', () => ({
  Core: {
    Logger: jest.fn(),
  },
}));

const { Core } = require('@adobe/aio-sdk');
const mockLoggerInstance = { info: jest.fn(), debug: jest.fn(), error: jest.fn() };
Core.Logger.mockReturnValue(mockLoggerInstance);

jest.mock('node-fetch');
const fetch = require('node-fetch');
const action = require('./../actions/generic/index.js');

beforeEach(() => {
  Core.Logger.mockClear();
  mockLoggerInstance.info.mockReset();
  mockLoggerInstance.debug.mockReset();
  mockLoggerInstance.error.mockReset();
});

const fakeParams = { __ow_headers: { authorization: 'Bearer fake' } };
describe('generic', () => {
  test('main should be defined', () => {
    expect(action.main).toBeInstanceOf(Function);
  });
  test('should set logger to use LOG_LEVEL param', async () => {
    await action.main({ ...fakeParams, LOG_LEVEL: 'fakeLevel' });
    expect(Core.Logger).toHaveBeenCalledWith(expect.any(String), { level: 'fakeLevel' });
  });
  test('should return an http reponse with the fetched content', async () => {
    const mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ content: 'fake' }),
    };
    fetch.mockResolvedValue(mockFetchResponse);
    const response = await action.main(fakeParams);
    expect(response).toEqual({
      statusCode: 200,
      body: { content: 'fake' },
    });
  });
  test('if there is an error should return a 500 and log the error', async () => {
    const fakeError = new Error('fake');
    fetch.mockRejectedValue(fakeError);
    const response = await action.main(fakeParams);
    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: { error: 'server error' },
      },
    });
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(fakeError);
  });
  test('if returned service status code is not ok should return a 500 and log the status', async () => {
    const mockFetchResponse = {
      ok: false,
      status: 404,
    };
    fetch.mockResolvedValue(mockFetchResponse);
    const response = await action.main(fakeParams);
    expect(response).toEqual({
      error: {
        statusCode: 500,
        body: { error: 'server error' },
      },
    });
    // error message should contain 404
    expect(mockLoggerInstance.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('404') })
    );
  });
  test('missing input request parameters, should return 400', async () => {
    const response = await action.main({});
    expect(response).toEqual({
      error: {
        statusCode: 400,
        body: { error: "missing header(s) 'authorization'" },
      },
    });
  });
});
