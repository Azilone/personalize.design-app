import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../shopify.server";
import logger from "../../../lib/logger";

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
  const idToken = url.searchParams.get("id_token");
  const session = url.searchParams.get("session");

  let shopifyReloadPath: string | null = null;
  let shopifyReloadOrigin: string | null = null;

  if (shopifyReload) {
    try {
      const parsed = new URL(shopifyReload, url.origin);
      shopifyReloadPath = parsed.pathname;
      shopifyReloadOrigin = parsed.origin;
    } catch {
      shopifyReloadPath = null;
      shopifyReloadOrigin = null;
    }
  }

  return {
    path: url.pathname,
    request_origin: url.origin,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_charge_id: Boolean(chargeId),
    has_shopify_reload: Boolean(shopifyReload),
    shopify_reload_origin: shopifyReloadOrigin,
    shopify_reload_path: shopifyReloadPath,
    has_id_token: Boolean(idToken),
    has_session: Boolean(session),
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeBounceLogContext(request);
  if (shouldLog()) {
    logger.info(logCtx, "Auth session-token requested");
  }

  const requestUrl = new URL(request.url);
  const shopifyReload = requestUrl.searchParams.get("shopify-reload");
  const idToken = requestUrl.searchParams.get("id_token");
  const session = requestUrl.searchParams.get("session");

  if (shopifyReload) {
    try {
      const parsedReload = new URL(shopifyReload, requestUrl.origin);
      const hadIdToken = parsedReload.searchParams.has("id_token");
      const hadSession = parsedReload.searchParams.has("session");

      if (idToken && !hadIdToken) {
        parsedReload.searchParams.set("id_token", idToken);
      }

      if (session && !hadSession) {
        parsedReload.searchParams.set("session", session);
      }

      const normalizedShopifyReload = `${parsedReload.pathname}${parsedReload.search}`;
      const shouldRedirect =
        shopifyReload !== normalizedShopifyReload || Boolean(idToken);

      if (shouldRedirect) {
        requestUrl.searchParams.set("shopify-reload", normalizedShopifyReload);

        if (idToken) {
          requestUrl.searchParams.delete("id_token");
        }

        const location = `${requestUrl.pathname}?${requestUrl.searchParams.toString()}`;

        if (shouldLog()) {
          logger.info(
            {
              ...logCtx,
              normalized_shopify_reload_path: parsedReload.pathname,
              moved_id_token: Boolean(idToken) && !hadIdToken,
              moved_session: Boolean(session) && !hadSession,
            },
            "Auth session-token normalized shopify-reload",
          );
        }

        return new Response(null, {
          status: 302,
          headers: { Location: location },
        });
      }
    } catch (normalizationError) {
      if (shouldLog()) {
        const message =
          normalizationError instanceof Error
            ? normalizationError.message
            : String(normalizationError);
        logger.warn(
          { ...logCtx, err_message: message },
          "Auth session-token failed to normalize shopify-reload",
        );
      }
    }
  }

  try {
    await authenticate.admin(request);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) {
      const contentType = error.headers.get("content-type");

      if (shouldLog()) {
        const contentSecurityPolicy = error.headers.get(
          "content-security-policy",
        );
        const location = error.headers.get("location");

        logger.info(
          {
            ...logCtx,
            status: error.status,
            content_type: contentType,
            has_csp: Boolean(contentSecurityPolicy),
            csp_includes_admin: contentSecurityPolicy
              ? contentSecurityPolicy.includes("admin.shopify.com")
              : null,
            has_location: Boolean(location),
          },
          "Auth session-token responded",
        );

        if (
          process.env.NODE_ENV === "development" &&
          process.env.PD_DEBUG_AUTH_BOUNCE_BODY === "1"
        ) {
          try {
            const bodyText = await error.clone().text();
            logger.info(
              {
                ...logCtx,
                status: error.status,
                body_preview: bodyText.slice(0, 300),
              },
              "Auth session-token body preview",
            );
          } catch (bodyError) {
            const bodyMessage =
              bodyError instanceof Error
                ? bodyError.message
                : String(bodyError);
            logger.warn(
              { ...logCtx, status: error.status, err_message: bodyMessage },
              "Auth session-token body preview failed",
            );
          }
        }
      }

      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { ...logCtx, err_message: message },
      "Auth session-token failed",
    );

    throw error;
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
