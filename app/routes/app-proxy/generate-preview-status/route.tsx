import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import type { GeneratePreviewStatusResponse } from "../../../schemas/app_proxy";
import { getPreviewJobById } from "../../../services/previews/preview-jobs.server";
import { checkGenerationLimits } from "../../../services/previews/generation-limits.server";
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

  const job = await getPreviewJobById(shopId, jobId);
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

  let previewUrl = job.designUrl ?? undefined;

  if (job.designStorageKey) {
    try {
      const signed = await createSignedReadUrl(job.designStorageKey);
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

  const jobStatus = job.status as typeof job.status | "mockups_failed";

  const status =
    jobStatus === "done" ||
    jobStatus === "creating_mockups" ||
    jobStatus === "mockups_failed"
      ? "succeeded"
      : jobStatus === "failed"
        ? "failed"
        : jobStatus === "queued"
          ? "pending"
          : "processing";

  const mockupStatus: "loading" | "ready" | "error" | undefined =
    jobStatus === "creating_mockups"
      ? "loading"
      : jobStatus === "mockups_failed"
        ? "error"
        : job.mockupUrls.length > 0
          ? "ready"
          : undefined;

  // Get limit status for regeneration
  const limitCheck = await checkGenerationLimits({
    shopId,
    sessionId: job.sessionId || "",
    productId: job.productId,
  });

  return data<GeneratePreviewStatusResponse>({
    data: {
      job_id: job.jobId,
      status,
      preview_url: previewUrl,
      design_url: job.designUrl ?? undefined,
      mockup_urls: job.mockupUrls.length ? job.mockupUrls : undefined,
      mockup_status: mockupStatus,
      error: job.errorMessage ?? undefined,
      // Limit tracking fields
      tries_remaining: limitCheck.tries_remaining,
      per_product_tries_remaining: limitCheck.per_product_tries_remaining,
      per_session_tries_remaining: limitCheck.per_session_tries_remaining,
      reset_at: limitCheck.reset_at?.toISOString(),
      reset_in_minutes: limitCheck.reset_in_minutes,
      can_regenerate: limitCheck.allowed,
    },
  });
};
