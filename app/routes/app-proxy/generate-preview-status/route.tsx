import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import type { GeneratePreviewStatusResponse } from "../../../schemas/app_proxy";
import { getBuyerPreviewJobById } from "../../../services/buyer-previews/buyer-previews.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  const shopId = url.searchParams.get("shop_id") ?? "";

  if (!jobId || !shopId) {
    return data<GeneratePreviewStatusResponse>(
      {
        error: {
          code: "invalid_request",
          message: "job_id and shop_id are required.",
        },
      },
      { status: 400 },
    );
  }

  const job = await getBuyerPreviewJobById(shopId, jobId);
  if (!job) {
    return data<GeneratePreviewStatusResponse>(
      {
        error: {
          code: "not_found",
          message: "Preview job not found.",
        },
      },
      { status: 404 },
    );
  }

  return data<GeneratePreviewStatusResponse>({
    data: {
      job_id: job.id,
      status: job.status,
      preview_url: job.previewUrl ?? undefined,
      error: job.errorMessage ?? undefined,
    },
  });
};
