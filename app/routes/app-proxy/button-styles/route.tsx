import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import { getButtonStylesForStorefront } from "../../../services/shops/button-styles.server";
import logger from "../../../lib/logger";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.public.appProxy(request);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "App proxy authentication failed",
    );
    throw error;
  }

  const url = new URL(request.url);
  const shopId = url.searchParams.get("shop_id");

  if (!shopId) {
    return data(
      {
        data: null,
        error: {
          code: "invalid_request",
          message: "Missing shop_id parameter",
        },
      },
      { status: 400 },
    );
  }

  logger.info(
    { shop_id: shopId, url: request.url },
    "Button styles API called",
  );

  try {
    const buttonStyles = await getButtonStylesForStorefront(shopId);

    return data({
      data: buttonStyles,
      error: null,
    });
  } catch (error) {
    logger.error(
      {
        shop_id: shopId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to fetch button styles",
    );

    return data(
      {
        data: null,
        error: {
          code: "internal_error",
          message: "Failed to fetch button styles",
        },
      },
      { status: 500 },
    );
  }
};
