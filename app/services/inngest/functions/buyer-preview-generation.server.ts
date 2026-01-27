import { NonRetriableError } from "inngest";
import { BillableEventType } from "@prisma/client";
import prisma from "../../../db.server";
import { inngest } from "../client.server";
import {
  buyerPreviewGeneratePayloadSchema,
  type BuyerPreviewGeneratePayload,
} from "../types";
import { generateImages } from "../../fal/generate.server";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "../../../lib/generation-settings";
import logger from "../../../lib/logger";
import { usdToMills } from "../../shopify/billing-guardrails";
import { checkBillableActionAllowed } from "../../shopify/billing-guardrails.server";
import {
  buildBillableEventIdempotencyKey,
  confirmAndCharge,
  createBillableEvent,
  failBillableEvent,
  getBillableEventByIdempotencyKey,
} from "../../shopify/billable-events.server";
import { getTemplate } from "../../templates/templates.server";
import { calculateFalImageSize } from "../../fal/image-size.server";
import { getPrintifyProductDetails } from "../../printify/product-details.server";
import { getPrintifyVariantPrintArea } from "../../printify/print-area.server";
import { uploadFileAndGetReadUrl } from "../../supabase/storage";
import { updateBuyerPreviewJob } from "../../buyer-previews/buyer-previews.server";
import { captureEvent } from "../../../lib/posthog.server";
import { applyPromptVariableValues } from "../../../lib/prompt-variables";

const DEV_PLACEHOLDER_PREVIEW_URL =
  "https://placehold.co/600x400?text=Hello+World";

const selectPreviewVariant = (
  variants: Array<{ id: number; price: number; isEnabled: boolean }>,
) => {
  return variants.find((variant) => variant.isEnabled) ?? variants[0];
};

const buildPrompt = (
  templatePrompt: string,
  variableValues: Record<string, string>,
  textInput?: string | null,
  allowTextInput?: boolean,
): string => {
  const rendered = applyPromptVariableValues(templatePrompt, variableValues);
  if (allowTextInput && textInput?.trim()) {
    return `${rendered}\n\nCustom text: ${textInput.trim()}`.trim();
  }
  return rendered.trim();
};

const resolveImageFilename = (
  url: string,
  fallback = "preview.png",
): string => {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop();
    if (last && last.includes(".")) {
      return last;
    }
  } catch {
    // ignore
  }
  return fallback;
};

const resolveContentType = (value: string | null): string => {
  if (value && value.includes("image/")) {
    return value;
  }
  return "image/png";
};

export const buyerPreviewFakeGenerate = inngest.createFunction(
  {
    id: "buyer_preview_fake_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "buyer_previews.fake_generate.requested" },
  async ({ event, step }) => {
    const parsed = buyerPreviewGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid buyer preview fake payload",
      );
      throw new NonRetriableError("Invalid buyer preview fake payload");
    }

    const payload: BuyerPreviewGeneratePayload = parsed.data;

    const template = await step.run("load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      await step.run("mark-preview-failed-no-prompt", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Template prompt is missing.",
        }),
      );

      throw new NonRetriableError("Template prompt is missing.");
    }

    const shopProduct = await step.run("load-shop-product", async () =>
      prisma.shopProduct.findUnique({
        where: {
          shop_id_product_id: {
            shop_id: payload.shop_id,
            product_id: payload.product_id,
          },
        },
        select: { printify_product_id: true },
      }),
    );

    const printifyProductId = shopProduct?.printify_product_id;
    if (!printifyProductId) {
      await step.run("mark-preview-failed-no-printify-link", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Printify product is not linked to this product.",
        }),
      );

      throw new NonRetriableError("Printify product not linked.");
    }

    const printifyProduct = await step.run("fetch-printify-product", async () =>
      getPrintifyProductDetails(payload.shop_id, printifyProductId),
    );

    const previewVariant = selectPreviewVariant(printifyProduct.variants);
    if (!previewVariant) {
      await step.run("mark-preview-failed-no-variants", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "No Printify variants available for preview.",
        }),
      );

      throw new NonRetriableError("No Printify variants available.");
    }

    const printAreaDimensions = await step.run("fetch-print-area", async () =>
      getPrintifyVariantPrintArea({
        shopId: payload.shop_id,
        blueprintId: printifyProduct.blueprintId,
        printProviderId: printifyProduct.printProviderId,
        variantId: previewVariant.id,
      }),
    );

    calculateFalImageSize({
      coverPrintArea: false,
      templateAspectRatio: template.aspectRatio,
      printAreaDimensions,
    });

    const generationPrompt = buildPrompt(
      template.prompt,
      payload.variable_values,
      payload.text_input,
      template.textInputEnabled,
    );

    if (!generationPrompt.trim()) {
      await step.run("mark-preview-failed-empty-prompt", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Generation prompt is empty.",
        }),
      );

      throw new NonRetriableError("Generation prompt is empty.");
    }

    await step.run("mark-generating", async () =>
      updateBuyerPreviewJob({
        jobId: payload.buyer_session_id,
        shopId: payload.shop_id,
        status: "processing",
      }),
    );

    await step.run("mark-preview-done", async () =>
      updateBuyerPreviewJob({
        jobId: payload.buyer_session_id,
        shopId: payload.shop_id,
        status: "succeeded",
        previewUrl: DEV_PLACEHOLDER_PREVIEW_URL,
        errorMessage: null,
      }),
    );

    logger.info(
      {
        shop_id: payload.shop_id,
        job_id: payload.buyer_session_id,
        fake_generation: true,
      },
      "Buyer preview fake generation completed",
    );

    return {
      job_id: payload.buyer_session_id,
      preview_url: DEV_PLACEHOLDER_PREVIEW_URL,
    };
  },
);

