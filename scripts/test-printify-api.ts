/**
 * Test script to verify Printify API access and see product data.
 *
 * Usage:
 *   PRINTIFY_API_TOKEN=your_token_here pnpm tsx scripts/test-printify-api.ts
 *
 * Or if you want to test with a specific shop ID:
 *   PRINTIFY_API_TOKEN=your_token PRINTIFY_SHOP_ID=123456 pnpm tsx scripts/test-printify-api.ts
 */

const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

async function main() {
  const token = process.env.PRINTIFY_API_TOKEN;

  if (!token) {
    console.error("Error: PRINTIFY_API_TOKEN environment variable is required");
    console.error(
      "Usage: PRINTIFY_API_TOKEN=your_token pnpm tsx scripts/test-printify-api.ts",
    );
    process.exit(1);
  }

  console.log("=== Testing Printify API ===\n");

  // Step 1: List shops
  console.log("1. Fetching Printify shops...");
  const shopsResponse = await fetch(`${PRINTIFY_BASE_URL}/shops.json`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "personalize-design-test-script",
      Accept: "application/json",
    },
  });

  if (!shopsResponse.ok) {
    console.error(
      `   Failed: ${shopsResponse.status} ${shopsResponse.statusText}`,
    );
    const body = await shopsResponse.text();
    console.error(`   Response: ${body}`);
    process.exit(1);
  }

  const shops = (await shopsResponse.json()) as Array<{
    id: number;
    title: string;
    sales_channel: string | null;
  }>;

  console.log(`   Found ${shops.length} shop(s):`);
  for (const shop of shops) {
    console.log(
      `   - ID: ${shop.id}, Title: "${shop.title}", Channel: ${shop.sales_channel ?? "N/A"}`,
    );
  }

  // Step 2: Get products from first shop (or specified shop)
  const targetShopId = process.env.PRINTIFY_SHOP_ID ?? String(shops[0]?.id);

  if (!targetShopId) {
    console.error("\n   No shops found!");
    process.exit(1);
  }

  console.log(`\n2. Fetching products from shop ${targetShopId}...`);
  const productsResponse = await fetch(
    `${PRINTIFY_BASE_URL}/shops/${targetShopId}/products.json`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "personalize-design-test-script",
        Accept: "application/json",
      },
    },
  );

  if (!productsResponse.ok) {
    console.error(
      `   Failed: ${productsResponse.status} ${productsResponse.statusText}`,
    );
    const body = await productsResponse.text();
    console.error(`   Response: ${body}`);
    process.exit(1);
  }

  const productsData = (await productsResponse.json()) as {
    current_page: number;
    last_page: number;
    data: Array<{
      id: string;
      title: string;
      external?: {
        id?: string;
        handle?: string;
        channel?: string;
      } | null;
    }>;
  };

  console.log(
    `   Found ${productsData.data.length} product(s) on page ${productsData.current_page}/${productsData.last_page}:\n`,
  );

  for (const product of productsData.data) {
    console.log(`   Product: "${product.title}"`);
    console.log(`     Printify ID: ${product.id}`);

    if (product.external) {
      console.log(
        `     External ID (Shopify): ${product.external.id ?? "null"}`,
      );
      console.log(`     External Handle: ${product.external.handle ?? "null"}`);
      console.log(
        `     External Channel: ${product.external.channel ?? "null"}`,
      );
    } else {
      console.log(`     External: Not published to any channel`);
    }
    console.log("");
  }

  console.log("=== Done ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
