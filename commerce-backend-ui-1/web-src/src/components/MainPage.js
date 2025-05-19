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
import { Flex, Item, ProgressCircle, TabList, TabPanels, Tabs, View } from '@adobe/react-spectrum';
import { attach } from '@adobe/uix-guest';
import { useEffect, useState } from 'react';
import { TaxClassesPage } from './TaxClassesPage';

export const MainPage = (props) => {
  const [selectedTab, setSelectedTab] = useState('1');
  const [imsToken, setImsToken] = useState(null);
  const [imsOrgId, setImsOrgId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const onSelectionTabChange = (selectedTabKey) => {
    setSelectedTab(selectedTabKey);
  };

  useEffect(() => {
    const loadImsInfo = async () => {
      try {
        const guestConnection = await attach({ id: 'oope_tax_management' });
        const imsToken = guestConnection?.sharedContext?.get('imsToken') ?? props.ims?.token;
        const imsOrgId = guestConnection?.sharedContext?.get('imsOrgId') ?? props.ims?.org;

        setImsToken(imsToken);
        setImsOrgId(imsOrgId);
      } catch (error) {
        console.error('Error retrieving IMS info:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadImsInfo();
  }, []);

  const tabs = [
    {
      id: '1',
      name: 'Tax Class',
      children: <TaxClassesPage runtime={props.runtime} imsToken={imsToken} imsOrgId={imsOrgId} />,
    },
  ];

  return (
    <View>
      {isLoading ? (
        <Flex alignItems="center" justifyContent="center" height="100vh">
          <ProgressCircle size="L" aria-label="Loading…" isIndeterminate />
        </Flex>
      ) : (
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
      )}
    </View>
  );
};
