import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import prisma from "../../../../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  // Decode the URL-encoded productId (handles gid://shopify/Product/... format)
  const productId = params.productId
    ? decodeURIComponent(params.productId)
    : null;

  // HIGH-4 FIX: Return proper error envelope instead of plain text Response
  if (!productId) {
    return data(
      {
        error: {
          code: "missing_product_id",
          message: "Product ID is required.",
        },
      },
      { status: 400 },
    );
  }

  // MED-3 FIX: Verify the product belongs to this shop (tenant scoping)
  const shopProduct = await prisma.shopProduct.findUnique({
    where: {
      shop_id_product_id: {
        shop_id: shopId,
        product_id: productId,
      },
    },
    select: {
      product_id: true,
      title: true,
      handle: true,
    },
  });

  if (!shopProduct) {
    return data(
      {
        error: {
          code: "product_not_found",
          message: "Product not found or does not belong to this shop.",
        },
      },
      { status: 404 },
    );
  }

  return {
    productId: shopProduct.product_id,
    productTitle: shopProduct.title,
    productHandle: shopProduct.handle,
    shopId,
  };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

type LoaderData =
  | {
      productId: string;
      productTitle: string;
      productHandle: string;
      shopId: string;
    }
  | { error: { code: string; message: string } };

export default function ProductConfigPlaceholder() {
  const loaderData = useLoaderData<typeof loader>() as LoaderData;
  const app = useAppBridge();
  const embeddedSearch = app?.config
    ? buildEmbeddedSearch(`?shop=${app.config.shop}&host=${app.config.host}`)
    : "";

  // Handle error state
  if ("error" in loaderData) {
    return (
      <s-page heading="Product configuration">
        <s-section heading="Error">
          <s-stack direction="block" gap="base">
            <s-banner tone="critical">
              <s-text>{loaderData.error.message}</s-text>
            </s-banner>
            <s-button
              variant="secondary"
              onClick={() => {
                window.open(`/app/products${embeddedSearch}`, "_top");
              }}
            >
              Back to products
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const { productId, productTitle } = loaderData;

  return (
    <s-page heading="Product configuration">
      <s-section heading="Coming soon">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Product configuration is coming in the next story. You selected:
          </s-paragraph>
          <s-banner tone="info">
            <s-text>
              <strong>{productTitle}</strong> ({productId})
            </s-text>
          </s-banner>
          <s-button
            variant="secondary"
            onClick={() => {
              window.open(`/app/products${embeddedSearch}`, "_top");
            }}
          >
            Back to products
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}
