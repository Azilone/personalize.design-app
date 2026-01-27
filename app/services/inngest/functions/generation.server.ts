import { NonRetriableError } from "inngest";
import { BillableEventType } from "@prisma/client";
import prisma from "../../../db.server";
import { inngest } from "../client.server";
import {
  generateImagePayloadSchema,
  generateDevFakeImagePayloadSchema,
  generateImageAndRemoveBackgroundPayloadSchema,
  mockupPrintifyPayloadSchema,
  type GenerateImagePayload,
  type GenerateDevFakeImagePayload,
  type GenerateImageAndRemoveBackgroundPayload,
  type MockupPrintifyPayload,
} from "../types";
import { generateImages } from "../../fal/generate.server";
import { removeBackground } from "../../fal/models/birefnet-v2";
import { calculateFalImageSize } from "../../fal/image-size.server";
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
import {
  getTemplate,
  recordTestGeneration,
} from "../../templates/templates.server";
import { getPrintifyProductDetails } from "../../printify/product-details.server";
import { getPrintifyVariantPrintArea } from "../../printify/print-area.server";
import {
  createTempProduct,
  deleteProduct,
} from "../../printify/temp-product.server";
import { uploadFileAndGetReadUrl } from "../../supabase/storage";
import { updateBuyerPreviewJob } from "../../buyer-previews/buyer-previews.server";
import { updateMerchantPreview } from "../../merchant-previews/merchant-previews.server";
import { captureEvent } from "../../../lib/posthog.server";
import { applyPromptVariableValues } from "../../../lib/prompt-variables";
import { buildPlaceholderUrl } from "../../../lib/placeholder-images";
import type { GenerationOutput } from "../../fal/types";

const DEV_PLACEHOLDER_PREVIEW_URL =
  "https://placehold.co/600x400?text=Hello+World";

type StepTools = {
  run: (name: string, fn: () => Promise<unknown>) => Promise<unknown>;
  sendEvent?: (
    name: string,
    options: { name: string; data: unknown },
  ) => Promise<{ ids: string[] }>;
};

const runStep = async <T>(
  step: StepTools,
  name: string,
  fn: () => Promise<T>,
): Promise<T> => (await step.run(name, fn)) as T;

const sendStepEvent = async (
  step: StepTools,
  name: string,
  options: { name: string; data: unknown },
): Promise<{ ids: string[] }> => {
  if (!step.sendEvent) {
    throw new Error("sendEvent is unavailable");
  }
  return step.sendEvent(name, options);
};

const selectPreviewVariant = (
  variants: Array<{ id: number; price: number; isEnabled: boolean }>,
) => {
  return variants.find((variant) => variant.isEnabled) ?? variants[0];
};

