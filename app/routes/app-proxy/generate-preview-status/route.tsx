import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import type { GeneratePreviewStatusResponse } from "../../../schemas/app_proxy";
import { getBuyerPreviewJobById } from "../../../services/buyer-previews/buyer-previews.server";
import { createSignedReadUrl } from "../../../services/supabase/storage";
import logger from "../../../lib/logger";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  const shopId =
    url.searchParams.get("shop_id") ?? url.searchParams.get("shop") ?? "";

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
    logger.warn(
      { shop_id: shopId, job_id: jobId },
      "Buyer preview job not found",
    );
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

  let previewUrl = job.previewUrl ?? undefined;

  if (job.previewStorageKey) {
    try {
      const signed = await createSignedReadUrl(job.previewStorageKey);
      previewUrl = signed.readUrl;
    } catch (error) {
      logger.error(
        { shop_id: shopId, job_id: jobId, err: error },
        "Failed to create signed preview URL",
      );
      return data<GeneratePreviewStatusResponse>(
        {
          error: {
            code: "preview_unavailable",
            message: "Preview URL is unavailable. Please try again shortly.",
          },
        },
        { status: 503 },
      );
    }
  }

  return data<GeneratePreviewStatusResponse>({
    data: {
      job_id: job.id,
      status: job.status,
      preview_url: previewUrl,
      error: job.errorMessage ?? undefined,
    },
  });
};
