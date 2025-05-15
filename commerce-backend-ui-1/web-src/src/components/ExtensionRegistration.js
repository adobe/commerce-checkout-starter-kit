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
import React, { useEffect, useState } from 'react'
import { register } from '@adobe/uix-guest';
import { MainPage } from './MainPage';

/**
 * Extension Registration Component
 * @param {object} props The component props
 * @param {object} props.runtime Adobe I/O runtime object
 * @param {object} props.ims IMS context object
 * @returns {React.ReactElement} The rendered React component
 */
export default function ExtensionRegistration(props) {

  // Commerce PaaS requires Admin UI SDK 3.0 to retrieve IMS token and orgId from guestConnection
  // See https://developer.adobe.com/commerce/extensibility/admin-ui-sdk/extension-points/#shared-contexts
  const [guestConnection, setGuestConnection] = useState(null);
  useEffect(() => {
    (async () => {
      const extensionId = 'oope_tax_management';

      const guestConnection = await register({
        id: extensionId,
        methods: {},
      });

      setGuestConnection(guestConnection);
    })();
  }, []);

  if (!guestConnection) {
    console.log('Guest connection is not ready yet.');
    return null; // Return null if guestConnection is not ready
  }

  console.log('Guest connection is ready.', guestConnection);
  console.log('Guest connection is ready, sharedContext.', guestConnection?.sharedContext);
  setTimeout(() => {
    console.log('Delayed check of sharedContext:', guestConnection?.sharedContext);
  }, 500);

  return <MainPage runtime={props.runtime} ims={props.ims} guestConnection={guestConnection} />;
}
