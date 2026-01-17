/**
 * Seeds Printify integration into the database for a shop.
 *
 * Usage:
 *   PRINTIFY_API_TOKEN=your_token SHOP_ID=your-store.myshopify.com pnpm tsx scripts/seed-printify-integration.ts
 *
 * This script:
 * 1. Validates the token with Printify API
 * 2. Encrypts the token
 * 3. Stores it in the database for the specified shop
 */

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

// Encryption functions (copied from token-encryption.server.ts to avoid import issues)
const ENCRYPTION_KEY_ENV = "PRINTIFY_TOKEN_ENCRYPTION_KEY";
const IV_LENGTH = 12;

type EncryptedToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

function getEncryptionKey(): Buffer {
  const rawKey = process.env[ENCRYPTION_KEY_ENV];

  if (!rawKey) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is not configured in .env`);
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key.`,
    );
  }

  return key;
}

function encryptToken(token: string): EncryptedToken {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

async function main() {
  const token = process.env.PRINTIFY_API_TOKEN;
  const shopId =
    process.env.SHOP_ID ?? "personalized-design-dev-store.myshopify.com";

  if (!token) {
    console.error("Error: PRINTIFY_API_TOKEN environment variable is required");
    console.error(
      "Usage: PRINTIFY_API_TOKEN=your_token pnpm tsx scripts/seed-printify-integration.ts",
    );
    process.exit(1);
  }

  console.log("=== Seeding Printify Integration ===\n");
  console.log(`Shop ID: ${shopId}`);

  // Step 1: Validate token with Printify API
  console.log("\n1. Validating Printify token...");
  const shopsResponse = await fetch(`${PRINTIFY_BASE_URL}/shops.json`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "personalize-design-seed-script",
      Accept: "application/json",
    },
  });

  if (!shopsResponse.ok) {
    console.error(
      `   Failed: ${shopsResponse.status} ${shopsResponse.statusText}`,
    );
    if (shopsResponse.status === 401) {
      console.error("   Token is invalid or expired!");
    }
    process.exit(1);
  }

  const shops = (await shopsResponse.json()) as Array<{
    id: number;
    title: string;
    sales_channel: string | null;
  }>;

  if (shops.length === 0) {
    console.error("   No Printify shops found for this token!");
    process.exit(1);
  }

  const selectedShop = shops[0];
  console.log(`   Token valid! Found ${shops.length} shop(s)`);
  console.log(
    `   Using shop: "${selectedShop.title}" (ID: ${selectedShop.id})`,
  );

  // Step 2: Encrypt the token
  console.log("\n2. Encrypting token...");
  const encrypted = encryptToken(token);
  console.log("   Token encrypted successfully");

  // Step 3: Save to database
  console.log("\n3. Saving to database...");
  const prisma = new PrismaClient();

  try {
    await prisma.shopPrintifyIntegration.upsert({
      where: { shop_id: shopId },
      update: {
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
        printify_shop_id: String(selectedShop.id),
        printify_shop_title: selectedShop.title,
        printify_sales_channel: selectedShop.sales_channel,
      },
      create: {
        shop_id: shopId,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
        printify_shop_id: String(selectedShop.id),
        printify_shop_title: selectedShop.title,
        printify_sales_channel: selectedShop.sales_channel,
      },
    });

    console.log("   Saved to shop_printify_integrations table!");

    // Verify it was saved
    const saved = await prisma.shopPrintifyIntegration.findUnique({
      where: { shop_id: shopId },
      select: {
        shop_id: true,
        printify_shop_id: true,
        printify_shop_title: true,
        printify_sales_channel: true,
      },
    });

    console.log("\n=== Integration Saved ===");
    console.log(`   Shop ID: ${saved?.shop_id}`);
    console.log(`   Printify Shop ID: ${saved?.printify_shop_id}`);
    console.log(`   Printify Shop Title: ${saved?.printify_shop_title}`);
    console.log(`   Sales Channel: ${saved?.printify_sales_channel ?? "N/A"}`);
    console.log("\nNow go to /app/products and click 'Re-sync products'!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
