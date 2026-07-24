import { createExtensionApp } from "@adobe/aio-commerce-lib-admin-ui/web";
import "@react-spectrum/s2/page.css";

import config from "#app.commerce.config";
import { TaxClassesPage } from "#web/pages/tax-classes-page.tsx";

createExtensionApp({
  menu: <TaxClassesPage />,
  metadata: {
    extensionId: config.metadata.id,
  },
});
