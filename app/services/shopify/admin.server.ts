import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { apiVersion, sessionStorage } from "../../shopify.server";

export type ShopifyAdminGraphql = Pick<AdminApiContext, "graphql">;

export const getOfflineShopifyAdmin = async (
  shopId: string,
): Promise<ShopifyAdminGraphql> => {
  const session = await sessionStorage.loadSession(`offline_${shopId}`);

  const accessToken = session?.accessToken;

  if (!accessToken) {
    throw new Error(`Missing Shopify offline session for ${shopId}`);
  }

  const endpoint = `https://${shopId}/admin/api/${apiVersion}/graphql.json`;

  const graphql: ShopifyAdminGraphql["graphql"] = async (query, options) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: typeof query === "string" ? query : query.toString(),
        variables: options?.variables ?? null,
      }),
    });

    return response;
  };

  return { graphql };
};
