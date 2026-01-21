import type { ShopifyAdminGraphql } from "./admin.server";

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  imageAlt: string | null;
  printifyProductId: string | null;
  printifyShopId: string | null;
};

export type ShopifyProductPage = {
  products: ShopifyProduct[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

type ListProductsInput = {
  admin: ShopifyAdminGraphql;
  after?: string | null;
};

export const listShopifyProducts = async (
  input: ListProductsInput,
): Promise<ShopifyProductPage> => {
  const response = await input.admin.graphql(
    `#graphql
      query listProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            cursor
            node {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              metafields(first: 2, namespace: "personalize_design") {
                edges {
                  node {
                    key
                    value
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `,
    {
      variables: {
        first: 50,
        after: input.after ?? null,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch products from Shopify.");
  }

  const json = (await response.json()) as {
    data?: {
      products?: {
        edges?: Array<{
          cursor: string;
          node: {
            id: string;
            title: string;
            handle: string;
            featuredImage: { url: string; altText: string | null } | null;
            metafields?: {
              edges?: Array<{
                node: { key: string; value: string | null };
              }>;
            } | null;
          };
        }>;
        pageInfo?: {
          hasNextPage?: boolean | null;
          endCursor?: string | null;
        } | null;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    throw new Error(
      json.errors.map((error) => error.message).join(", ") ||
        "Shopify product query failed.",
    );
  }

  const edges = json.data?.products?.edges ?? [];
  const pageInfo = json.data?.products?.pageInfo;

  const products = edges.map((edge) => {
    const metafields = edge.node.metafields?.edges ?? [];
    const printifyProductId =
      metafields.find(
        (metafield) => metafield.node.key === "printify_product_id",
      )?.node.value ?? null;
    const printifyShopId =
      metafields.find((metafield) => metafield.node.key === "printify_shop_id")
        ?.node.value ?? null;

    return {
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      imageUrl: edge.node.featuredImage?.url ?? null,
      imageAlt: edge.node.featuredImage?.altText ?? null,
      printifyProductId,
      printifyShopId,
    } satisfies ShopifyProduct;
  });

  return {
    products,
    nextCursor: pageInfo?.hasNextPage ? (pageInfo?.endCursor ?? null) : null,
    hasNextPage: Boolean(pageInfo?.hasNextPage),
  };
};
