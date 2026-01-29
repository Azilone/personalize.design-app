import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import { inngest } from "../../../services/inngest/client.server";
import { getPreviewJobById } from "../../../services/previews/preview-jobs.server";
import { generateMockups } from "../../../services/previews/mockup-generation.server";
import { deleteProduct } from "../../../services/printify/temp-product.server";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id") ?? "";
  const shopId =
    url.searchParams.get("shop_id") ?? url.searchParams.get("shop") ?? "";

  if (!jobId || !shopId) {
    return data(
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

  // Only allow retry if mockups failed or if we're in a retryable state
  // Allow retry when status is "done" (mockups may need regeneration)
  // or "mockups_failed" (previous attempt failed)
  if (
    job.status !== "mockups_failed" &&
    job.status !== "done" &&
    job.status !== "creating_mockups"
  ) {
    return data(
      {
        error: {
          code: "invalid_state",
          message: "Mockups cannot be retried in current state.",
        },
      },
      { status: 400 },
    );
  }

  if (!job.designUrl) {
    return data(
      {
        error: {
          code: "invalid_state",
          message: "Design URL is missing.",
        },
      },
      { status: 400 },
    );
  }

  // Send event to trigger mockup regeneration
  await inngest.send({
    name: "previews.mockups.retry",
    data: {
      job_id: jobId,
      shop_id: shopId,
      design_url: job.designUrl,
      design_storage_key: job.designStorageKey,
    },
  });

  captureEvent("mockups.retry_requested", {
    shop_id: shopId,
    job_id: jobId,
  });

  logger.info({ shop_id: shopId, job_id: jobId }, "Mockup retry requested");

  return data({
    data: {
      job_id: jobId,
      status: "retry_queued",
    },
  });
};
