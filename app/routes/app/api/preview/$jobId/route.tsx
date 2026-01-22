import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

import { authenticate } from "../../../../../shopify.server";
import { getShopIdFromSession } from "../../../../../lib/tenancy";
import { getMerchantPreviewByJobId } from "../../../../../services/merchant-previews/merchant-previews.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const jobId = params.jobId ? decodeURIComponent(params.jobId) : null;

  if (!jobId) {
    return data(
      {
        error: {
          code: "missing_job_id",
          message: "Preview job ID is required.",
        },
      },
      { status: 400 },
    );
  }

  const preview = await getMerchantPreviewByJobId(shopId, jobId);
  if (!preview) {
    return data(
      {
        error: {
          code: "not_found",
          message: "Preview job not found.",
        },
      },
      { status: 404 },
    );
  }

  return data({
    preview: {
      jobId: preview.jobId,
      status:
        preview.status === "creating_mockups"
          ? "Creating Mockups"
          : preview.status === "generating"
            ? "Generating"
            : preview.status === "queued"
              ? "Queued"
              : preview.status === "done"
                ? "Done"
                : "Failed",
      designUrl: preview.designUrl,
      mockupUrls: preview.mockupUrls,
      errorMessage: preview.errorMessage,
    },
  });
};

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store",
});
