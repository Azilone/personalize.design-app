import { randomUUID } from "crypto";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  data,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import logger from "../../../../lib/logger";
import { productsActionSchema } from "../../../../schemas/admin";
import {
  countShopProducts,
  getLatestProductSync,
  listShopProducts,
  type ShopProductListItem,
} from "../../../../services/products/product-sync.server";
import {
  listProductTemplateAssignments,
  type ProductTemplateAssignmentSummary,
} from "../../../../services/products/product-template-assignment.server";
import { inngest } from "../../../../services/inngest/client.server";
import { getPrintifyIntegration } from "../../../../services/printify/integration.server";

const SYNC_POLL_INTERVAL_MS = 1000;
const SYNC_MAX_WAIT_MS = 120000;

const waitForProductSync = async (input: {
  shopId: string;
  syncedAt: Date;
}): Promise<boolean> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SYNC_MAX_WAIT_MS) {
    const latest = await getLatestProductSync(input.shopId);
    if (latest && latest >= input.syncedAt) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, SYNC_POLL_INTERVAL_MS));
  }

  return false;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const [products, lastSyncedAt, printifyIntegration, assignments] =
    await Promise.all([
      listShopProducts(shopId),
      getLatestProductSync(shopId),
      getPrintifyIntegration(shopId),
      listProductTemplateAssignments(shopId),
    ]);

  const assignmentsByProductId = assignments.reduce(
    (acc, assignment) => {
      acc[assignment.productId] = assignment;
      return acc;
    },
    {} as Record<string, ProductTemplateAssignmentSummary>,
  );

  return {
    products,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null,
    printifyConnected: Boolean(printifyIntegration),
    assignmentsByProductId,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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
    const syncId = randomUUID();
    const syncedAt = new Date();

    await inngest.send({
      name: "products.sync.requested",
      data: {
        shop_id: shopId,
        sync_id: syncId,
        synced_at: syncedAt.toISOString(),
      },
    });

    const syncCompleted = await waitForProductSync({ shopId, syncedAt });

    if (!syncCompleted) {
      logger.warn(
        { shop_id: shopId, sync_id: syncId },
        "Product sync timed out",
      );

      return data(
        {
          error: {
            code: "sync_timeout",
            message: "Sync is taking longer than expected. Refresh in a moment.",
          },
        },
        { status: 504 },
      );
    }

    const productCount = await countShopProducts(shopId);

    return data({ success: true, count: productCount });
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
  printifyConnected: boolean;
  assignmentsByProductId: Record<string, ProductTemplateAssignmentSummary>;
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
  const { products, lastSyncedAt, printifyConnected, assignmentsByProductId } =
    useLoaderData<typeof loader>() as LoaderData;
  const fetcher = useFetcher<ActionData>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
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

          {!printifyConnected ? (
            <s-banner tone="warning">
              <s-text>
                Printify isn&apos;t connected yet. Sync will still pull Shopify
                products, but Printify matching is disabled until you connect
                your Printify API token in setup.
              </s-text>
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
                navigate(`/app${embeddedSearch}`);
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
                No products synced yet. Click &quot;Sync products&quot; to pull your
                Shopify catalog.
              </s-text>
            </s-banner>
          ) : (
            <s-stack direction="block" gap="small">
              {products.map((product, index) => (
                <s-card key={product.productId}>
                  <s-stack direction="block" gap="small">
                    <s-stack direction="inline" gap="small">
                      {product.imageUrl ? (
                        <s-thumbnail
                          src={product.imageUrl}
                          alt={product.imageAlt ?? product.title}
                          size="base"
                        />
                      ) : null}
                      <s-stack direction="block" gap="small">
                        <s-text type="strong">{product.title}</s-text>
                        <s-text color="subdued">{product.handle}</s-text>
                      </s-stack>
                    </s-stack>
                    <s-stack direction="inline" gap="small">
                      <s-badge tone="info">Shopify</s-badge>
                      {product.printifyProductId ? (
                        <s-badge tone="success">Printify</s-badge>
                      ) : (
                        <s-badge tone="warning">Not in Printify</s-badge>
                      )}
                    </s-stack>
                    <s-stack direction="block" gap="small">
                      {assignmentsByProductId[product.productId] ? (
                        <>
                          <s-stack direction="inline" gap="small">
                            <s-badge
                              tone={
                                assignmentsByProductId[product.productId]
                                  .personalizationEnabled
                                  ? "success"
                                  : "info"
                              }
                            >
                              {assignmentsByProductId[product.productId]
                                .personalizationEnabled
                                ? "Personalization enabled"
                                : "Template assigned"}
                            </s-badge>
                          </s-stack>
                          <s-text color="subdued">
                            Template: {" "}
                            {
                              assignmentsByProductId[product.productId]
                                .templateName
                            }
                          </s-text>
                        </>
                      ) : (
                        <s-text color="subdued">
                          No template assigned yet.
                        </s-text>
                      )}
                    </s-stack>
                    <s-button
                      id={`product-${index}`}
                      variant="primary"
                      onClick={() => {
                        // URL-encode the GID to handle slashes (gid://shopify/Product/...)
                        const encodedId = encodeURIComponent(product.productId);
                        navigate(`/app/products/${encodedId}${embeddedSearch}`);
                      }}
                    >
                      Configure
                    </s-button>
                  </s-stack>
                </s-card>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
