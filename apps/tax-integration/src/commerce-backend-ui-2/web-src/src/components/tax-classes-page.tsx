import { useCommerce, useIms } from "@adobe/aio-commerce-lib-admin-ui/web";
import { Button } from "@react-spectrum/s2/Button";
import { Content } from "@react-spectrum/s2/Content";
import { Dialog, DialogTrigger } from "@react-spectrum/s2/Dialog";
import { Heading } from "@react-spectrum/s2/Heading";
import { IllustratedMessage } from "@react-spectrum/s2/IllustratedMessage";
import { ProgressCircle } from "@react-spectrum/s2/ProgressCircle";
import {
  Cell,
  Column,
  Row,
  TableBody,
  TableHeader,
  TableView,
} from "@react-spectrum/s2/TableView";
import { Text } from "@react-spectrum/s2/Text";
import { useCallback, useEffect, useState } from "react";

import { useCustomTaxCodes } from "../hooks/use-custom-tax-codes.ts";
import {
  createOrUpdateCommerceTaxClass,
  fetchCommerceTaxClasses,
} from "../lib/commerce-tax-classes.ts";
import { TaxClassDialog } from "./tax-class-dialog.tsx";

import type { CommerceTaxClassRow } from "../lib/commerce-tax-classes.ts";
import type { TaxClass } from "./tax-class-dialog.tsx";

export function TaxClassesPage() {
  const { imsToken } = useIms();
  const { commerceHost } = useCommerce();
  const { customTaxCodes, isLoadingCustomTaxCodes } = useCustomTaxCodes();

  const [isLoadingCommerceTaxClasses, setIsLoadingCommerceTaxClasses] =
    useState(true);
  const [commerceTaxClasses, setCommerceTaxClasses] = useState<
    CommerceTaxClassRow[]
  >([]);

  const refetchCommerceTaxClasses = useCallback(async () => {
    setIsLoadingCommerceTaxClasses(true);
    try {
      const rows = await fetchCommerceTaxClasses(commerceHost, imsToken);
      setCommerceTaxClasses(rows);
    } catch (error) {
      console.error("Error fetching commerce tax classes:", error);
      setCommerceTaxClasses([]);
    } finally {
      setIsLoadingCommerceTaxClasses(false);
    }
  }, [commerceHost, imsToken]);

  useEffect(() => {
    refetchCommerceTaxClasses();
  }, [refetchCommerceTaxClasses]);

  const handleSave = useCallback(
    async (newTaxClass: TaxClass) => {
      try {
        await createOrUpdateCommerceTaxClass(
          commerceHost,
          imsToken,
          newTaxClass,
        );
        await refetchCommerceTaxClasses();
      } catch (error) {
        console.error("Something went wrong while saving tax class:", error);
      }
    },
    [commerceHost, imsToken, refetchCommerceTaxClasses],
  );

  const renderEmptyState = useCallback(
    () => (
      <IllustratedMessage>
        <Content>No data available</Content>
      </IllustratedMessage>
    ),
    [],
  );

  // `@react-spectrum/s2` has no `Flex` layout primitive (Spectrum 1's `<Flex>` was dropped in
  // favor of the build-time `style()` macro); plain flexbox divs stand in for layout here.
  return (
    <div style={{ display: "flex", flexDirection: "column", marginInline: 20 }}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "row",
          gap: 16,
          justifyContent: "space-between",
          marginInline: 5,
        }}>
        <Heading level={1}>Manage Tax Classes</Heading>

        <DialogTrigger>
          <Button isDisabled={isLoadingCustomTaxCodes} variant="accent">
            Add New Tax Class
          </Button>
          <Dialog>
            {({ close }) => (
              <TaxClassDialog
                close={close}
                customTaxCodes={customTaxCodes}
                onSave={handleSave}
                taxClass={null}
              />
            )}
          </Dialog>
        </DialogTrigger>
      </div>

      {isLoadingCustomTaxCodes || isLoadingCommerceTaxClasses ? (
        <div
          style={{
            alignItems: "center",
            display: "flex",
            height: "100vh",
            justifyContent: "center",
          }}>
          <ProgressCircle aria-label="Loading…" isIndeterminate size="L" />
        </div>
      ) : (
        <div style={{ display: "flex" }}>
          <TableView
            aria-label="tax class table"
            overflowMode="wrap"
            UNSAFE_style={{ flex: 1, minHeight: 400, width: "100%" }}>
            <TableHeader>
              <Column align="start" width={10}>
                #
              </Column>
              <Column>Commerce ID</Column>
              <Column>Class Type</Column>
              <Column isRowHeader>Class Name</Column>
              <Column>Custom Tax Code</Column>
              <Column>Actions</Column>
            </TableHeader>

            <TableBody
              items={commerceTaxClasses}
              renderEmptyState={renderEmptyState}>
              {(item) => (
                <Row key={item.id}>
                  <Cell>
                    <Text UNSAFE_style={{ color: "grey" }}>
                      {item.rowNumber}
                    </Text>
                  </Cell>
                  <Cell>{item.id}</Cell>
                  <Cell>{item.classType}</Cell>
                  <Cell>{item.className}</Cell>
                  <Cell>
                    {item.customTaxCode
                      ? `${item.customTaxCode} (${item.customTaxLabel})`
                      : ""}
                  </Cell>
                  <Cell>
                    <DialogTrigger key={`${item.id}-${customTaxCodes.length}`}>
                      <Button fillStyle="outline" variant="secondary">
                        Edit
                      </Button>
                      <Dialog>
                        {({ close }) => (
                          <TaxClassDialog
                            close={close}
                            customTaxCodes={customTaxCodes}
                            onSave={handleSave}
                            taxClass={item}
                          />
                        )}
                      </Dialog>
                    </DialogTrigger>
                  </Cell>
                </Row>
              )}
            </TableBody>
          </TableView>
        </div>
      )}
    </div>
  );
}