export const buyerPreviewGenerate = inngest.createFunction(
  {
    id: "buyer_preview_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "buyer_previews.generate.requested" },
  async ({ event, step }) => {
    const parsed = buyerPreviewGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid buyer preview payload",
      );
      throw new NonRetriableError("Invalid buyer preview payload");
    }

    const payload: BuyerPreviewGeneratePayload = parsed.data;
    const usageIdempotencyId = event.id ?? payload.buyer_session_id;

    const template = await step.run("load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      await step.run("mark-preview-failed-no-prompt", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Template prompt is missing.",
        }),
      );

      throw new NonRetriableError("Template prompt is missing.");
    }

    const shopProduct = await step.run("load-shop-product", async () =>
      prisma.shopProduct.findUnique({
        where: {
          shop_id_product_id: {
            shop_id: payload.shop_id,
            product_id: payload.product_id,
          },
        },
        select: { printify_product_id: true },
      }),
    );

    const printifyProductId = shopProduct?.printify_product_id;
    if (!printifyProductId) {
      await step.run("mark-preview-failed-no-printify-link", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Printify product is not linked to this product.",
        }),
      );

      throw new NonRetriableError("Printify product not linked.");
    }

    const printifyProduct = await step.run("fetch-printify-product", async () =>
      getPrintifyProductDetails(payload.shop_id, printifyProductId),
    );

    const previewVariant = selectPreviewVariant(printifyProduct.variants);
    if (!previewVariant) {
      await step.run("mark-preview-failed-no-variants", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "No Printify variants available for preview.",
        }),
      );

      throw new NonRetriableError("No Printify variants available.");
    }

    const printAreaDimensions = await step.run("fetch-print-area", async () =>
      getPrintifyVariantPrintArea({
        shopId: payload.shop_id,
        blueprintId: printifyProduct.blueprintId,
        printProviderId: printifyProduct.printProviderId,
        variantId: previewVariant.id,
      }),
    );

    const imageSize = calculateFalImageSize({
      coverPrintArea: false,
      templateAspectRatio: template.aspectRatio,
      printAreaDimensions,
    });

    const generationPrompt = buildPrompt(
      template.prompt,
      payload.variable_values,
      payload.text_input,
      template.textInputEnabled,
    );

    if (!generationPrompt.trim()) {
      await step.run("mark-preview-failed-empty-prompt", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "Generation prompt is empty.",
        }),
      );

      throw new NonRetriableError("Generation prompt is empty.");
    }

    const estimatedCostUsd =
      MVP_PRICE_USD_PER_GENERATION +
      (template.removeBackgroundEnabled ? REMOVE_BG_PRICE_USD : 0);

    await step.run("check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedCostUsd),
      });

      if (!check.allowed) {
        await updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: check.message,
        });
        throw new NonRetriableError(check.message);
      }
    });

    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      "buyer_preview_generation",
      usageIdempotencyId,
    );

    await step.run("create-billable-event", async () =>
      createBillableEvent({
        shopId: payload.shop_id,
        eventType: BillableEventType.generation,
        amountMills: usdToMills(estimatedCostUsd),
        idempotencyKey: billableEventIdempotencyKey,
        description: "buyer_preview_generation",
        sourceId: payload.buyer_session_id,
      }),
    );

    await step.run("mark-generating", async () =>
      updateBuyerPreviewJob({
        jobId: payload.buyer_session_id,
        shopId: payload.shop_id,
        status: "processing",
      }),
    );

    captureEvent("generation.started", {
      shop_id: payload.shop_id,
      job_id: payload.buyer_session_id,
      template_id: payload.template_id,
      product_id: payload.product_id,
    });

    const generationStart = Date.now();
    const generationResult = await step.run("generate-images", async () =>
      generateImages({
        modelId: template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID,
        imageUrls: [payload.image_url],
        prompt: generationPrompt,
        numImages: 1,
        imageSize,
        shopId: payload.shop_id,
        removeBackgroundEnabled: template.removeBackgroundEnabled,
      }),
    );
    const generationDurationMs = Date.now() - generationStart;

    const designUrl = generationResult.images[0]?.url;
    if (!designUrl) {
      await step.run("mark-preview-failed-no-design", async () =>
        updateBuyerPreviewJob({
          jobId: payload.buyer_session_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "No design was generated.",
        }),
      );

      throw new NonRetriableError("No design generated.");
    }

    const storedImage = await step.run("store-generated-image", async () => {
      const response = await fetch(designUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch generated image (${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const filename = resolveImageFilename(
        designUrl,
        `preview-${payload.buyer_session_id}.png`,
      );
      const contentType = resolveContentType(
        response.headers.get("content-type"),
      );

      return uploadFileAndGetReadUrl(
        payload.shop_id,
        filename,
        arrayBuffer.byteLength,
        Buffer.from(arrayBuffer),
        contentType,
      );
    });

    await step.run("confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: generationResult.totalCostUsd,
        description: "buyer_preview_generation",
      }),
    );

    await step.run("mark-preview-done", async () =>
      updateBuyerPreviewJob({
        jobId: payload.buyer_session_id,
        shopId: payload.shop_id,
        status: "succeeded",
        previewUrl: storedImage.readUrl,
        errorMessage: null,
      }),
    );

    captureEvent("generation.succeeded", {
      shop_id: payload.shop_id,
      job_id: payload.buyer_session_id,
      template_id: payload.template_id,
      product_id: payload.product_id,
      duration_ms: generationDurationMs,
    });

    logger.info(
      {
        shop_id: payload.shop_id,
        job_id: payload.buyer_session_id,
        duration_ms: generationDurationMs,
      },
      "Buyer preview generation completed",
    );

    return {
      job_id: payload.buyer_session_id,
      preview_url: storedImage.readUrl,
    };
  },
);

