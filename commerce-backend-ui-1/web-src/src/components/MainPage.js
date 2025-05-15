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
import { Item, TabList, TabPanels, Tabs } from '@adobe/react-spectrum';
import React, { useEffect, useState } from 'react';
import { TaxClassesPage } from './TaxClassesPage';

export const MainPage = (props) => {
  const [selectedTab, setSelectedTab] = useState('1');
  const [imsToken, setImsToken] = useState(null);
  const [imsOrgId, setImsOrgId] = useState(null);

  console.log('[MainPage] guestConnection:', props.guestConnection);

  useEffect(() => {
    const context = props.guestConnection?.sharedContext;
    console.log('[sharedContext.onChange] context:', context);
    if (!context) return;
    console.log('[sharedContext.onChange] context O:', context);

    const handleContextChange = (ctx) => {
      const token = ctx.get('imsToken');
      const orgId = ctx.get('imsOrgId');
      console.log('[sharedContext.onChange] imsToken:', token);
      console.log('[sharedContext.onChange] imsOrgId:', orgId);

      // Update local state
      setImsToken(token);
      setImsOrgId(orgId);
    };

    // Trigger once with current values
    handleContextChange(context);

    // Subscribe to future changes
    context.onChange(handleContextChange);
  }, [props.guestConnection?.sharedContext]);

  const onSelectionTabChange = (selectedTabKey) => {
    setSelectedTab(selectedTabKey);
  };

  const tabs = [
    {
      id: '1',
      name: 'Tax Class',
      children: <TaxClassesPage runtime={props.runtime} ims={props.ims}
                                imsToken={imsToken} imsOrgId={imsOrgId}
                                sharedContext={props.guestConnection?.sharedContext} />,
    },
  ];

  return (
    <Tabs
      aria-label="Commerce data"
      items={tabs}
      orientation="horizontal"
      isEmphasized={true}
      selectedKey={selectedTab}
      onSelectionChange={onSelectionTabChange}
    >
      <TabList marginX={20}>{(item) => <Item key={item.id}>{item.name}</Item>}</TabList>
      <TabPanels>{(item) => <Item key={item.id}>{item.children}</Item>}</TabPanels>
    </Tabs>
  );
};