const resolvePreviewImageScale = (input: {
  coverPrintArea: boolean;
  imageSize: { width: number; height: number };
  printAreaDimensions: { width: number; height: number } | null;
}): number | null => {
  if (input.coverPrintArea || !input.printAreaDimensions) {
    return null;
  }

  const imageAspectRatio = input.imageSize.width / input.imageSize.height;
  const maxScaleByHeight =
    (input.printAreaDimensions.height * imageAspectRatio) /
    input.printAreaDimensions.width;

  return Math.min(1, maxScaleByHeight);
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

const mapGenerationResult = (output: GenerationOutput) => {
  const generationCostUsd = output.images.reduce(
    (sum, img) => sum + (img.generationCostUsd || 0),
    0,
  );
  const removeBgCostUsd = output.images.reduce(
    (sum, img) => sum + (img.removeBgCostUsd || 0),
    0,
  );

  return {
    results: output.images.map((img) => ({
      url: img.url,
      generation_time_seconds: img.generationTimeSeconds,
      cost_usd: img.costUsd,
      generation_cost_usd: img.generationCostUsd,
      remove_bg_cost_usd: img.removeBgCostUsd,
      seed: img.seed,
    })),
    total_time_seconds: output.totalTimeSeconds,
    total_cost_usd: output.totalCostUsd,
    generation_cost_usd: generationCostUsd,
    remove_bg_cost_usd: removeBgCostUsd,
  };
};

const createFakeGenerationOutput = (
  numImages: number,
  placeholderUrl: string,
): GenerationOutput => ({
  images: Array.from({ length: numImages }, () => ({
    url: placeholderUrl,
    generationTimeSeconds: 0.5,
    costUsd: 0,
    generationCostUsd: 0,
    removeBgCostUsd: 0,
  })),
  totalTimeSeconds: 0.5,
  totalCostUsd: 0,
});

const handleBuyerPreviewGenerate = async (
  payload: Extract<GenerateImagePayload, { request_type: "buyer_preview" }>,
  eventId: string | undefined,
  step: StepTools,
) => {
  const usageIdempotencyId = eventId ?? payload.buyer_session_id;
  const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
    "buyer_preview_generation",
    usageIdempotencyId,
  );
  let providerCostMayBeIncurred = false;

  try {
    const template = await runStep(step, "load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      throw new NonRetriableError("Template prompt is missing.");
    }

    const shopProduct = await runStep(step, "load-shop-product", async () =>
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
      throw new NonRetriableError("Printify product not linked.");
    }

    const printifyProduct = await runStep(
      step,
      "fetch-printify-product",
      async () => getPrintifyProductDetails(payload.shop_id, printifyProductId),
    );

    const previewVariant = selectPreviewVariant(printifyProduct.variants);
    if (!previewVariant) {
      throw new NonRetriableError("No Printify variants available.");
    }

    const printAreaDimensions = await runStep(
      step,
      "fetch-print-area",
      async () =>
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
      throw new NonRetriableError("Generation prompt is empty.");
    }

    const estimatedCostUsd =
      MVP_PRICE_USD_PER_GENERATION +
      (template.removeBackgroundEnabled ? REMOVE_BG_PRICE_USD : 0);

    await runStep(step, "check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedCostUsd),
      });

      if (!check.allowed) {
        throw new NonRetriableError(check.message);
      }
    });

    await runStep(step, "create-billable-event", async () =>
      createBillableEvent({
        shopId: payload.shop_id,
        eventType: BillableEventType.generation,
        amountMills: usdToMills(estimatedCostUsd),
        idempotencyKey: billableEventIdempotencyKey,
        description: "buyer_preview_generation",
        sourceId: payload.buyer_session_id,
      }),
    );

    await runStep(step, "mark-generating", async () =>
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
    const generationResult = await runStep(step, "generate-images", async () =>
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
    providerCostMayBeIncurred = true;

    const designUrl = generationResult.images[0]?.url;
    if (!designUrl) {
      throw new NonRetriableError("No design was generated.");
    }

    const storedImage = await runStep(
      step,
      "store-generated-image",
      async () => {
        const response = await fetch(designUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch generated image (${response.status})`,
          );
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
      },
    );

    await runStep(step, "confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: generationResult.totalCostUsd,
        description: "buyer_preview_generation",
      }),
    );

    await runStep(step, "mark-preview-done", async () =>
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview generation failed.";

    await runStep(step, "mark-preview-failed", async () =>
      updateBuyerPreviewJob({
        jobId: payload.buyer_session_id,
        shopId: payload.shop_id,
        status: "failed",
        errorMessage: message,
      }),
    );

    const existingEvent = await getBillableEventByIdempotencyKey(
      payload.shop_id,
      billableEventIdempotencyKey,
    );

    if (existingEvent) {
      await runStep(step, "fail-billable-event", async () =>
        failBillableEvent({
          shopId: payload.shop_id,
          idempotencyKey: billableEventIdempotencyKey,
          errorMessage: message,
          waived: providerCostMayBeIncurred,
        }),
      );
    }

    captureEvent("generation.failed", {
      shop_id: payload.shop_id,
      job_id: payload.buyer_session_id,
      template_id: payload.template_id,
      product_id: payload.product_id,
    });

    logger.error(
      {
        shop_id: payload.shop_id,
        job_id: payload.buyer_session_id,
        error: message,
      },
      "Buyer preview generation failed",
    );

    throw new NonRetriableError(message);
  }
};

const handleMerchantPreviewGenerate = async (
  payload: Extract<GenerateImagePayload, { request_type: "merchant_preview" }>,
  eventId: string | undefined,
  step: StepTools,
) => {
  const usageIdempotencyId = eventId ?? payload.job_id;
  const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
    "merchant_preview_generation",
    usageIdempotencyId,
  );
  let providerCostMayBeIncurred = false;

  try {
    const template = await runStep(step, "load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      throw new NonRetriableError("Template prompt is missing.");
    }

    const shopProduct = await runStep(step, "load-shop-product", async () =>
      prisma.shopProduct.findUnique({
        where: {
          shop_id_product_id: {
            shop_id: payload.shop_id,
            product_id: payload.product_id,
          },
        },
        select: {
          printify_product_id: true,
        },
      }),
    );

    const printifyProductId = shopProduct?.printify_product_id;
    if (!printifyProductId) {
      throw new NonRetriableError("Printify product not linked.");
    }

    const printifyProduct = await runStep(
      step,
      "fetch-printify-product",
      async () => getPrintifyProductDetails(payload.shop_id, printifyProductId),
    );

    const previewVariant = selectPreviewVariant(printifyProduct.variants);
    if (!previewVariant) {
      throw new NonRetriableError("No Printify variants available.");
    }

    const printAreaDimensions = await runStep(
      step,
      "fetch-print-area",
      async () =>
        getPrintifyVariantPrintArea({
          shopId: payload.shop_id,
          blueprintId: printifyProduct.blueprintId,
          printProviderId: printifyProduct.printProviderId,
          variantId: previewVariant.id,
        }),
    );

    const imageSize = calculateFalImageSize({
      coverPrintArea: payload.cover_print_area,
      templateAspectRatio: template.aspectRatio,
      printAreaDimensions,
    });

    const safeVariableValues: Record<string, string> = {};
    for (const variable of template.variables) {
      const rawValue = payload.variable_values[variable.name];
      if (rawValue !== undefined) {
        safeVariableValues[variable.name] = rawValue;
      }
    }

    const generationPrompt = buildPrompt(
      template.prompt ?? "",
      safeVariableValues,
      payload.test_text,
      template.textInputEnabled,
    );

    if (!generationPrompt.trim()) {
      throw new NonRetriableError("Generation prompt is empty.");
    }

    const estimatedCostUsd =
      MVP_PRICE_USD_PER_GENERATION +
      (template.removeBackgroundEnabled ? REMOVE_BG_PRICE_USD : 0);

    await runStep(step, "check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedCostUsd),
      });

      if (!check.allowed) {
        throw new NonRetriableError(check.message);
      }
    });

    await runStep(step, "create-billable-event", async () =>
      createBillableEvent({
        shopId: payload.shop_id,
        eventType: BillableEventType.generation,
        amountMills: usdToMills(estimatedCostUsd),
        idempotencyKey: billableEventIdempotencyKey,
        description: "merchant_preview_generation",
        sourceId: payload.job_id,
      }),
    );

    await runStep(step, "mark-generating", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "generating",
      }),
    );

    const generationResult = await runStep(step, "generate-images", async () =>
      generateImages({
        modelId: template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID,
        imageUrls: [payload.test_image_url],
        prompt: generationPrompt,
        numImages: 1,
        imageSize,
        shopId: payload.shop_id,
        removeBackgroundEnabled: template.removeBackgroundEnabled,
      }),
    );
    providerCostMayBeIncurred = true;

    const designUrl = generationResult.images[0]?.url;
    if (!designUrl) {
      throw new NonRetriableError("No design was generated.");
    }

    await runStep(step, "confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: generationResult.totalCostUsd,
        description: "merchant_preview_generation",
      }),
    );

    await runStep(step, "mark-creating-mockups", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "creating_mockups",
        designUrl,
        errorMessage: null,
      }),
    );

    await sendStepEvent(step, "queue-printify-mockups", {
      name: "mockup.printify.requested",
      data: mockupPrintifyPayloadSchema.parse({
        job_id: payload.job_id,
        shop_id: payload.shop_id,
        product_id: payload.product_id,
        template_id: payload.template_id,
        cover_print_area: payload.cover_print_area,
        design_url: designUrl,
        fake_generation: false,
      }),
    });

    logger.info(
      {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
      },
      "Merchant preview image generated; mockups queued",
    );

    return {
      job_id: payload.job_id,
      design_url: designUrl,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Preview generation failed.";

    await runStep(step, "mark-preview-failed", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "failed",
        errorMessage: message,
      }),
    );

    const existingEvent = await getBillableEventByIdempotencyKey(
      payload.shop_id,
      billableEventIdempotencyKey,
    );

    if (existingEvent) {
      await runStep(step, "fail-billable-event", async () =>
        failBillableEvent({
          shopId: payload.shop_id,
          idempotencyKey: billableEventIdempotencyKey,
          errorMessage: message,
          waived: providerCostMayBeIncurred,
        }),
      );
    }

    logger.error(
      {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        error: message,
      },
      "Merchant preview generation failed",
    );

    throw new NonRetriableError(message);
  }
};

const handleTemplateTestGenerate = async (
  payload: Extract<GenerateImagePayload, { request_type: "template_test" }>,
  eventId: string | undefined,
  step: StepTools,
) => {
  const usageIdempotencyId =
    eventId ?? `${payload.shop_id}:${payload.template_id}`;

  const template = await runStep(step, "load-template", async () =>
    getTemplate(payload.template_id, payload.shop_id),
  );

  if (!template) {
    throw new NonRetriableError("Template not found for test generation");
  }

  const imageSize = calculateFalImageSize({
    coverPrintArea: false,
    templateAspectRatio: template.aspectRatio,
    printAreaDimensions: null,
  });

  const estimatedGenerationCostUsd =
    MVP_PRICE_USD_PER_GENERATION * payload.num_images;
  const estimatedRemoveBgCostUsd = payload.remove_background_enabled
    ? REMOVE_BG_PRICE_USD * payload.num_images
    : 0;
  const estimatedTotalCostUsd =
    estimatedGenerationCostUsd + estimatedRemoveBgCostUsd;

  await runStep(step, "check-billing-guardrails", async () => {
    const check = await checkBillableActionAllowed({
      shopId: payload.shop_id,
      costMills: usdToMills(estimatedTotalCostUsd),
    });

    if (!check.allowed) {
      throw new NonRetriableError(check.message);
    }
  });

  const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
    "template_test_generation",
    usageIdempotencyId,
  );

  await runStep(step, "create-billable-event", async () =>
    createBillableEvent({
      shopId: payload.shop_id,
      eventType: BillableEventType.generation,
      amountMills: usdToMills(estimatedGenerationCostUsd),
      idempotencyKey: billableEventIdempotencyKey,
      description: "template_test_generation",
      sourceId: payload.template_id,
    }),
  );

  const generationResult = await runStep(step, "generate-images", async () =>
    generateImages({
      modelId: payload.generation_model_identifier,
      imageUrls: [payload.test_photo_url!],
      prompt: payload.prompt,
      numImages: payload.num_images,
      imageSize,
      shopId: payload.shop_id,
      removeBackgroundEnabled: false,
    }),
  );

  if (!payload.remove_background_enabled) {
    const mappedResult = mapGenerationResult(generationResult);

    await runStep(step, "record-test-generation", async () =>
      recordTestGeneration({
        templateId: payload.template_id,
        shopId: payload.shop_id,
        numImagesRequested: payload.num_images,
        numImagesGenerated: generationResult.images.length,
        totalCostUsd: generationResult.totalCostUsd,
        totalTimeSeconds: generationResult.totalTimeSeconds,
        generationCostUsd: generationResult.images[0]?.generationCostUsd,
        removeBgCostUsd: generationResult.images[0]?.removeBgCostUsd,
        success: true,
        resultImages: mappedResult,
      }),
    );

    await runStep(step, "confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: generationResult.totalCostUsd,
        description: "template_test_generation",
      }),
    );

    logger.info(
      {
        shop_id: payload.shop_id,
        template_id: payload.template_id,
        generated_count: generationResult.images.length,
      },
      "Template test generation completed",
    );

    return mappedResult;
  }

  const nextPayload = generateImageAndRemoveBackgroundPayloadSchema.parse({
    shop_id: payload.shop_id,
    template_id: payload.template_id,
    usage_idempotency_id: usageIdempotencyId,
    num_images: payload.num_images,
    generation_total_cost_usd: generationResult.totalCostUsd,
    generation_total_time_seconds: generationResult.totalTimeSeconds,
    generated_images: generationResult.images.map((image) => ({
      url: image.url,
      generation_time_seconds: image.generationTimeSeconds,
      cost_usd: image.costUsd,
      generation_cost_usd: image.generationCostUsd ?? image.costUsd,
      seed: image.seed,
    })),
  });

  const { ids } = await sendStepEvent(step, "queue-remove-background", {
    name: "generate.image-and-remove-bg.requested",
    data: nextPayload,
  });

  logger.info(
    {
      shop_id: payload.shop_id,
      template_id: payload.template_id,
      generated_count: generationResult.images.length,
      remove_background_event_ids: ids,
    },
    "Queued background removal",
  );

  return mapGenerationResult(generationResult);
};

export const generateImage = inngest.createFunction(
  {
    id: "generate/image",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "generate.image.requested" },
  async ({ event, step }) => {
    const parsed = generateImagePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid generate image payload",
      );
      throw new NonRetriableError("Invalid generate image payload");
    }

    const payload = parsed.data;

    if (payload.request_type === "buyer_preview") {
      return handleBuyerPreviewGenerate(payload, event.id, step);
    }

    if (payload.request_type === "merchant_preview") {
      return handleMerchantPreviewGenerate(payload, event.id, step);
    }

    return handleTemplateTestGenerate(payload, event.id, step);
  },
);

const handleBuyerPreviewFakeGenerate = async (
  payload: Extract<
    GenerateDevFakeImagePayload,
    { request_type: "buyer_preview" }
  >,
  step: StepTools,
) => {
  const template = await runStep(step, "load-template", async () =>
    getTemplate(payload.template_id, payload.shop_id),
  );

  if (!template?.prompt) {
    throw new NonRetriableError("Template prompt is missing.");
  }

  const shopProduct = await runStep(step, "load-shop-product", async () =>
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
    throw new NonRetriableError("Printify product not linked.");
  }

  const printifyProduct = await runStep(
    step,
    "fetch-printify-product",
    async () => getPrintifyProductDetails(payload.shop_id, printifyProductId),
  );

  const previewVariant = selectPreviewVariant(printifyProduct.variants);
  if (!previewVariant) {
    throw new NonRetriableError("No Printify variants available.");
  }

  const printAreaDimensions = await runStep(
    step,
    "fetch-print-area",
    async () =>
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
    throw new NonRetriableError("Generation prompt is empty.");
  }

  await runStep(step, "mark-generating", async () =>
    updateBuyerPreviewJob({
      jobId: payload.buyer_session_id,
      shopId: payload.shop_id,
      status: "processing",
    }),
  );

  await runStep(step, "mark-preview-done", async () =>
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
};

const handleMerchantPreviewFakeGenerate = async (
  payload: Extract<
    GenerateDevFakeImagePayload,
    { request_type: "merchant_preview" }
  >,
  step: StepTools,
) => {
  const template = await runStep(step, "load-template", async () =>
    getTemplate(payload.template_id, payload.shop_id),
  );

  if (!template?.prompt) {
    throw new NonRetriableError("Template prompt is missing.");
  }

  await runStep(step, "mark-generating", async () =>
    updateMerchantPreview({
      jobId: payload.job_id,
      shopId: payload.shop_id,
      status: "generating",
    }),
  );

  await runStep(step, "mark-creating-mockups", async () =>
    updateMerchantPreview({
      jobId: payload.job_id,
      shopId: payload.shop_id,
      status: "creating_mockups",
    }),
  );

  await sendStepEvent(step, "queue-printify-mockups", {
    name: "mockup.printify.requested",
    data: mockupPrintifyPayloadSchema.parse({
      job_id: payload.job_id,
      shop_id: payload.shop_id,
      product_id: payload.product_id,
      template_id: payload.template_id,
      cover_print_area: payload.cover_print_area,
      design_url: undefined,
      fake_generation: true,
    }),
  });

  logger.info(
    {
      shop_id: payload.shop_id,
      job_id: payload.job_id,
      fake_generation: true,
    },
    "Merchant preview fake generation queued",
  );

  return {
    job_id: payload.job_id,
    queued_mockups: true,
  };
};

const handleTemplateTestFakeGenerate = async (
  payload: Extract<
    GenerateDevFakeImagePayload,
    { request_type: "template_test" }
  >,
  eventId: string | undefined,
  step: StepTools,
) => {
  const usageIdempotencyId = eventId ?? payload.template_id;

  const template = await runStep(step, "load-template", async () =>
    getTemplate(payload.template_id, payload.shop_id),
  );

  if (!template) {
    throw new NonRetriableError("Template not found for fake generation");
  }

  const imageSize = calculateFalImageSize({
    coverPrintArea: false,
    templateAspectRatio: template.aspectRatio,
    printAreaDimensions: null,
  });

  const placeholderUrl = buildPlaceholderUrl(imageSize);
  const fakeResult = createFakeGenerationOutput(
    payload.num_images,
    placeholderUrl,
  );
  const mappedResult = mapGenerationResult(fakeResult);
  const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
    "template_test_fake_generate",
    usageIdempotencyId,
  );

  await runStep(step, "create-billable-event", async () =>
    createBillableEvent({
      shopId: payload.shop_id,
      eventType: BillableEventType.generation,
      amountMills: usdToMills(fakeResult.totalCostUsd),
      idempotencyKey: billableEventIdempotencyKey,
      description: "template_test_fake_generate",
      sourceId: payload.template_id,
    }),
  );

  await runStep(step, "record-test-generation", async () =>
    recordTestGeneration({
      templateId: payload.template_id,
      shopId: payload.shop_id,
      numImagesRequested: payload.num_images,
      numImagesGenerated: fakeResult.images.length,
      totalCostUsd: fakeResult.totalCostUsd,
      totalTimeSeconds: fakeResult.totalTimeSeconds,
      generationCostUsd: 0,
      removeBgCostUsd: 0,
      success: true,
      resultImages: mappedResult,
    }),
  );

  await runStep(step, "confirm-billable-event-and-charge", async () =>
    confirmAndCharge({
      shopId: payload.shop_id,
      idempotencyKey: billableEventIdempotencyKey,
      totalCostUsd: fakeResult.totalCostUsd,
      description: "template_test_fake_generate",
    }),
  );

  logger.info(
    {
      shop_id: payload.shop_id,
      template_id: payload.template_id,
      fake_generation: true,
      generated_count: fakeResult.images.length,
    },
    "Template fake generation completed",
  );

  return mappedResult;
};

export const generateDevFakeImage = inngest.createFunction(
  {
    id: "generate/dev-fake-image",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "generate.dev-fake-image.requested" },
  async ({ event, step }) => {
    const parsed = generateDevFakeImagePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid dev fake image payload",
      );
      throw new NonRetriableError("Invalid dev fake image payload");
    }

    const payload = parsed.data;

    if (payload.request_type === "buyer_preview") {
      return handleBuyerPreviewFakeGenerate(payload, step);
    }

    if (payload.request_type === "merchant_preview") {
      return handleMerchantPreviewFakeGenerate(payload, step);
    }

    return handleTemplateTestFakeGenerate(payload, event.id, step);
  },
);

export const generateImageAndRemoveBackground = inngest.createFunction(
  {
    id: "generate/image-and-remove-bg",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "generate.image-and-remove-bg.requested" },
  async ({ event, step }) => {
    const parsed = generateImageAndRemoveBackgroundPayloadSchema.safeParse(
      event.data,
    );

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid remove background payload",
      );
      throw new NonRetriableError("Invalid remove background payload");
    }

    const payload: GenerateImageAndRemoveBackgroundPayload = parsed.data;
    const usageIdempotencyId =
      payload.usage_idempotency_id ??
      event.id ??
      `${payload.shop_id}:${payload.template_id}`;

    const estimatedRemoveBgCostUsd =
      REMOVE_BG_PRICE_USD * payload.generated_images.length;

    await runStep(step, "check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedRemoveBgCostUsd),
      });

      if (!check.allowed) {
        throw new NonRetriableError(check.message);
      }
    });

    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      "template_test_remove_background",
      usageIdempotencyId,
    );

    await runStep(step, "create-billable-event", async () =>
      createBillableEvent({
        shopId: payload.shop_id,
        eventType: BillableEventType.remove_bg,
        amountMills: usdToMills(estimatedRemoveBgCostUsd),
        idempotencyKey: billableEventIdempotencyKey,
        description: "template_test_remove_background",
        sourceId: payload.template_id,
      }),
    );

    const removeBgResults = await runStep(step, "remove-background", async () =>
      Promise.all(
        payload.generated_images.map(async (image) => {
          const result = await removeBackground(image.url, payload.shop_id);
          return {
            imageUrl: result.imageUrl,
            costUsd: result.costUsd,
            timeSeconds: result.timeSeconds,
          };
        }),
      ),
    );

    const removeBgTotalCost = removeBgResults.reduce(
      (sum, result) => sum + result.costUsd,
      0,
    );
    const removeBgTotalTimeSeconds = removeBgResults.reduce(
      (sum, result) => sum + result.timeSeconds,
      0,
    );

    const finalResult = {
      results: payload.generated_images.map((image, index) => {
        const removeBgResult = removeBgResults[index];
        const removeBgCostUsd = removeBgResult?.costUsd ?? 0;
        const generationCostUsd = image.generation_cost_usd ?? image.cost_usd;

        return {
          url: removeBgResult?.imageUrl ?? image.url,
          generation_time_seconds: image.generation_time_seconds,
          cost_usd: Number((generationCostUsd + removeBgCostUsd).toFixed(3)),
          generation_cost_usd: generationCostUsd,
          remove_bg_cost_usd: removeBgCostUsd,
          seed: image.seed,
        };
      }),
      total_time_seconds:
        payload.generation_total_time_seconds + removeBgTotalTimeSeconds,
      total_cost_usd:
        payload.generation_total_cost_usd +
        Number(removeBgTotalCost.toFixed(3)),
      generation_cost_usd: payload.generation_total_cost_usd,
      remove_bg_cost_usd: Number(removeBgTotalCost.toFixed(3)),
    };

    await runStep(step, "record-test-generation", async () =>
      recordTestGeneration({
        templateId: payload.template_id,
        shopId: payload.shop_id,
        numImagesRequested: payload.num_images,
        numImagesGenerated: finalResult.results.length,
        totalCostUsd: finalResult.total_cost_usd,
        totalTimeSeconds: finalResult.total_time_seconds,
        generationCostUsd:
          finalResult.results[0]?.generation_cost_usd ??
          payload.generation_total_cost_usd,
        removeBgCostUsd: finalResult.results[0]?.remove_bg_cost_usd,
        success: true,
        resultImages: finalResult,
      }),
    );

    await runStep(
      step,
      "confirm-generation-billable-event-and-charge",
      async () =>
        confirmAndCharge({
          shopId: payload.shop_id,
          idempotencyKey: buildBillableEventIdempotencyKey(
            "template_test_generation",
            usageIdempotencyId,
          ),
          totalCostUsd: payload.generation_total_cost_usd,
          description: "template_test_generation",
        }),
    );

    await runStep(step, "confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: removeBgTotalCost,
        description: "template_test_remove_background",
      }),
    );

    logger.info(
      {
        shop_id: payload.shop_id,
        template_id: payload.template_id,
        remove_bg_count: removeBgResults.length,
      },
      "Template background removal completed",
    );

    return finalResult;
  },
);

export const mockupPrintify = inngest.createFunction(
  {
    id: "mockup/printify",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "mockup.printify.requested" },
  async ({ event, step }) => {
    const parsed = mockupPrintifyPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid printify mockup payload",
      );
      throw new NonRetriableError("Invalid printify mockup payload");
    }

    const payload: MockupPrintifyPayload = parsed.data;
    let tempProductId: string | null = null;

    try {
      const template = await runStep(step, "load-template", async () =>
        getTemplate(payload.template_id, payload.shop_id),
      );

      if (!template) {
        throw new NonRetriableError("Template not found for mockups");
      }

      const shopProduct = await runStep(step, "load-shop-product", async () =>
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
        throw new NonRetriableError("Printify product not linked.");
      }

      const printifyProduct = await runStep(
        step,
        "fetch-printify-product",
        async () =>
          getPrintifyProductDetails(payload.shop_id, printifyProductId),
      );

      const previewVariant = selectPreviewVariant(printifyProduct.variants);
      if (!previewVariant) {
        throw new NonRetriableError("No Printify variants available.");
      }

      const printAreaDimensions = await runStep(
        step,
        "fetch-print-area",
        async () =>
          getPrintifyVariantPrintArea({
            shopId: payload.shop_id,
            blueprintId: printifyProduct.blueprintId,
            printProviderId: printifyProduct.printProviderId,
            variantId: previewVariant.id,
          }),
      );

      const imageSize = calculateFalImageSize({
        coverPrintArea: payload.cover_print_area,
        templateAspectRatio: template.aspectRatio,
        printAreaDimensions,
      });

      const previewImageScale = resolvePreviewImageScale({
        coverPrintArea: payload.cover_print_area,
        imageSize,
        printAreaDimensions,
      });

      const designUrl =
        payload.design_url ??
        (payload.fake_generation ? buildPlaceholderUrl(imageSize) : null);

      if (!designUrl) {
        throw new NonRetriableError("Design URL is required for mockups.");
      }

      await runStep(step, "mark-creating-mockups", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "creating_mockups",
          designUrl,
        }),
      );

      const tempProduct = await runStep(step, "create-temp-product", async () =>
        createTempProduct(
          payload.shop_id,
          printifyProduct.blueprintId,
          printifyProduct.printProviderId,
          [previewVariant],
          {
            url: designUrl,
            position: printAreaDimensions?.position ?? "front",
            scale: previewImageScale ?? undefined,
          },
        ),
      );

      tempProductId = tempProduct.productId;

      await runStep(step, "mark-preview-done", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "done",
          designUrl,
          mockupUrls: tempProduct.mockupUrls,
          errorMessage: null,
        }),
      );

      logger.info(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          mockup_count: tempProduct.mockupUrls.length,
        },
        "Printify mockups completed",
      );

      return {
        job_id: payload.job_id,
        design_url: designUrl,
        mockup_urls: tempProduct.mockupUrls,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mockup generation failed.";

      await runStep(step, "mark-preview-failed-mockup-error", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: message,
        }),
      );

      logger.error(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          error: message,
        },
        "Printify mockup generation failed",
      );

      throw new NonRetriableError(message);
    } finally {
      if (tempProductId !== null) {
        const cleanupProductId = tempProductId;
        try {
          await runStep(step, "cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          logger.error(
            {
              shop_id: payload.shop_id,
              job_id: payload.job_id,
              printify_product_id: cleanupProductId,
              error:
                cleanupError instanceof Error
                  ? cleanupError.message
                  : String(cleanupError),
            },
            "Failed to cleanup temporary Printify product",
          );
        }
      }
    }
  },
);

export const inngestFunctions = [
  generateImage,
  generateDevFakeImage,
  generateImageAndRemoveBackground,
  mockupPrintify,
];
