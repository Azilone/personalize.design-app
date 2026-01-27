import { useLoaderData } from "react-router";

import { authenticate } from "../../shopify.server";
import logger from "../../lib/logger";

export const loader = async ({ request }: { request: Request }) => {
  logger.info({ url: request.url }, "App proxy parent route received request");

  try {
    await authenticate.public.appProxy(request);
    logger.info("App proxy parent route authentication successful");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "App proxy parent route authentication failed"
    );
    throw error;
  }

  const url = new URL(request.url);

  return {
    shop: url.searchParams.get("shop"),
    loggedInCustomerId: url.searchParams.get("logged_in_customer_id"),
  };
};

export default function AppProxy() {
  const { shop, loggedInCustomerId } = useLoaderData<typeof loader>();

  return (
    <div>
      {`Hello from personalize.design (${
        loggedInCustomerId || "not-logged-in"
      }) on ${shop}`}
    </div>
  );
}
