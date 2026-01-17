import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import logger from "../../../../lib/logger";
import { captureEvent } from "../../../../lib/posthog.server";
import { productsActionSchema } from "../../../../schemas/admin";
import {
  listShopifyProducts,
  type ShopifyProduct,
} from "../../../../services/shopify/products.server";
import {
  getLatestProductSync,
  listShopProducts,
  upsertShopProducts,
  type ShopProductListItem,
} from "../../../../services/products/product-sync.server";
import { getPrintifyIntegrationWithToken } from "../../../../services/printify/integration.server";
import { listPrintifyProducts } from "../../../../services/printify/client.server";
import { decryptPrintifyToken } from "../../../../services/printify/token-encryption.server";

/**
 * Builds a lookup map from Shopify GID -> Printify product info.
 * This matches products published from Printify to Shopify.
 *
 * Printify's external.id can be:
 * - A full GID: "gid://shopify/Product/12345"
 * - Just the numeric ID: "12345"
 *
 * We normalize all IDs to full GID format for consistent matching.
 */
type PrintifyProductMapping = Map<
  string,
  { printifyProductId: string; printifyShopId: string }
>;

/**
 * Normalizes a Shopify product ID to full GID format.
 * Handles both "12345" and "gid://shopify/Product/12345" formats.
 */
const normalizeToGid = (externalId: string): string => {
  if (externalId.startsWith("gid://")) {
    return externalId;
  }
  // Numeric ID - convert to GID format
  return `gid://shopify/Product/${externalId}`;
};

/**
 * Extracts the numeric ID from a Shopify GID.
 * "gid://shopify/Product/12345" -> "12345"
 */
const extractNumericId = (gid: string): string => {
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
};

const buildPrintifyProductMap = async (
  shopId: string,
): Promise<PrintifyProductMapping> => {
  const map: PrintifyProductMapping = new Map();

  // Try to get Printify integration for this shop
  const integration = await getPrintifyIntegrationWithToken(shopId);
  if (!integration) {
    logger.info({ shop_id: shopId }, "No Printify integration, skipping match");
    return map;
  }

  try {
    const token = decryptPrintifyToken(integration.encryptedToken);
    const printifyProducts = await listPrintifyProducts({
      token,
      printifyShopId: integration.printifyShopId,
    });

    for (const product of printifyProducts) {
      if (product.externalShopifyGid) {
        // Store with normalized GID as key
        const normalizedGid = normalizeToGid(product.externalShopifyGid);
        map.set(normalizedGid, {
          printifyProductId: product.printifyProductId,
          printifyShopId: integration.printifyShopId,
        });
      }
    }

    logger.info(
      {
        shop_id: shopId,
        printify_product_count: printifyProducts.length,
        matched_count: map.size,
      },
      "Built Printify product mapping",
    );
  } catch (error) {
    // Log but don't fail sync - Printify matching is best-effort
    logger.warn(
      { shop_id: shopId, err: error },
      "Failed to fetch Printify products for matching",
    );
  }

  return map;
};

/**
 * Enriches Shopify products with Printify IDs by matching external.id.
 * Tries both GID and numeric ID matching for robustness.
 */
const enrichWithPrintifyData = (
  products: ShopifyProduct[],
  printifyMap: PrintifyProductMapping,
): ShopifyProduct[] => {
  return products.map((product) => {
    // Try exact match first (GID to GID)
    let printifyInfo = printifyMap.get(product.id);

    // If no match, try matching by numeric ID (Printify may store just "12345")
    if (!printifyInfo) {
      const numericId = extractNumericId(product.id);
      const numericGid = `gid://shopify/Product/${numericId}`;
      printifyInfo = printifyMap.get(numericGid);
    }

    if (printifyInfo) {
      return {
        ...product,
        printifyProductId: printifyInfo.printifyProductId,
        printifyShopId: printifyInfo.printifyShopId,
      };
    }
    return product;
  });
};

