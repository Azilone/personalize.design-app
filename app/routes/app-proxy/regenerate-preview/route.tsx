import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import {
  regeneratePreviewRequestSchema,
  type RegeneratePreviewResponse,
} from "../../../schemas/app_proxy";
import { inngest } from "../../../services/inngest/client.server";
import {
  previewFakeGeneratePayloadSchema,
  previewGeneratePayloadSchema,
} from "../../../services/inngest/types";
import {
  createPreviewJob,
  getPreviewJobById,
} from "../../../services/previews/preview-jobs.server";
import { checkAndIncrementGenerationAttempt } from "../../../services/previews/generation-limits.server";
import { getTemplate } from "../../../services/templates/templates.server";
import {
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "../../../lib/generation-settings";
import { usdToMills } from "../../../services/shopify/billing-guardrails";
import { checkBillableActionAllowed } from "../../../services/shopify/billing-guardrails.server";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";

const normalizeProductId = (value: string): string => {
  if (value.startsWith("gid://shopify/Product/")) {
    return value;
  }
  if (/^\d+$/.test(value)) {
    return `gid://shopify/Product/${value}`;
  }
  return value;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const formData = await request.formData();
  const formDataObj: Record<string, FormDataEntryValue> = {};
  formData.forEach((value, key) => {
    formDataObj[key] = value;
  });
  const parsed = regeneratePreviewRequestSchema.safeParse(formDataObj);

  const isDev = process.env.NODE_ENV === "development";

  if (!parsed.success) {
    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Invalid request.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const {
    shop_id,
    product_id,
    template_id,
    session_id,
    previous_job_id,
    fake_generation,
  } = parsed.data;
  const appProxyShop = url.searchParams.get("shop");
  const shopId = appProxyShop || shop_id;
  const normalizedProductId = normalizeProductId(product_id);
  const shouldFakeGenerate = isDev && fake_generation;

  if (fake_generation && !isDev) {
    logger.error(
      { mode: "buyer_preview", env: process.env.NODE_ENV },
      "Fake buyer preview requested outside development",
    );
    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Fake preview generation is only available in development.",
        },
      },
      { status: 400 },
    );
  }

  // Get template for cost calculation
  const template = await getTemplate(template_id, shopId);
  const costUsd =
    MVP_PRICE_USD_PER_GENERATION +
    (template?.removeBackgroundEnabled ? REMOVE_BG_PRICE_USD : 0);

  const billingCheck = await checkBillableActionAllowed({
    shopId,
    costMills: usdToMills(costUsd),
  });

  if (!billingCheck.allowed) {
    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "billing_blocked",
          message: billingCheck.message,
          details: {
            reason: [billingCheck.code],
          },
        },
      },
      { status: 402 },
    );
  }

  // Get the previous job to reuse inputs
  const previousJob = await getPreviewJobById(shopId, previous_job_id);
  if (!previousJob) {
    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "not_found",
          message: "Previous preview job not found.",
        },
      },
      { status: 404 },
    );
  }

  // Verify the previous job belongs to this product/template
  // Note: session_id check is optional since older jobs may not have session_id stored
  if (
    previousJob.productId !== normalizedProductId ||
    previousJob.templateId !== template_id
  ) {
    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Previous job does not match current product or template.",
        },
      },
      { status: 400 },
    );
  }

  const jobId = session_id;

  try {
    const limitCheck = await checkAndIncrementGenerationAttempt({
      shopId,
      sessionId: session_id,
      productId: normalizedProductId,
    });

    if (!limitCheck.allowed) {
      captureEvent("regeneration.blocked", {
        shop_id: shopId,
        product_id: normalizedProductId,
        template_id: template_id,
        session_id: session_id,
        reason: limitCheck.reason,
        per_product_tries_remaining: limitCheck.per_product_tries_remaining,
        per_session_tries_remaining: limitCheck.per_session_tries_remaining,
      });

      logger.info(
        {
          shop_id: shopId,
          product_id: normalizedProductId,
          template_id: template_id,
          session_id: session_id,
          reason: limitCheck.reason,
        },
        "Regeneration blocked by limits",
      );

      return data<RegeneratePreviewResponse>(
        {
          error: {
            code: "limit_exceeded",
            message: limitCheck.message || "Generation limit exceeded.",
            details: {
              reason: [limitCheck.reason || "unknown"],
              tries_remaining: [String(limitCheck.tries_remaining ?? 0)],
              reset_in_minutes: [String(limitCheck.reset_in_minutes ?? 0)],
            },
          },
        },
        { status: 429 },
      );
    }

    // Create new preview job with same inputs as previous
    await createPreviewJob({
      jobId,
      shopId,
      productId: normalizedProductId,
      templateId: template_id,
      type: "buyer",
      sessionId: session_id,
      inputImageUrl: previousJob.inputImageUrl || undefined,
      inputText: previousJob.inputText || undefined,
      variableValues: previousJob.variableValues,
      coverPrintArea: previousJob.coverPrintArea,
    });

    const basePayload = {
      job_id: jobId,
      shop_id: shopId,
      product_id: normalizedProductId,
      template_id,
      type: "buyer" as const,
      image_url: previousJob.inputImageUrl || "",
      text_input: previousJob.inputText || undefined,
      variable_values: previousJob.variableValues,
      session_id: session_id,
    };

    const payload = shouldFakeGenerate
      ? previewFakeGeneratePayloadSchema.parse(basePayload)
      : previewGeneratePayloadSchema.parse(basePayload);

    await inngest.send({
      name: shouldFakeGenerate
        ? "previews.fake_generate.requested"
        : "previews.generate.requested",
      data: payload,
    });

    captureEvent("regeneration.started", {
      shop_id: shopId,
      product_id: normalizedProductId,
      template_id: template_id,
      session_id: session_id,
      previous_job_id: previous_job_id,
      tries_remaining: limitCheck.tries_remaining,
      cost_usd: costUsd,
    });

    logger.info(
      {
        shop_id: shopId,
        product_id: normalizedProductId,
        template_id: template_id,
        session_id: session_id,
        job_id: jobId,
        previous_job_id: previous_job_id,
        tries_remaining: limitCheck.tries_remaining,
      },
      "Queued buyer preview regeneration",
    );

    return data<RegeneratePreviewResponse>({
      data: {
        job_id: jobId,
        status: "pending",
        tries_remaining: limitCheck.tries_remaining,
        per_product_tries_remaining: limitCheck.per_product_tries_remaining,
        per_session_tries_remaining: limitCheck.per_session_tries_remaining,
        reset_at: limitCheck.reset_at?.toISOString(),
        reset_in_minutes: limitCheck.reset_in_minutes,
        cost_usd: costUsd,
      },
    });
  } catch (error) {
    logger.error(
      {
        shop_id: shopId,
        product_id: normalizedProductId,
        template_id,
        err: error,
      },
      "Failed to queue buyer preview regeneration",
    );

    return data<RegeneratePreviewResponse>(
      {
        error: {
          code: "generation_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to queue preview regeneration.",
        },
      },
      { status: 500 },
    );
  }
};
