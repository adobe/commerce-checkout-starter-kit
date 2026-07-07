import { getAdobeCommerceClient } from "../lib/commerce-client.js";

/**
 * Retrieves all shipping carrier from the configured Adobe Commerce instance
 */
export async function main() {
  const client = await getAdobeCommerceClient(process.env);
  const response = await client.getOopeShippingCarriers();
  console.info("Fetching shipping carriers...");
  if (response.success) {
    console.info(
      `Total ${response.message.length} shipping carriers fetched: ${response.message
        .map((carrier) => `\n${JSON.stringify(carrier, null, 2)}`)
        .join("")}`,
    );
  } else {
    console.error(`Failed to retrieve shipping carriers${response.message}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
