import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

import { authenticate } from "../../../../../../shopify.server";
import { getShopIdFromSession } from "../../../../../../lib/tenancy";
import {
  retrieveAssetForFulfillment,
  AssetResolutionError,
} from "../../../../../../services/fulfillment/asset-resolution.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const personalizationId = params.personalizationId
    ? decodeURIComponent(params.personalizationId)
    : null;

  if (!personalizationId) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "personalizationId is required",
        },
      },
      { status: 400 },
    );
  }

  if (!shopId) {
    return data(
      {
        error: {
          code: "unauthorized",
          message: "Authentication required",
        },
      },
      { status: 401 },
    );
  }

  try {
    const asset = await retrieveAssetForFulfillment(
      shopId,
      "unknown",
      personalizationId,
    );

    return data({
      success: true,
      asset: {
        bucket: asset.bucket,
        storage_key: asset.storageKey,
        design_url: asset.designUrl,
        job_id: asset.jobId,
        template_id: asset.templateId,
        product_id: asset.productId,
        signed_url: asset.signedUrl,
        expires_at: asset.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AssetResolutionError) {
      return data(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 404 },
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return data(
      {
        error: {
          code: "internal_error",
          message: "An unexpected error occurred",
          details: message,
        },
      },
      { status: 500 },
    );
  }
};

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store",
});
