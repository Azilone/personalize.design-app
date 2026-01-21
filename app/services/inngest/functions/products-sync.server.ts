import { NonRetriableError } from "inngest";
import { inngest } from "../client.server";
import { productsSyncPayloadSchema } from "../types";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";
import { getOfflineShopifyAdmin } from "../../shopify/admin.server";
import { syncShopifyProducts } from "../../products/product-sync-flow.server";

export const productsSync = inngest.createFunction(
  {
    id: "products/sync",
    concurrency: {
      key: "event.data.shop_id",
      limit: 1,
    },
  },
  { event: "products.sync.requested" },
  async ({ event, step }) => {
    const parsed = productsSyncPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid products sync payload",
      );
      throw new NonRetriableError("Invalid products sync payload");
    }

    const payload = parsed.data;
    const syncedAt = new Date(payload.synced_at);

    logger.info(
      { shop_id: payload.shop_id, sync_id: payload.sync_id },
      "Product sync started",
    );

    const admin = await getOfflineShopifyAdmin(payload.shop_id);

    const result = await step.run("sync-shopify-products", async () =>
      syncShopifyProducts({
        admin,
        shopId: payload.shop_id,
        syncedAt,
      }),
    );

    logger.info(
      {
        shop_id: payload.shop_id,
        sync_id: payload.sync_id,
        product_count: result.count,
      },
      "Shopify products synced",
    );

    captureEvent("products.sync_completed", {
      shop_id: payload.shop_id,
      product_count: result.count,
    });

    return result;
  },
);
