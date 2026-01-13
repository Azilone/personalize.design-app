import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import logger from "../lib/logger";

const shouldLog = () =>
  process.env.NODE_ENV === "development" ||
  process.env.PD_DEBUG_AUTH_BOUNCE === "1";

const safeExitIframeLogContext = (request: Request) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale");
  const exitIframe = url.searchParams.get("exitIframe");

  let exitIframeHost: string | null = null;
  if (exitIframe) {
    try {
      exitIframeHost = new URL(exitIframe).host;
    } catch {
      exitIframeHost = null;
    }
  }

  return {
    path: url.pathname,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_exit_iframe: Boolean(exitIframe),
    exit_iframe_host: exitIframeHost,
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeExitIframeLogContext(request);
  if (shouldLog()) {
    logger.info(logCtx, "Auth exit-iframe requested");
  }

  try {
    await authenticate.admin(request);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) {
      if (shouldLog()) {
        logger.info(
          { ...logCtx, status: error.status },
          "Auth exit-iframe responded",
        );
      }
    } else {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ ...logCtx, err_message: message }, "Auth exit-iframe failed");
    }

    throw error;
  }
};
