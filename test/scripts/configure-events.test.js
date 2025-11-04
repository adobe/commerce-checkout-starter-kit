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

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Events } from '@adobe/aio-sdk';
import { configureEvents } from '../../scripts/configure-events.js';

vi.mock('@adobe/aio-sdk', async () => ({
  ...(await vi.importActual('@adobe/aio-sdk')),
  Events: {
    init: vi.fn(),
  },
}));

const mockEvents = {
  getAllProviders: vi.fn(),
  getAllEventMetadataForProvider: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  createEventMetadataForProvider: vi.fn(),
  updateEventMetadataForProvider: vi.fn(),
};

Events.init.mockReturnValue(mockEvents);

beforeEach(() => {
  Events.init.mockClear(); // only clears calls stats
  vi.clearAllMocks();
});

const project = { organizationId: 'orgId', projectId: 'projectId', workspaceId: 'workspaceId' };
const credentials = { imsOrgId: 'imsOrgId', clientId: 'clientId', accessToken: 'accessToken' };

describe('configure-events', () => {
  describe('configureEvents', () => {
    test('does nothing when event config is empty', async () => {
      const eventsConfig = await configureEvents(project, credentials, {});
      expect(eventsConfig).toEqual([]);
    });
    describe('providers', () => {
      test('is created when missing', async () => {
        const eventProvider = {
          label: 'label',
          description: 'description',
          docs_url: 'docs_url',
        };
        const createdEventProvider = { id: '1', ...eventProvider };

        mockEvents.getAllProviders.mockResolvedValue({ _embedded: { providers: [] } });
        mockEvents.createProvider.mockResolvedValue(createdEventProvider);

        const eventsConfig = await configureEvents(project, credentials, {
          event_providers: [eventProvider],
        });

        expect(eventsConfig[0]?.provider).toEqual(createdEventProvider);
      });
      test('is updated when present', async () => {
        const originalEventProvider = {
          id: '1',
          label: 'label',
          description: 'description',
          docs_url: 'docs_url',
        };
        const updatedEventProvider = { ...originalEventProvider, description: 'updated' };

        mockEvents.getAllProviders.mockResolvedValue({ _embedded: { providers: [originalEventProvider] } });
        mockEvents.updateProvider.mockResolvedValue(updatedEventProvider);

        const eventsConfig = await configureEvents(project, credentials, {
          event_providers: [updatedEventProvider],
        });

        expect(eventsConfig[0]?.provider).toEqual(updatedEventProvider);
      });
      test('unchanged when present and in sync', async () => {
        const eventProvider = {
          id: '1',
          label: 'label',
          description: 'description',
          docs_url: 'docs_url',
        };

        mockEvents.getAllProviders.mockResolvedValue({ _embedded: { providers: [eventProvider] } });

        const eventsConfig = await configureEvents(project, credentials, {
          event_providers: [eventProvider],
        });

        expect(eventsConfig[0]?.provider).toEqual(eventProvider);
      });
      describe('events metadata', () => {
        const eventProvider = {
          id: '1',
          label: 'label',
          description: 'description',
          docs_url: 'docs_url',
        };
        mockEvents.getAllProviders.mockResolvedValue({ _embedded: { providers: [eventProvider] } });

        test('is created when missing', async () => {
          const eventMetadata = {
            event_code: 'event_code',
            label: 'label',
            description: 'description',
          };
          const createdEventMetadata = { id: '1', ...eventMetadata };

          mockEvents.getAllEventMetadataForProvider.mockResolvedValue({ _embedded: { eventmetadata: [] } });
          mockEvents.createEventMetadataForProvider.mockResolvedValue(createdEventMetadata);

          const eventsConfig = await configureEvents(project, credentials, {
            event_providers: [
              {
                ...eventProvider,
                events_metadata: [eventMetadata],
              },
            ],
          });

          expect(eventsConfig[0]?.eventsMetadata[0]).toEqual(createdEventMetadata);
        });
        test('is updated when present', async () => {
          const originalEventMetadata = {
            id: '1',
            event_code: 'event_code',
            label: 'label',
            description: 'description',
          };
          const updatedEventMetadata = { description: 'updated', ...originalEventMetadata };

          mockEvents.getAllEventMetadataForProvider.mockResolvedValue({
            _embedded: { eventmetadata: [originalEventMetadata] },
          });
          mockEvents.updateEventMetadataForProvider.mockResolvedValue(updatedEventMetadata);

          const eventsConfig = await configureEvents(project, credentials, {
            event_providers: [
              {
                ...eventProvider,
                events_metadata: [updatedEventMetadata],
              },
            ],
          });

          expect(eventsConfig[0]?.eventsMetadata[0]).toEqual(updatedEventMetadata);
        });
        test('unchanged when present and in sync', async () => {
          const eventMetadata = {
            id: '1',
            event_code: 'event_code',
            label: 'label',
            description: 'description',
          };

          mockEvents.getAllEventMetadataForProvider.mockResolvedValue({
            _embedded: { eventmetadata: [eventMetadata] },
          });

          const eventsConfig = await configureEvents(project, credentials, {
            event_providers: [
              {
                ...eventProvider,
                events_metadata: [eventMetadata],
              },
            ],
          });
          expect(eventsConfig[0]?.eventsMetadata[0]).toEqual(eventMetadata);
        });
      });
    });
  });
});
