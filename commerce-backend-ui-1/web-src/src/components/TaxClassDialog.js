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
import React, { useState } from 'react';
import {
  Dialog,
  Heading,
  Divider,
  Content,
  Form,
  TextField,
  Picker,
  Item,
  Button,
  ButtonGroup,
  InlineAlert,
} from '@adobe/react-spectrum';

export const TaxClassDialog = ({ taxClass, customTaxCodes = [], onSave, close }) => {
  const isEdit = Boolean(taxClass);
  const [className, setClassName] = useState(taxClass?.className || '');
  const [classType, setClassType] = useState(taxClass?.classType || 'PRODUCT');
  const [selectedTaxCode, setSelectedTaxCode] = useState(taxClass?.customTaxCode || '');
  const [formError, setFormError] = useState(null);

  const handleSubmit = () => {
    if (!className.trim()) {
      setFormError('Class Name is required.');
      return;
    }

    const selectedCode = customTaxCodes.find((code) => code.taxCode === selectedTaxCode);
    if (!selectedCode) {
      setFormError('Please select a valid Custom Tax Code.');
      return;
    }

    const updatedTaxClass = {
      id: taxClass?.id,
      className: className.trim(),
      customTaxCode: selectedCode.taxCode,
      customTaxLabel: selectedCode.name,
      classType,
    };

    setFormError(null);
    onSave(updatedTaxClass);
    close();
  };

  return (
    <Dialog>
      <Heading>{isEdit ? 'Edit Tax Class' : 'Add New Tax Class'}</Heading>
      <Divider />
      <Content>
        {formError && (
          <InlineAlert variant="negative" width="100%">
            <Heading>{formError}</Heading>
          </InlineAlert>
        )}
        <Form>
          <TextField label="Class Name" value={className} onChange={setClassName} isRequired />
          <Picker
            label="Class Type"
            selectedKey={classType}
            onSelectionChange={setClassType}
            isDisabled={isEdit}
            isRequired
          >
            <Item key="PRODUCT">PRODUCT</Item>
            <Item key="SHIPPING">SHIPPING</Item>
            <Item key="CUSTOMER">CUSTOMER</Item>
          </Picker>
          <Picker
            label="Custom Tax Code"
            selectedKey={selectedTaxCode}
            onSelectionChange={setSelectedTaxCode}
            isRequired
          >
            {customTaxCodes.map((code) => (
              <Item key={code.taxCode}>{`${code.taxCode} (${code.name})`}</Item>
            ))}
          </Picker>
          <ButtonGroup align="end">
            <Button variant="secondary" onPress={close} data-testid="tax-class-cancel-button">
              Cancel
            </Button>
            <Button variant="cta" onPress={handleSubmit} data-testid="tax-class-save-button">
              Save
            </Button>
          </ButtonGroup>
        </Form>
      </Content>
    </Dialog>
  );
};
