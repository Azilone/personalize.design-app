import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import logger from "../lib/logger";

const shouldLog = () =>
  process.env.NODE_ENV === "development" ||
  process.env.PD_DEBUG_AUTH_BOUNCE === "1";

const safeBounceLogContext = (request: Request) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale");
  const chargeId = url.searchParams.get("charge_id");
  const shopifyReload = url.searchParams.get("shopify-reload");

  let shopifyReloadPath: string | null = null;
  if (shopifyReload) {
    try {
      shopifyReloadPath = new URL(shopifyReload).pathname;
    } catch {
      shopifyReloadPath = null;
    }
  }

  return {
    path: url.pathname,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_charge_id: Boolean(chargeId),
    has_shopify_reload: Boolean(shopifyReload),
    shopify_reload_path: shopifyReloadPath,
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeBounceLogContext(request);
  if (shouldLog()) {
    logger.info(logCtx, "Auth session-token requested");
  }

  try {
    await authenticate.admin(request);
    // If Shopify didn't throw a bounce Response, return an empty response.
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) {
      if (shouldLog()) {
        logger.info(
          { ...logCtx, status: error.status },
          "Auth session-token responded",
        );
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { ...logCtx, err_message: message },
        "Auth session-token failed",
      );
    }

    throw error;
  }
};
