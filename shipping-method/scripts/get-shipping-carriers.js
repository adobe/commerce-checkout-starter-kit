import {
  AdobeCommerceHttpClient,
  resolveCommerceHttpClientParams,
} from "@adobe/aio-commerce-lib-api";

/**
 * Retrieves all shipping carriers from the configured Adobe Commerce instance.
 *
 * Reads AIO_COMMERCE_API_BASE_URL plus either AIO_COMMERCE_AUTH_IMS_* or
 * AIO_COMMERCE_AUTH_INTEGRATION_* from process.env (see env.dist). The client already prefixes
 * every request with rest/{storeViewCode}/{version} (defaults: "all", "V1"), so paths here are
 * relative to that, not to the Commerce base URL directly.
 */
export async function main() {
  const client = new AdobeCommerceHttpClient(
    resolveCommerceHttpClientParams(process.env),
  );

  console.info("Fetching shipping carriers...");
  try {
    const carriers = await client.get("oope_shipping_carrier/").json();
    console.info(
      `Total ${carriers.length} shipping carriers fetched: ${carriers
        .map((carrier) => `\n${JSON.stringify(carrier, null, 2)}`)
        .join("")}`,
    );
  } catch (error) {
    console.error(`Failed to retrieve shipping carriers: ${error.message}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
