import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

import { authenticate } from "../../../../../shopify.server";
import { getShopIdFromSession } from "../../../../../lib/tenancy";
import { getPreviewJobById } from "../../../../../services/previews/preview-jobs.server";
import { createSignedReadUrl } from "../../../../../services/supabase/storage";

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

  const preview = await getPreviewJobById(shopId, jobId);
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

  let designUrl = preview.designUrl;
  if (preview.designStorageKey) {
    try {
      const signed = await createSignedReadUrl(preview.designStorageKey);
      designUrl = signed.readUrl;
    } catch {
      // keep last stored URL if signing fails
    }
  }

  const status =
    preview.status === "creating_mockups"
      ? "Creating Mockups"
      : preview.status === "generating"
        ? "Generating"
        : preview.status === "queued"
          ? "Queued"
          : preview.status === "processing"
            ? "Processing"
            : preview.status === "done"
              ? "Done"
              : "Failed";

  return data({
    preview: {
      jobId: preview.jobId,
      status,
      designUrl,
      mockupUrls: preview.mockupUrls,
      errorMessage: preview.errorMessage,
    },
  });
};

export const headers: HeadersFunction = () => ({
  "Cache-Control": "no-store",
});
