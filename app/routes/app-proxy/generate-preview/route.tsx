import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import {
  generatePreviewRequestSchema,
  type GeneratePreviewResponse,
} from "../../../schemas/app_proxy";
import {
  StorageError,
  getFileExtension,
  uploadFileAndGetReadUrl,
  validateFileSize,
  validateFileType,
} from "../../../services/supabase/storage";
import { inngest } from "../../../services/inngest/client.server";
import {
  previewFakeGeneratePayloadSchema,
  previewGeneratePayloadSchema,
} from "../../../services/inngest/types";
import { createPreviewJob } from "../../../services/previews/preview-jobs.server";
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

const DEV_PLACEHOLDER_PREVIEW_URL =
  "https://placehold.co/600x400.png?text=600x400";

const parseVariableValues = (value?: string | null): Record<string, string> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, entry]) => [
        key,
        typeof entry === "string" ? entry : String(entry ?? ""),
      ]),
    );
  } catch {
    return {};
  }
};

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
  const parsed = generatePreviewRequestSchema.safeParse(
    Object.fromEntries(formData),
  );

  const isDev = process.env.NODE_ENV === "development";

  if (!parsed.success) {
    return data<GeneratePreviewResponse>(
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
    variant_id,
    template_id,
    session_id,
    image_file,
    text_input,
    variable_values_json,
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
    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Fake preview generation is only available in development.",
        },
      },
      { status: 400 },
    );
  }

  if (image_file.size === 0) {
    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Image file is required.",
        },
      },
      { status: 400 },
    );
  }

  const template = await getTemplate(template_id, shopId);
  const costUsd =
    MVP_PRICE_USD_PER_GENERATION +
    (template?.removeBackgroundEnabled ? REMOVE_BG_PRICE_USD : 0);

  const billingCheck = await checkBillableActionAllowed({
    shopId,
    costMills: usdToMills(costUsd),
  });

  if (!billingCheck.allowed) {
    return data<GeneratePreviewResponse>(
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

  try {
    const extension = getFileExtension(image_file.name);
    validateFileType(extension);
    validateFileSize(image_file.size);
  } catch (error) {
    const message =
      error instanceof StorageError ? error.message : "Image file is invalid.";
    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message,
        },
      },
      { status: 400 },
    );
  }

  let uploadResult;
  if (shouldFakeGenerate) {
    uploadResult = { readUrl: DEV_PLACEHOLDER_PREVIEW_URL };
  } else {
    try {
      uploadResult = await uploadFileAndGetReadUrl(
        shopId,
        image_file.name,
        image_file.size,
        Buffer.from(await image_file.arrayBuffer()),
        image_file.type || "application/octet-stream",
      );
    } catch (error) {
      return data<GeneratePreviewResponse>(
        {
          error: {
            code: error instanceof StorageError ? error.code : "upload_failed",
            message:
              error instanceof Error
                ? error.message
                : "Unable to upload preview image.",
          },
        },
        { status: 400 },
      );
    }
  }

  const jobId = crypto.randomUUID();

  try {
    const variableValues = parseVariableValues(variable_values_json);

    const limitCheck = await checkAndIncrementGenerationAttempt({
      shopId,
      sessionId: session_id,
      productId: normalizedProductId,
    });

    if (!limitCheck.allowed) {
      captureEvent("generation.blocked", {
        shop_id: shopId,
        product_id: normalizedProductId,
        template_id: template_id,
        session_id: session_id,
        reason: limitCheck.reason,
      });

      logger.info(
        {
          shop_id: shopId,
          product_id: normalizedProductId,
          template_id: template_id,
          session_id: session_id,
          reason: limitCheck.reason,
        },
        "Generation blocked by limits",
      );

      return data<GeneratePreviewResponse>(
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

    await createPreviewJob({
      jobId,
      shopId,
      productId: normalizedProductId,
      variantId: variant_id,
      templateId: template_id,
      type: "buyer",
      sessionId: session_id,
      inputImageUrl: uploadResult.readUrl,
      inputText: text_input || undefined,
      variableValues,
      coverPrintArea: template?.coverPrintArea ?? false,
    });

    const basePayload = {
      job_id: jobId,
      shop_id: shopId,
      product_id: normalizedProductId,
      variant_id,
      template_id,
      type: "buyer" as const,
      image_url: uploadResult.readUrl,
      text_input: text_input || undefined,
      variable_values: variableValues,
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

    captureEvent("generation.started", {
      shop_id: shopId,
      product_id: normalizedProductId,
      template_id: template_id,
      session_id: session_id,
      tries_remaining: limitCheck.tries_remaining,
      cost_usd: costUsd,
    });

    logger.info(
      {
        shop_id: shopId,
        product_id,
        template_id,
        job_id: jobId,
        tries_remaining: limitCheck.tries_remaining,
      },
      "Queued buyer preview generation",
    );

    return data<GeneratePreviewResponse>({
      data: {
        job_id: jobId,
        status: "pending",
      },
    });
  } catch (error) {
    logger.error(
      { shop_id: shopId, product_id, template_id, err: error },
      "Failed to queue buyer preview generation",
    );

    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "generation_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to queue preview generation.",
        },
      },
      { status: 500 },
    );
  }
};
