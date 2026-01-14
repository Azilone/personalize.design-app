import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import logger from "../lib/logger";
import { printifyActionSchema } from "../schemas/admin";
import {
  PrintifyRequestError,
  validatePrintifyToken,
} from "../services/printify/client.server";
import { encryptPrintifyToken } from "../services/printify/token-encryption.server";
import {
  getPrintifyIntegration,
  upsertPrintifyIntegration,
} from "../services/printify/integration.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const integration = await getPrintifyIntegration(shopId);

  return {
    integration,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = printifyActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  try {
    const shop = await validatePrintifyToken(parsed.data.printify_api_token);
    const encryptedToken = encryptPrintifyToken(parsed.data.printify_api_token);

    await upsertPrintifyIntegration({
      shopId,
      encryptedToken,
      printifyShopId: shop.shopId,
      printifyShopTitle: shop.shopTitle,
      printifySalesChannel: shop.salesChannel,
    });

    logger.info(
      { shop_id: shopId, printify_shop_id: shop.shopId },
      "Printify connected",
    );

    return data({ success: true });
  } catch (error) {
    if (error instanceof PrintifyRequestError) {
      const status =
        error.code === "invalid_token"
          ? 401
          : error.code === "rate_limited"
            ? 429
            : 400;

      return data(
        { error: { code: error.code, message: error.message } },
        { status },
      );
    }

    logger.error({ shop_id: shopId, err: error }, "Printify connection failed");

    return data(
      {
        error: {
          code: "printify_unavailable",
          message:
            "We couldn’t validate the Printify token. Please try again soon.",
        },
      },
      { status: 500 },
    );
  }
};

export default function PrintifySetup() {
  const { integration } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const setupHref = `/app${embeddedSearch}`;
  const isSubmitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "printify_connect";
  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Printify connected."
      : null;

  return (
    <s-page heading="Printify setup">
      <s-section heading="Connect Printify">
        <s-stack direction="block" gap="base">
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
          {integration ? (
            <s-banner tone="success">
              <s-text>Connected</s-text>
            </s-banner>
          ) : (
            <s-banner tone="warning">
              <s-text>Not connected</s-text>
            </s-banner>
          )}
          {integration ? (
            <s-stack direction="block" gap="small">
              <s-paragraph>
                Shop: {integration.printifyShopTitle} (ID:{" "}
                {integration.printifyShopId})
              </s-paragraph>
              {integration.printifySalesChannel ? (
                <s-paragraph>
                  Sales channel: {integration.printifySalesChannel}
                </s-paragraph>
              ) : null}
            </s-stack>
          ) : null}
          <s-paragraph>
            Paste a Printify API token to connect your account. We’ll store it
            securely and use it to validate your Printify shop connection.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="printify_connect" />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Printify API token"
                name="printify_api_token"
                placeholder="Enter your token"
                disabled={isSubmitting}
              />
              <s-button
                type="submit"
                variant="primary"
                {...(isSubmitting ? { loading: true } : {})}
              >
                Connect Printify
              </s-button>
            </s-stack>
          </Form>
          <Link to={setupHref}>Back to setup</Link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
