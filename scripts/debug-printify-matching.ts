/**
 * Debug script to show Printify products with their external IDs
 * and compare with Shopify products in the database.
 */

import { PrismaClient } from "@prisma/client";

const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

async function main() {
  const token = process.env.PRINTIFY_API_TOKEN;
  const printifyShopId = "23005203";

  if (!token) {
    console.error("PRINTIFY_API_TOKEN not set");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // Fetch Printify products
    console.log("=== Printify Products ===\n");
    const response = await fetch(
      `${PRINTIFY_BASE_URL}/shops/${printifyShopId}/products.json`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "personalize-design-debug",
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      console.error(`Printify API error: ${response.status}`);
      process.exit(1);
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        title: string;
        external?: { id?: string; handle?: string } | null;
      }>;
    };

    console.log("Printify products:");
    for (const p of data.data) {
      const externalId = p.external?.id ?? "NOT PUBLISHED";
      console.log(`  - "${p.title}"`);
      console.log(`    Printify ID: ${p.id}`);
      console.log(`    External ID: ${externalId}`);
      if (externalId !== "NOT PUBLISHED") {
        console.log(`    Expected GID: gid://shopify/Product/${externalId}`);
      }
      console.log("");
    }

    // Fetch Shopify products from DB
    console.log("\n=== Shopify Products in DB ===\n");
    const shopProducts = await prisma.shopProduct.findMany({
      where: { shop_id: "personalized-design-dev-store.myshopify.com" },
      orderBy: { title: "asc" },
    });

    console.log("Shopify products:");
    for (const p of shopProducts) {
      const numericId = p.product_id.match(/\/(\d+)$/)?.[1] ?? "unknown";
      console.log(`  - "${p.title}"`);
      console.log(`    GID: ${p.product_id}`);
      console.log(`    Numeric ID: ${numericId}`);
      console.log(`    Printify ID: ${p.printify_product_id ?? "NOT MATCHED"}`);
      console.log("");
    }

    // Find mismatches
    console.log("\n=== Matching Analysis ===\n");

    // Build a map of Printify external IDs -> Printify product
    const printifyByExternalId = new Map<
      string,
      { id: string; title: string }
    >();
    for (const p of data.data) {
      if (p.external?.id) {
        printifyByExternalId.set(p.external.id, { id: p.id, title: p.title });
      }
    }

    // Check each Shopify product
    for (const shopProduct of shopProducts) {
      const numericId = shopProduct.product_id.match(/\/(\d+)$/)?.[1];
      if (!numericId) continue;

      const printifyMatch = printifyByExternalId.get(numericId);
      if (printifyMatch) {
        console.log(
          `✓ "${shopProduct.title}" matches Printify "${printifyMatch.title}"`,
        );
      } else if (
        shopProduct.title.toLowerCase().includes("mug") ||
        shopProduct.title.toLowerCase().includes("personalized")
      ) {
        console.log(
          `✗ "${shopProduct.title}" (ID: ${numericId}) - NO PRINTIFY MATCH`,
        );
      }
    }

    // Find Printify products without Shopify match
    console.log("\n=== Printify Products Without Shopify Match ===\n");
    const shopifyNumericIds = new Set(
      shopProducts
        .map((p) => p.product_id.match(/\/(\d+)$/)?.[1])
        .filter(Boolean),
    );

    for (const p of data.data) {
      if (!p.external?.id) {
        console.log(`  "${p.title}" - NOT PUBLISHED to Shopify`);
      } else if (!shopifyNumericIds.has(p.external.id)) {
        console.log(
          `  "${p.title}" - Published to different Shopify store (ID: ${p.external.id})`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
