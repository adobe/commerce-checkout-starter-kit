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
import React, { useCallback } from 'react';
import {
  TableView,
  TableHeader,
  TableBody,
  Column,
  Row,
  Cell,
  Button,
  DialogTrigger,
  Text,
  Flex,
  Heading,
  ProgressCircle,
  IllustratedMessage,
  Content,
} from '@adobe/react-spectrum';
import { TaxClassDialog } from './TaxClassDialog';
import { useCommerceTaxClasses, createOrUpdateCommerceTaxClass } from '../hooks/useCommerceTaxClasses';
import { useCustomTaxCodes } from '../hooks/useCustomTaxCodes';

export const TaxClassesPage = (props) => {
  const { isLoadingCommerceTaxClasses, commerceTaxClasses, refetchCommerceTaxClasses } = useCommerceTaxClasses(props);
  const { isLoadingCustomTaxCodes, customTaxCodes } = useCustomTaxCodes(props);

  const handleSave = useCallback(
    async (newTaxClass) => {
      try {
        const response = await createOrUpdateCommerceTaxClass(props, newTaxClass);
        if (!response || !response.success) {
          throw new Error(`Failed to save tax class: ${response?.message || 'Unknown error'}`);
        }
        await refetchCommerceTaxClasses();
      } catch (error) {
        console.error('Something went wrong while saving tax class:', error);
      }
    },
    [props, refetchCommerceTaxClasses]
  );

  /**
   * Render empty state when there are no items in the table
   */
  function renderEmptyState() {
    return (
      <IllustratedMessage>
        <Content>No data available</Content>
      </IllustratedMessage>
    );
  }

  return (
    <Flex direction="column" marginX={20}>
      <Flex direction="row" justifyContent="space-between" alignItems="center" gap="size-200" marginX={5}>
        <Heading level={1}>Product Tax Classes</Heading>

        <DialogTrigger type="modal">
          <Button variant="accent" isDisabled={isLoadingCustomTaxCodes}>
            Add New Product Tax Class
          </Button>
          {(close) => (
            <TaxClassDialog taxClass={null} customTaxCodes={customTaxCodes} onSave={handleSave} close={close} />
          )}
        </DialogTrigger>
      </Flex>

      {isLoadingCustomTaxCodes || isLoadingCommerceTaxClasses ? (
        <Flex alignItems="center" justifyContent="center" height="100vh">
          <ProgressCircle size="L" aria-label="Loading…" isIndeterminate />
        </Flex>
      ) : (
        <Flex>
          <TableView
            aria-label="tax class table"
            width="100%"
            overflowMode="wrap"
            flex
            renderEmptyState={renderEmptyState}
            minHeight="static-size-1000"
          >
            <TableHeader>
              <Column align="start" width={10}>
                #
              </Column>
              <Column>Commerce ID</Column>
              <Column>Class Name</Column>
              <Column>Custom Tax Code</Column>
              <Column>Actions</Column>
            </TableHeader>

            <TableBody items={commerceTaxClasses}>
              {(item) => (
                <Row key={item.id}>
                  <Cell>
                    <Text UNSAFE_style={{ color: 'grey' }}>{item.rowNumber}</Text>
                  </Cell>
                  <Cell>{item.id}</Cell>
                  <Cell>{item.className}</Cell>
                  <Cell>{item.customTaxCode ? `${item.customTaxCode} (${item.customTaxLabel})` : ''}</Cell>
                  <Cell>
                    <DialogTrigger type="modal" key={`${item.id}-${customTaxCodes.length}`}>
                      <Button variant="secondary" style="outline">
                        Edit
                      </Button>
                      {/* React Spectrum TableView does not automatically update rows when child props change,
                          so mount it only after isLoadingCustomTaxCodes is completed. */}
                      {(close) => (
                        <TaxClassDialog
                          taxClass={item}
                          customTaxCodes={customTaxCodes}
                          onSave={handleSave}
                          close={close}
                        />
                      )}
                    </DialogTrigger>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </Flex>
      )}
    </Flex>
  );
};
