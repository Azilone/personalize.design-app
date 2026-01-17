# Printify Product Matching

This document explains how the app identifies which Shopify products originate from Printify.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [File Reference](#file-reference)
- [Security](#security)
- [Edge Cases](#edge-cases)
- [Multi-Merchant Deployment](#multi-merchant-deployment)
- [Production Considerations](#production-considerations)
- [Future Improvements](#future-improvements)

---

## Problem Statement

When a merchant creates a product in Printify and publishes it to their Shopify store, our app needs to know which products come from Printify. This is important because:

1. Printify products can be personalized with AI-generated designs
2. The UI shows a "Printify" badge for products that come from Printify
3. Order fulfillment workflows differ for Printify vs non-Printify products

**The challenge**: Printify does NOT write any metafields or tags when publishing products to Shopify. There's no built-in way to identify a Printify product from Shopify's side.

---

## Solution Overview

Instead of relying on Shopify metafields, we call the **Printify API directly** during product sync to match products.

Each Printify product has an `external` object containing the Shopify product ID it was published to:

```json
{
  "id": "685807292c35f6107c048e47",
  "title": "Accent Coffee Mug",
  "external": {
    "id": "8333072203911",
    "handle": "https://store.myshopify.com/products/accent-coffee-mug",
    "channel": "shopify"
  }
}
```

We match `external.id` from Printify with the product GID from Shopify.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCT SYNC FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
  │   Shopify    │         │   Our App    │         │   Printify   │
  │   Admin API  │         │   Database   │         │     API      │
  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘
         │                        │                        │
         │  1. GraphQL: List      │                        │
         │◄────Products───────────│                        │
         │                        │                        │
         │  Products with GIDs    │                        │
         │────────────────────────►                        │
         │                        │                        │
         │                        │  2. Get encrypted      │
         │                        │     Printify token     │
         │                        │◄───────────────────────│
         │                        │                        │
         │                        │  3. GET /v1/shops/     │
         │                        │     {id}/products.json │
         │                        │────────────────────────►
         │                        │                        │
         │                        │  Products with         │
         │                        │  external.id           │
         │                        │◄────────────────────────
         │                        │                        │
         │                        │  4. Build matching     │
         │                        │     map & enrich       │
         │                        │                        │
         │                        │  5. Upsert to          │
         │                        │     shop_products      │
         │                        │                        │
         └────────────────────────┴────────────────────────┘

  Matching Logic:
  ┌─────────────────────────────────────────────────────────┐
  │  Shopify GID: "gid://shopify/Product/8333072203911"     │
  │                              ↓                          │
  │  Extract numeric ID: "8333072203911"                    │
  │                              ↓                          │
  │  Match with Printify external.id: "8333072203911"       │
  │                              ↓                          │
  │  Store printify_product_id in shop_products table       │
  └─────────────────────────────────────────────────────────┘
```

---

## How It Works

### Step 1: Merchant Initiates Sync

The merchant clicks "Sync products" on the `/app/products` page. This triggers a POST request to the products route action.

### Step 2: Fetch Shopify Products

We call the Shopify Admin GraphQL API to list all products:

```graphql
query listProducts($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    edges {
      node {
        id # "gid://shopify/Product/8333072203911"
        title
        handle
        featuredImage {
          url
          altText
        }
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

### Step 3: Retrieve Printify Integration

We look up the merchant's Printify integration from the database:

```typescript
const integration = await getPrintifyIntegrationWithToken(shopId);
// Returns: { printifyShopId, encryptedToken, ... }
```

If no integration exists, we skip Printify matching (products sync without Printify data).

### Step 4: Decrypt Token & Call Printify API

The Printify API token is stored encrypted (AES-256-GCM). We decrypt it and call the Printify API:

```typescript
const token = decryptPrintifyToken(integration.encryptedToken);
const printifyProducts = await listPrintifyProducts({
  token,
  printifyShopId: integration.printifyShopId,
});
```

The `listPrintifyProducts` function handles pagination automatically.

### Step 5: Build Matching Map

We create a lookup map from Shopify GID to Printify product info:

```typescript
const map = new Map<
  string,
  { printifyProductId: string; printifyShopId: string }
>();

for (const product of printifyProducts) {
  if (product.externalShopifyGid) {
    // Normalize: "8333072203911" → "gid://shopify/Product/8333072203911"
    const normalizedGid = normalizeToGid(product.externalShopifyGid);
    map.set(normalizedGid, {
      printifyProductId: product.printifyProductId,
      printifyShopId: integration.printifyShopId,
    });
  }
}
```

### Step 6: Enrich & Save

We enrich Shopify products with Printify IDs and upsert to the database:

```typescript
const enrichedProducts = enrichWithPrintifyData(shopifyProducts, printifyMap);
await upsertShopProducts({ shopId, products: enrichedProducts, syncedAt });
```

---

## File Reference

| File                                               | Purpose                                           |
| -------------------------------------------------- | ------------------------------------------------- |
| `app/services/printify/client.server.ts`           | Printify API client with `listPrintifyProducts()` |
| `app/services/printify/integration.server.ts`      | CRUD for `shop_printify_integrations` table       |
| `app/services/printify/token-encryption.server.ts` | AES-256-GCM encrypt/decrypt for tokens            |
| `app/routes/app/products/_index/route.tsx`         | Sync logic with Printify matching                 |
| `app/services/products/product-sync.server.ts`     | Database upsert for `shop_products`               |
| `app/routes/app/printify/route.tsx`                | UI for connecting Printify                        |

### Database Schema

```sql
-- Printify integration per shop
CREATE TABLE shop_printify_integrations (
  shop_id              TEXT PRIMARY KEY,  -- "store.myshopify.com"
  token_ciphertext     TEXT NOT NULL,     -- Encrypted token
  token_iv             TEXT NOT NULL,     -- Initialization vector
  token_auth_tag       TEXT NOT NULL,     -- Authentication tag
  printify_shop_id     TEXT NOT NULL,     -- Printify shop ID
  printify_shop_title  TEXT NOT NULL,
  printify_sales_channel TEXT,
  created_at           DATETIME,
  updated_at           DATETIME
);

-- Synced products with Printify matching
CREATE TABLE shop_products (
  id                  TEXT PRIMARY KEY,
  shop_id             TEXT NOT NULL,
  product_id          TEXT NOT NULL,      -- Shopify GID
  title               TEXT NOT NULL,
  handle              TEXT NOT NULL,
  image_url           TEXT,
  image_alt           TEXT,
  printify_product_id TEXT,               -- NULL if not from Printify
  printify_shop_id    TEXT,               -- NULL if not from Printify
  synced_at           DATETIME,
  created_at          DATETIME,
  updated_at          DATETIME,
  UNIQUE(shop_id, product_id)
);
```

---

## Security

### Token Storage

Printify API tokens are **never stored in plain text**. They are encrypted using AES-256-GCM:

```typescript
// Encryption
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ciphertext = cipher.update(token, "utf8") + cipher.final();
const authTag = cipher.getAuthTag();

// Storage
{
  token_ciphertext: ciphertext.toString("base64"),
  token_iv: iv.toString("base64"),
  token_auth_tag: authTag.toString("base64")
}
```

The encryption key is stored in the environment variable `PRINTIFY_TOKEN_ENCRYPTION_KEY` (32-byte base64-encoded).

### Tenant Isolation

Each Shopify store (identified by `shop_id` = myshopify.com domain) has:

- Its own Printify integration record
- Its own encrypted token
- Its own selected Printify shop

A merchant cannot access another merchant's Printify data.

---

## Edge Cases

| Scenario                                         | Behavior                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| **Merchant has no Printify integration**         | Sync works normally; all products show "Not in Printify"         |
| **Printify API is down**                         | Sync continues; Printify matching is skipped (logged as warning) |
| **Token expired or revoked**                     | Integration is cleared; merchant must reconnect                  |
| **Printify shop deleted**                        | Integration invalidated on next page load                        |
| **Product not yet published to Shopify**         | `external: null` in Printify response; no match                  |
| **Product published to different Shopify store** | No match (correct behavior)                                      |
| **Multiple Printify shops on same token**        | Merchant selects which shop to use during setup                  |

### Error Resilience

If Printify API fails, the sync does NOT fail:

```typescript
try {
  const printifyProducts = await listPrintifyProducts(...);
  // Build matching map
} catch (error) {
  logger.warn(
    { shop_id: shopId, err: error },
    "Failed to fetch Printify products for matching"
  );
  // Continue with empty map - products sync without Printify data
}
```

---

## Multi-Merchant Deployment

### Setup Flow for Each Merchant

1. Merchant installs the Shopify app
2. Navigates to `/app/printify`
3. Generates a Printify API token in their Printify account settings
4. Pastes the token in the app
5. If the token has access to multiple Printify shops, selects the correct one
6. Token is encrypted and stored
7. Merchant syncs products - matching happens automatically

### Data Isolation

```
Shop A (store-a.myshopify.com)
├── shop_printify_integrations: Token A, Printify Shop 123
└── shop_products: Products with printify_product_id from Shop 123

Shop B (store-b.myshopify.com)
├── shop_printify_integrations: Token B, Printify Shop 456
└── shop_products: Products with printify_product_id from Shop 456
```

---

## Production Considerations

### Current Status

| Aspect           | Status           | Notes                  |
| ---------------- | ---------------- | ---------------------- |
| Token encryption | Production-ready | AES-256-GCM            |
| Tenant isolation | Production-ready | Strict shop_id scoping |
| Pagination       | Production-ready | Handles 100+ products  |
| Error resilience | Production-ready | Best-effort matching   |
| Rate limiting    | Not implemented  | See recommendations    |

### Monitoring

Key log messages to monitor:

```
# Successful matching
{"msg": "Built Printify product mapping", "printify_product_count": 8, "matched_count": 7}

# No Printify integration
{"msg": "No Printify integration, skipping match"}

# API failure (warning, not error)
{"msg": "Failed to fetch Printify products for matching", "err": {...}}
```

---

## Future Improvements

### Recommended Before Scale

1. **Rate Limiting & Retry**
   - Printify API has a 600 req/min limit
   - Add exponential backoff for 429 responses

2. **Async Sync for Large Catalogs**
   - For merchants with 500+ products, use Inngest background job
   - Prevents request timeout

3. **Token Expiry Notification**
   - Show UI banner when Printify token is invalid
   - Currently fails silently (logged only)

4. **Printify Webhooks**
   - Listen to `product:publish:started` event
   - Auto-sync when products are published from Printify

### Nice to Have

- Cache Printify product list (TTL: 5 minutes)
- Bulk matching endpoint for initial large syncs
- Admin dashboard showing matching statistics

---

## Testing

### Debug Script

A debug script is available to diagnose matching issues:

```bash
npx tsx scripts/debug-printify-matching.ts
```

This shows:

- All Printify products with their external IDs
- All Shopify products in the database
- Which products matched and which didn't

### Manual Testing Checklist

- [ ] Connect Printify with valid token
- [ ] Connect Printify with invalid token (should show error)
- [ ] Sync products with Printify connected
- [ ] Sync products without Printify connected
- [ ] Disconnect and reconnect Printify
- [ ] Token with multiple shops (should prompt selection)