const syncAllShopifyProducts = async (input: {
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"];
  shopId: string;
}): Promise<{ count: number; syncedAt: Date }> => {
  let cursor: string | null = null;
  let hasNextPage = true;
  const allProducts: ShopifyProduct[] = [];
  const syncedAt = new Date();

  // Fetch all Shopify products
  while (hasNextPage) {
    const page = await listShopifyProducts({
      admin: input.admin,
      after: cursor,
    });

    allProducts.push(...page.products);
    hasNextPage = page.hasNextPage;
    cursor = page.nextCursor;
  }

  // Build Printify mapping and enrich Shopify products
  const printifyMap = await buildPrintifyProductMap(input.shopId);
  const enrichedProducts = enrichWithPrintifyData(allProducts, printifyMap);

  const result = await upsertShopProducts({
    shopId: input.shopId,
    products: enrichedProducts,
    syncedAt,
  });

  return result;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const [products, lastSyncedAt] = await Promise.all([
    listShopProducts(shopId),
    getLatestProductSync(shopId),
  ]);

  return {
    products,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = productsActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "Invalid request.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await syncAllShopifyProducts({ admin, shopId });

    logger.info(
      { shop_id: shopId, product_count: result.count },
      "Shopify products synced",
    );
    // LOW-1 FIX: Use domain.action format per architecture conventions
    captureEvent("products.sync_completed", {
      shop_id: shopId,
      product_count: result.count,
    });

    return data({ success: true, count: result.count });
  } catch (error) {
    logger.error({ shop_id: shopId, err: error }, "Product sync failed");

    return data(
      {
        error: {
          code: "sync_failed",
          message: "Failed to sync products from Shopify.",
        },
      },
      { status: 500 },
    );
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

type LoaderData = {
  products: ShopProductListItem[];
  lastSyncedAt: string | null;
};

type ActionData = {
  error?: { message: string };
  success?: boolean;
};

const formatSyncedAt = (value: string | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function ProductsListPage() {
  const { products, lastSyncedAt } = useLoaderData<
    typeof loader
  >() as LoaderData;
  const fetcher = useFetcher<ActionData>();
  const app = useAppBridge();
  const embeddedSearch = app?.config
    ? buildEmbeddedSearch(`?shop=${app.config.shop}&host=${app.config.host}`)
    : "";
  const isSubmitting = fetcher.state === "submitting";
  const hasProducts = products.length > 0;
  const syncedAtLabel = formatSyncedAt(lastSyncedAt);

  const errorMessage = fetcher.data?.error?.message ?? null;
  const successMessage = fetcher.data?.success
    ? "Products synced successfully."
    : null;

  return (
    <s-page heading="Products">
      <s-section heading="Sync Shopify products">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Pull products from your Shopify catalog to configure personalization
            settings. Syncing updates existing records without changing your
            Shopify listings.
          </s-paragraph>

          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
            </s-banner>
          ) : null}

          {successMessage ? (
            <s-banner tone="success">
              <s-text>{successMessage}</s-text>
            </s-banner>
          ) : null}

          {syncedAtLabel ? (
            <s-banner tone="info">
              <s-text>Last synced {syncedAtLabel}</s-text>
            </s-banner>
          ) : null}

          <s-stack direction="inline" gap="small">
            <s-button
              variant="primary"
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => {
                const formData = new FormData();
                formData.append("intent", "products_sync");
                fetcher.submit(formData, { method: "post" });
              }}
            >
              {hasProducts ? "Re-sync products" : "Sync products"}
            </s-button>

            <s-button
              variant="secondary"
              onClick={() => {
                window.open(`/app${embeddedSearch}`, "_top");
              }}
            >
              Back to setup
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Product catalog">
        <s-stack direction="block" gap="base">
          {!hasProducts ? (
            <s-banner tone="info">
              <s-text>
                No products synced yet. Click "Sync products" to pull your
                Shopify catalog.
              </s-text>
            </s-banner>
          ) : (
            <s-stack direction="block" gap="small">
              <s-table variant="list">
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header listSlot="secondary">Status</s-table-header>
                  <s-table-header listSlot="inline">Action</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {products.map((product, index) => (
                    <s-table-row
                      key={product.productId}
                      clickDelegate={`product-${index}`}
                    >
                      <s-table-cell>
                        <s-stack direction="block" gap="small">
                          {product.imageUrl ? (
                            <s-thumbnail
                              src={product.imageUrl}
                              alt={product.imageAlt ?? product.title}
                              size="base"
                            />
                          ) : null}
                          <s-text type="strong">{product.title}</s-text>
                          <s-text color="subdued">{product.handle}</s-text>
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        <s-stack direction="inline" gap="small">
                          <s-badge tone="info">Shopify</s-badge>
                          {product.printifyProductId ? (
                            <s-badge tone="success">Printify</s-badge>
                          ) : (
                            <s-badge tone="warning">Not in Printify</s-badge>
                          )}
                        </s-stack>
                      </s-table-cell>
                      <s-table-cell>
                        <s-button
                          id={`product-${index}`}
                          variant="primary"
                          onClick={() => {
                            // URL-encode the GID to handle slashes (gid://shopify/Product/...)
                            const encodedId = encodeURIComponent(
                              product.productId,
                            );
                            window.open(
                              `/app/products/${encodedId}${embeddedSearch}`,
                              "_top",
                            );
                          }}
                        >
                          Configure
                        </s-button>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