export const buyerPreviewGenerateFailure = inngest.createFunction(
  { id: "buyer_preview_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    const isPreviewGenerate =
      event.data.function_id === "buyer_preview_generate";

    if (!isPreviewGenerate) {
      return { ignored: true };
    }

    const payload = buyerPreviewGeneratePayloadSchema.safeParse(
      event.data.event.data,
    );

    if (!payload.success) {
      logger.warn(
        { errors: payload.error.flatten().fieldErrors },
        "Missing payload data for buyer preview failure",
      );
      return { skipped: true };
    }

    await step.run("mark-preview-failed", async () =>
      updateBuyerPreviewJob({
        jobId: payload.data.buyer_session_id,
        shopId: payload.data.shop_id,
        status: "failed",
        errorMessage: event.data.error?.message ?? "Preview generation failed.",
      }),
    );

    const usageIdempotencyId =
      event.data.event.id ?? payload.data.buyer_session_id;
    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      "buyer_preview_generation",
      usageIdempotencyId,
    );
    const existingEvent = await getBillableEventByIdempotencyKey(
      payload.data.shop_id,
      billableEventIdempotencyKey,
    );

    if (existingEvent) {
      const failedStep = event.data.step?.name;
      const providerCostMayBeIncurred =
        failedStep === "generate-images" ||
        failedStep === "store-generated-image" ||
        failedStep === "confirm-billable-event-and-charge" ||
        failedStep === "mark-preview-done";

      await step.run("fail-billable-event", async () =>
        failBillableEvent({
          shopId: payload.data.shop_id,
          idempotencyKey: billableEventIdempotencyKey,
          errorMessage: event.data.error?.message,
          waived: providerCostMayBeIncurred,
        }),
      );
    }

    captureEvent("generation.failed", {
      shop_id: payload.data.shop_id,
      job_id: payload.data.buyer_session_id,
      template_id: payload.data.template_id,
      product_id: payload.data.product_id,
    });

    logger.error(
      {
        shop_id: payload.data.shop_id,
        job_id: payload.data.buyer_session_id,
        error: event.data.error?.message,
      },
      "Buyer preview generation failed",
    );

    return { recovered: true };
  },
);

export const inngestFunctions = [
  buyerPreviewFakeGenerate,
  buyerPreviewGenerate,
  buyerPreviewGenerateFailure,
];
