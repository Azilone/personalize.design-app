import { PrismaClient } from "@prisma/client";
import { updateProductPersonalizationMetafield } from "../app/services/products/product-template-assignment.server";
import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";

const prisma = new PrismaClient();

// SAFETY: This script should NEVER run in production
if (process.env.NODE_ENV === "production") {
  throw new Error("fix-assignment.ts cannot run in production environment");
}

async function fixAssignment() {
  // Use environment variables for flexibility, with defaults for local development
  const shopDomain =
    process.env.SHOP_DOMAIN || "personalized-design-dev-store-2.myshopify.com";
  const productId = process.env.PRODUCT_ID || "7676843622477"; // Accent Coffee Mug
  const templateId = process.env.TEMPLATE_ID || "cmksehg9p0001w17zzihagnz7"; // claymotion style

  console.log(`Fixing assignment for ${shopDomain} product ${productId}...`);

  // 1. Get Session for Admin API
  const session = await prisma.session.findFirst({
    where: { shop: shopDomain },
  });

  if (!session) {
    console.error("No session found for shop");
    return;
  }

  // 2. Initialize Admin Client
  const api = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
    apiVersion: ApiVersion.October25,
    scopes: process.env.SCOPES?.split(","),
    hostName: shopDomain,
    isEmbeddedApp: false,
  });

  const client = new api.clients.Graphql({
    session: session as any,
  });

  // 3. Update Metafield
  try {
    console.log("Syncing metafield...");
    await updateProductPersonalizationMetafield({
      admin: client,
      productId,
      templateId,
      personalizationEnabled: true,
    });
    console.log("Metafield synced successfully!");
  } catch (error) {
    console.error("Metafield sync failed:", error);
  }

  // Verify read
  const verifyQuery = `#graphql
    query getProduct($id: ID!) {
      product(id: $id) {
        metafield(namespace: "personalize_design", key: "config") {
          value
        }
      }
    }
  `;
  const verifyRes = await client.request(verifyQuery, {
    variables: { id: `gid://shopify/Product/${productId}` },
  });
  console.log("Verification Read:", JSON.stringify(verifyRes, null, 2));

  // 4. Update DB
  console.log("Updating DB...");
  await prisma.productTemplateAssignment.upsert({
    where: {
      shop_id_product_id: {
        shop_id: shopDomain,
        product_id: productId,
      },
    },
    create: {
      shop_id: shopDomain,
      product_id: productId,
      template_id: templateId,
      personalization_enabled: true,
    },
    update: {
      template_id: templateId,
      personalization_enabled: true,
    },
  });
  console.log("DB updated.");
}

fixAssignment()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
