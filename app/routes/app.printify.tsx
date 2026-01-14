import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
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
  listPrintifyShops,
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
    const token = parsed.data.printify_api_token;
    const shops = await listPrintifyShops(token);
    const shopCount = shops.length;
    let selectedShop = shops[0];

    if (shopCount > 1) {
      if (parsed.data.printify_shop_id) {
        const matched = shops.find(
          (shop) => shop.shopId === parsed.data.printify_shop_id,
        );

        if (!matched) {
          return data(
            {
              error: {
                code: "invalid_request",
                message: "Select a valid Printify shop.",
              },
            },
            { status: 400 },
          );
        }

        selectedShop = matched;
      } else {
        return data({ needsSelection: true, shops });
      }
    }

    const encryptedToken = encryptPrintifyToken(token);

    await upsertPrintifyIntegration({
      shopId,
      encryptedToken,
      printifyShopId: selectedShop.shopId,
      printifyShopTitle: selectedShop.shopTitle,
      printifySalesChannel: selectedShop.salesChannel,
    });

    logger.info(
      { shop_id: shopId, printify_shop_id: selectedShop.shopId },
      "Printify connected",
    );

    return data({ success: true, shopCount });
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
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
  const shopCount =
    actionData &&
    typeof actionData === "object" &&
    "shopCount" in actionData &&
    typeof (actionData as { shopCount?: unknown }).shopCount === "number"
      ? (actionData as { shopCount: number }).shopCount
      : null;
  const needsSelection =
    actionData &&
    typeof actionData === "object" &&
    "needsSelection" in actionData
      ? (actionData as { needsSelection?: boolean }).needsSelection === true
      : false;
  const shopOptions =
    actionData &&
    typeof actionData === "object" &&
    "shops" in actionData &&
    Array.isArray((actionData as { shops?: unknown }).shops)
      ? (
          actionData as {
            shops: Array<{
              shopId: string;
              shopTitle: string;
              salesChannel: string | null;
            }>;
          }
        ).shops
      : null;
  const [tokenValue, setTokenValue] = useState("");

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
          {needsSelection ? (
            <s-banner tone="warning">
              <s-text>
                This token has access to multiple Printify shops. Select the one
                to connect.
              </s-text>
            </s-banner>
          ) : null}
          {shopCount && shopCount > 1 ? (
            <s-banner tone="warning">
              <s-text>
                This token has access to {shopCount} Printify shops.
              </s-text>
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
              <s-password-field
                label="Printify API token"
                name="printify_api_token"
                placeholder="Enter your token"
                autocomplete="off"
                disabled={isSubmitting}
                value={tokenValue}
                onChange={(event) => setTokenValue(event.currentTarget.value)}
                details="You can generate a token in your Printify account settings."
              ></s-password-field>
              {needsSelection && shopOptions ? (
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-choice-list label="Printify shop" name="printify_shop_id">
                    {shopOptions.map((shop, index) => (
                      <s-choice
                        key={shop.shopId}
                        value={shop.shopId}
                        selected={index === 0}
                      >
                        {shop.shopTitle} (ID: {shop.shopId})
                        {shop.salesChannel ? ` — ${shop.salesChannel}` : ""}
                      </s-choice>
                    ))}
                  </s-choice-list>
                </s-box>
              ) : null}
              <s-button type="submit" variant="primary" loading={isSubmitting}>
                {needsSelection ? "Connect selected shop" : "Connect Printify"}
              </s-button>
            </s-stack>
          </Form>
          <s-link href={setupHref}>Back to setup</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}
