import { Button } from "@react-spectrum/s2/Button";
import { ButtonGroup } from "@react-spectrum/s2/ButtonGroup";
import { Content } from "@react-spectrum/s2/Content";
import { Form } from "@react-spectrum/s2/Form";
import { Heading } from "@react-spectrum/s2/Heading";
import { InlineAlert } from "@react-spectrum/s2/InlineAlert";
import { Picker, PickerItem } from "@react-spectrum/s2/Picker";
import { TextField } from "@react-spectrum/s2/TextField";
import { useCallback, useState } from "react";

import type { Key } from "react-aria-components";
import type { CustomTaxCode } from "../hooks/use-custom-tax-codes.ts";

export type TaxClass = {
  id?: number;
  className: string;
  customTaxCode: string;
  customTaxLabel: string;
  classType: string;
};

export type TaxClassDialogProps = {
  taxClass: TaxClass | null;
  customTaxCodes?: CustomTaxCode[];
  onSave: (taxClass: TaxClass) => void;
  close: () => void;
};

// Renders the dialog *contents* only, not the `<Dialog>` wrapper: S2's `DialogTrigger` requires
// its own `<Dialog>` as a direct child so it can hand `close` down via Dialog's render-prop
// children, so the caller wraps this in `<Dialog>{({ close }) => <TaxClassDialog close={close} ... />}</Dialog>`.
export function TaxClassDialog({
  taxClass,
  customTaxCodes = [],
  onSave,
  close,
}: TaxClassDialogProps) {
  const isEdit = Boolean(taxClass);
  const [className, setClassName] = useState(taxClass?.className || "");
  const [classType, setClassType] = useState(taxClass?.classType || "PRODUCT");
  const [selectedTaxCode, setSelectedTaxCode] = useState(
    taxClass?.customTaxCode || "",
  );
  const [formError, setFormError] = useState<string | null>(null);

  const handleClassTypeChange = useCallback((key: Key | null) => {
    setClassType(String(key));
  }, []);

  const handleTaxCodeChange = useCallback((key: Key | null) => {
    setSelectedTaxCode(String(key));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!className.trim()) {
      setFormError("Class Name is required.");
      return;
    }

    const selectedCode = customTaxCodes.find(
      (code) => code.taxCode === selectedTaxCode,
    );
    if (!selectedCode) {
      setFormError("Please select a valid Custom Tax Code.");
      return;
    }

    setFormError(null);
    onSave({
      className: className.trim(),
      classType,
      customTaxCode: selectedCode.taxCode,
      customTaxLabel: selectedCode.name,
      id: taxClass?.id,
    });
    close();
  }, [
    className,
    classType,
    close,
    customTaxCodes,
    onSave,
    selectedTaxCode,
    taxClass?.id,
  ]);

  return (
    <>
      <Heading slot="title">
        {isEdit ? "Edit Tax Class" : "Add New Tax Class"}
      </Heading>
      <Content>
        {formError && (
          <InlineAlert variant="negative">
            <Heading>{formError}</Heading>
          </InlineAlert>
        )}
        <Form>
          <TextField
            isRequired
            label="Class Name"
            onChange={setClassName}
            value={className}
          />
          <Picker
            isDisabled={isEdit}
            isRequired
            label="Class Type"
            onSelectionChange={handleClassTypeChange}
            selectedKey={classType}>
            <PickerItem id="PRODUCT">PRODUCT</PickerItem>
            <PickerItem id="SHIPPING">SHIPPING</PickerItem>
            <PickerItem id="CUSTOMER">CUSTOMER</PickerItem>
          </Picker>
          <Picker
            isRequired
            label="Custom Tax Code"
            onSelectionChange={handleTaxCodeChange}
            selectedKey={selectedTaxCode}>
            {customTaxCodes.map((code) => (
              <PickerItem id={code.taxCode} key={code.taxCode}>
                {`${code.taxCode} (${code.name})`}
              </PickerItem>
            ))}
          </Picker>
          <ButtonGroup align="end">
            <Button
              data-testid="tax-class-cancel-button"
              onPress={close}
              variant="secondary">
              Cancel
            </Button>
            <Button
              data-testid="tax-class-save-button"
              onPress={handleSubmit}
              variant="accent">
              Save
            </Button>
          </ButtonGroup>
        </Form>
      </Content>
    </>
  );
}
