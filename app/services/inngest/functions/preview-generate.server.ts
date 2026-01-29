import { NonRetriableError } from "inngest";
import { BillableEventType } from "@prisma/client";
import { z } from "zod";
import prisma from "../../../db.server";
import { inngest } from "../client.server";
import {
  previewFakeGeneratePayloadSchema,
  previewGeneratePayloadSchema,
  type PreviewFakeGeneratePayload,
  type PreviewGeneratePayload,
} from "../types";
import { generateImage } from "../../previews/image-generation.server";
import { generateMockups } from "../../previews/mockup-generation.server";
import {
  getPreviewJobById,
  updatePreviewJob,
} from "../../previews/preview-jobs.server";
import { getTemplate } from "../../templates/templates.server";
import { calculateFalImageSize } from "../../fal/image-size.server";
import { getPrintifyProductDetails } from "../../printify/product-details.server";
import { getPrintifyVariantPrintArea } from "../../printify/print-area.server";
import { deleteProduct } from "../../printify/temp-product.server";
import { buildPlaceholderUrl } from "../../../lib/placeholder-images";
import { applyPromptVariableValues } from "../../../lib/prompt-variables";
import logger from "../../../lib/logger";
import { captureEvent } from "../../../lib/posthog.server";
import { getModelConfig } from "../../fal/registry";
import { TEMPLATE_ASPECT_RATIO_LABELS } from "../../../lib/template-aspect-ratios";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "../../../lib/generation-settings";
import { usdToMills } from "../../shopify/billing-guardrails";
import { checkBillableActionAllowed } from "../../shopify/billing-guardrails.server";
import {
  buildBillableEventIdempotencyKey,
  confirmAndCharge,
  createBillableEvent,
  failBillableEvent,
  getBillableEventByIdempotencyKey,
} from "../../shopify/billable-events.server";

const FAKE_GENERATION_DELAY_MS = 5000;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const selectPreviewVariant = (
  variants: Array<{ id: number; price: number; isEnabled: boolean }>,
) => variants.find((variant) => variant.isEnabled) ?? variants[0];

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

const filterVariableValues = (
  templateVariables: Array<{ name: string }>,
  provided: Record<string, string>,
): Record<string, string> => {
  const safeValues: Record<string, string> = {};
  for (const variable of templateVariables) {
    const rawValue = provided[variable.name];
    if (rawValue !== undefined) {
      safeValues[variable.name] = rawValue;
    }
  }
  return safeValues;
};

const resolveInputImageUrl = (
  payload: PreviewGeneratePayload | PreviewFakeGeneratePayload,
): string | undefined => {
  if (payload.type === "buyer") {
    return payload.image_url;
  }
  return payload.test_image_url ?? payload.image_url;
};

const resolveInputText = (
  payload: PreviewGeneratePayload | PreviewFakeGeneratePayload,
): string | undefined => {
  if (payload.type === "buyer") {
    return payload.text_input;
  }
  return payload.test_text;
};

const resolveGenerationConfig = (input: {
  modelId: string;
  coverPrintArea: boolean;
}) => {
  const modelConfig = getModelConfig(input.modelId);
  const supportsImageSize = modelConfig?.supportsImageSize ?? true;
  const effectiveCoverPrintArea = input.coverPrintArea && supportsImageSize;
  return { modelConfig, supportsImageSize, effectiveCoverPrintArea };
};

const resolveAspectRatio = (
  aspectRatio: keyof typeof TEMPLATE_ASPECT_RATIO_LABELS,
): "16:9" | "9:16" | "3:2" | "2:3" | "4:3" | "3:4" | "1:1" =>
  TEMPLATE_ASPECT_RATIO_LABELS[aspectRatio] as
    | "16:9"
    | "9:16"
    | "3:2"
    | "2:3"
    | "4:3"
    | "3:4"
    | "1:1";

export const previewGenerate = inngest.createFunction(
  {
    id: "preview_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.generate.requested" },
  async ({ event, step }) => {
    const parsed = previewGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid preview generation payload",
      );
      throw new NonRetriableError("Invalid preview generation payload");
    }

    const payload = parsed.data;
    const coverPrintArea =
      payload.type === "buyer" ? false : (payload.cover_print_area ?? false);
    const inputImageUrl = resolveInputImageUrl(payload);
    const inputText = resolveInputText(payload);
    const variableValues = payload.variable_values ?? {};

    if (!inputImageUrl) {
      throw new NonRetriableError("Input image URL is required.");
    }

    const usageIdempotencyId = event.id ?? payload.job_id;
    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      `preview_generation_${payload.type}`,
      usageIdempotencyId,
    );
    let providerCostMayBeIncurred = false;
    let tempProductId: string | null = null;

    try {
      const template = await step.run("load-template", async () =>
        getTemplate(payload.template_id, payload.shop_id),
      );

      if (!template?.prompt) {
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
        throw new NonRetriableError("Printify product not linked.");
      }

      const printifyProduct = await step.run(
        "fetch-printify-product",
        async () =>
          getPrintifyProductDetails(payload.shop_id, printifyProductId),
      );

      const previewVariant = selectPreviewVariant(printifyProduct.variants);
      if (!previewVariant) {
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

      const modelId =
        template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID;
      const { supportsImageSize, effectiveCoverPrintArea } =
        resolveGenerationConfig({
          modelId,
          coverPrintArea,
        });

      if (coverPrintArea && !supportsImageSize) {
        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
            model_id: modelId,
          },
          "Cover print area disabled: model does not support custom dimensions",
        );
      }

      const imageSize = calculateFalImageSize({
        coverPrintArea: effectiveCoverPrintArea,
        templateAspectRatio: template.aspectRatio,
        printAreaDimensions,
      });

      const safeVariableValues = filterVariableValues(
        template.variables,
        variableValues,
      );

      const generationPrompt = buildPrompt(
        template.prompt,
        safeVariableValues,
        inputText,
        template.textInputEnabled,
      );

      if (!generationPrompt.trim()) {
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
          throw new NonRetriableError(check.message);
        }
      });

      await step.run("create-billable-event", async () =>
        createBillableEvent({
          shopId: payload.shop_id,
          eventType: BillableEventType.generation,
          amountMills: usdToMills(estimatedCostUsd),
          idempotencyKey: billableEventIdempotencyKey,
          description: `preview_generation_${payload.type}`,
          sourceId: payload.job_id,
        }),
      );

      await step.run("mark-generating", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "generating",
        }),
      );

      captureEvent("generation.started", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        template_id: payload.template_id,
        product_id: payload.product_id,
        preview_type: payload.type,
      });

      const generationResult = await step.run("generate-image", async () =>
        generateImage({
          imageUrl: inputImageUrl,
          prompt: generationPrompt,
          modelId,
          removeBackground: template.removeBackgroundEnabled,
          imageSize,
          aspectRatio: supportsImageSize
            ? undefined
            : resolveAspectRatio(template.aspectRatio),
          shopId: payload.shop_id,
        }),
      );
      providerCostMayBeIncurred = true;

      await step.run("confirm-billable-event-and-charge", async () =>
        confirmAndCharge({
          shopId: payload.shop_id,
          idempotencyKey: billableEventIdempotencyKey,
          totalCostUsd: generationResult.costUsd,
          description: `preview_generation_${payload.type}`,
        }),
      );

      await step.run("mark-processing", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "processing",
          designUrl: generationResult.designUrl,
          designStorageKey: generationResult.storageKey,
          errorMessage: null,
        }),
      );

      if (payload.type === "buyer") {
        await step.run("mark-done", async () =>
          updatePreviewJob({
            jobId: payload.job_id,
            shopId: payload.shop_id,
            status: "done",
            designUrl: generationResult.designUrl,
            designStorageKey: generationResult.storageKey,
            errorMessage: null,
          }),
        );

        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
          },
          "Buyer preview generation completed",
        );

        captureEvent("generation.completed", {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          template_id: payload.template_id,
          product_id: payload.product_id,
          preview_type: payload.type,
        });

        // Trigger mockup generation asynchronously - don't wait for it
        await step.run("trigger-mockups-async", async () => {
          await inngest.send({
            name: "previews.mockups.generate",
            data: {
              job_id: payload.job_id,
              shop_id: payload.shop_id,
              product_id: payload.product_id,
              template_id: payload.template_id,
              design_url: generationResult.designUrl,
              design_storage_key: generationResult.storageKey,
              cover_print_area: coverPrintArea,
              image_width: imageSize.width,
              image_height: imageSize.height,
            },
          });
        });

        captureEvent("mockups.triggered", {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          template_id: payload.template_id,
          product_id: payload.product_id,
        });

        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
          },
          "Mockup generation triggered asynchronously",
        );

        return {
          job_id: payload.job_id,
          design_url: generationResult.designUrl,
        };
      }

      await step.run("mark-creating-mockups", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "creating_mockups",
          designUrl: generationResult.designUrl,
          designStorageKey: generationResult.storageKey,
          errorMessage: null,
        }),
      );

      const previewImageScale = resolvePreviewImageScale({
        coverPrintArea,
        imageSize,
        printAreaDimensions,
      });

      const mockups = await step.run("generate-mockups", async () =>
        generateMockups({
          designUrl: generationResult.designUrl,
          blueprintId: printifyProduct.blueprintId,
          printProviderId: printifyProduct.printProviderId,
          variants: [previewVariant],
          printArea: {
            position: printAreaDimensions?.position ?? "front",
            scale: previewImageScale ?? undefined,
            width: printAreaDimensions?.width ?? imageSize.width,
            height: printAreaDimensions?.height ?? imageSize.height,
          },
          shopId: payload.shop_id,
        }),
      );

      tempProductId = mockups.tempProductId;

      await step.run("mark-done", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "done",
          designUrl: generationResult.designUrl,
          designStorageKey: generationResult.storageKey,
          mockupUrls: mockups.mockupUrls,
          tempPrintifyProductId: mockups.tempProductId,
          errorMessage: null,
        }),
      );

      logger.info(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          mockup_count: mockups.mockupUrls.length,
        },
        "Preview generation completed",
      );

      return {
        job_id: payload.job_id,
        design_url: generationResult.designUrl,
        mockup_urls: mockups.mockupUrls,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Preview generation failed.";

      await step.run("mark-preview-failed", async () =>
        updatePreviewJob({
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
        await step.run("fail-billable-event", async () =>
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
        job_id: payload.job_id,
        template_id: payload.template_id,
        product_id: payload.product_id,
        preview_type: payload.type,
      });

      logger.error(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          error: message,
        },
        "Preview generation failed",
      );

      throw new NonRetriableError(message);
    } finally {
      if (tempProductId) {
        const cleanupProductId = tempProductId;
        try {
          await step.run("cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          logger.error(
            {
              shop_id: payload.shop_id,
              job_id: payload.job_id,
              printify_product_id: tempProductId,
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

export const previewGenerateFailure = inngest.createFunction(
  { id: "preview_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    if (event.data.function_id !== "preview_generate") {
      return { ignored: true };
    }

    const payload = previewGeneratePayloadSchema.safeParse(
      event.data.event.data,
    );

    if (!payload.success) {
      logger.warn(
        { errors: payload.error.flatten().fieldErrors },
        "Missing payload data for preview generation failure",
      );
      return { skipped: true };
    }

    await step.run("mark-preview-failed", async () =>
      updatePreviewJob({
        jobId: payload.data.job_id,
        shopId: payload.data.shop_id,
        status: "failed",
        errorMessage: event.data.error?.message ?? "Preview generation failed.",
      }),
    );

    const usageIdempotencyId = event.data.event.id ?? payload.data.job_id;
    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      `preview_generation_${payload.data.type}`,
      usageIdempotencyId,
    );
    const existingEvent = await getBillableEventByIdempotencyKey(
      payload.data.shop_id,
      billableEventIdempotencyKey,
    );

    if (existingEvent) {
      const failedStep = event.data.step?.name;
      const providerCostMayBeIncurred =
        failedStep === "generate-image" ||
        failedStep === "confirm-billable-event-and-charge" ||
        failedStep === "mark-processing" ||
        failedStep === "mark-done" ||
        failedStep === "generate-mockups" ||
        failedStep === "mark-creating-mockups";

      await step.run("fail-billable-event", async () =>
        failBillableEvent({
          shopId: payload.data.shop_id,
          idempotencyKey: billableEventIdempotencyKey,
          errorMessage: event.data.error?.message,
          waived: providerCostMayBeIncurred,
        }),
      );
    }

    const job = await getPreviewJobById(
      payload.data.shop_id,
      payload.data.job_id,
    );
    const cleanupProductId = job?.tempPrintifyProductId ?? null;
    if (cleanupProductId) {
      try {
        await step.run("cleanup-temp-product", async () =>
          deleteProduct(payload.data.shop_id, cleanupProductId),
        );
      } catch (cleanupError) {
        logger.error(
          {
            shop_id: payload.data.shop_id,
            job_id: payload.data.job_id,
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

    logger.error(
      {
        shop_id: payload.data.shop_id,
        job_id: payload.data.job_id,
        error: event.data.error?.message,
      },
      "Preview generation failed",
    );

    return { recovered: true };
  },
);

export const previewFakeGenerate = inngest.createFunction(
  {
    id: "preview_fake_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.fake_generate.requested" },
  async ({ event, step }) => {
    const parsed = previewFakeGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid preview fake generation payload",
      );
      throw new NonRetriableError("Invalid preview fake generation payload");
    }

    const payload = parsed.data;
    const coverPrintArea =
      payload.type === "buyer" ? false : (payload.cover_print_area ?? false);
    const inputImageUrl = resolveInputImageUrl(payload);
    const inputText = resolveInputText(payload);
    const variableValues = payload.variable_values ?? {};
    let tempProductId: string | null = null;

    if (!inputImageUrl) {
      throw new NonRetriableError("Input image URL is required.");
    }

    try {
      const template = await step.run("load-template", async () =>
        getTemplate(payload.template_id, payload.shop_id),
      );

      if (!template?.prompt) {
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
        throw new NonRetriableError("Printify product not linked.");
      }

      const printifyProduct = await step.run(
        "fetch-printify-product",
        async () =>
          getPrintifyProductDetails(payload.shop_id, printifyProductId),
      );

      const previewVariant = selectPreviewVariant(printifyProduct.variants);
      if (!previewVariant) {
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

      const modelId =
        template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID;
      const { supportsImageSize, effectiveCoverPrintArea } =
        resolveGenerationConfig({
          modelId,
          coverPrintArea,
        });

      if (coverPrintArea && !supportsImageSize) {
        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
            model_id: modelId,
          },
          "Cover print area disabled (fake): model does not support custom dimensions",
        );
      }

      const imageSize = calculateFalImageSize({
        coverPrintArea: effectiveCoverPrintArea,
        templateAspectRatio: template.aspectRatio,
        printAreaDimensions,
      });

      const safeVariableValues = filterVariableValues(
        template.variables,
        variableValues,
      );

      const generationPrompt = buildPrompt(
        template.prompt,
        safeVariableValues,
        inputText,
        template.textInputEnabled,
      );

      if (!generationPrompt.trim()) {
        throw new NonRetriableError("Generation prompt is empty.");
      }

      await step.run("mark-generating", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "generating",
        }),
      );

      await step.run("fake-generation-delay", async () =>
        wait(FAKE_GENERATION_DELAY_MS),
      );

      const placeholderUrl = `${buildPlaceholderUrl(imageSize)}?text=Hello+World`;

      await step.run("mark-processing", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "processing",
          designUrl: placeholderUrl,
          errorMessage: null,
        }),
      );

      if (payload.type === "buyer") {
        await step.run("mark-done", async () =>
          updatePreviewJob({
            jobId: payload.job_id,
            shopId: payload.shop_id,
            status: "done",
            designUrl: placeholderUrl,
            errorMessage: null,
          }),
        );

        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
            fake_generation: true,
          },
          "Preview fake generation completed",
        );

        captureEvent("generation.completed", {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          template_id: payload.template_id,
          product_id: payload.product_id,
          preview_type: payload.type,
          fake_generation: true,
        });

        // Trigger mockup generation asynchronously - don't wait for it
        await step.run("trigger-mockups-async", async () => {
          await inngest.send({
            name: "previews.mockups.generate",
            data: {
              job_id: payload.job_id,
              shop_id: payload.shop_id,
              product_id: payload.product_id,
              template_id: payload.template_id,
              design_url: placeholderUrl,
              design_storage_key: null,
              cover_print_area: coverPrintArea,
              image_width: imageSize.width,
              image_height: imageSize.height,
              fake_generation: true,
            },
          });
        });

        captureEvent("mockups.triggered", {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          template_id: payload.template_id,
          product_id: payload.product_id,
          fake_generation: true,
        });

        logger.info(
          {
            shop_id: payload.shop_id,
            job_id: payload.job_id,
          },
          "Mockup generation triggered asynchronously",
        );

        return {
          job_id: payload.job_id,
          design_url: placeholderUrl,
        };
      }

      await step.run("mark-creating-mockups", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "creating_mockups",
          designUrl: placeholderUrl,
          errorMessage: null,
        }),
      );

      const previewImageScale = resolvePreviewImageScale({
        coverPrintArea: effectiveCoverPrintArea,
        imageSize,
        printAreaDimensions,
      });

      const mockups = await step.run("generate-mockups", async () =>
        generateMockups({
          designUrl: placeholderUrl,
          blueprintId: printifyProduct.blueprintId,
          printProviderId: printifyProduct.printProviderId,
          variants: [previewVariant],
          printArea: {
            position: printAreaDimensions?.position ?? "front",
            scale: previewImageScale ?? undefined,
            width: printAreaDimensions?.width ?? imageSize.width,
            height: printAreaDimensions?.height ?? imageSize.height,
          },
          shopId: payload.shop_id,
        }),
      );

      tempProductId = mockups.tempProductId;

      await step.run("mark-done", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "done",
          designUrl: placeholderUrl,
          mockupUrls: mockups.mockupUrls,
          tempPrintifyProductId: mockups.tempProductId,
          errorMessage: null,
        }),
      );

      logger.info(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          mockup_count: mockups.mockupUrls.length,
          fake_generation: true,
        },
        "Preview fake generation completed",
      );

      return {
        job_id: payload.job_id,
        design_url: placeholderUrl,
        mockup_urls: mockups.mockupUrls,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Preview generation failed.";

      await step.run("mark-preview-failed", async () =>
        updatePreviewJob({
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
        "Preview fake generation failed",
      );

      throw new NonRetriableError(message);
    } finally {
      if (tempProductId) {
        const cleanupProductId = tempProductId;
        try {
          await step.run("cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          logger.error(
            {
              shop_id: payload.shop_id,
              job_id: payload.job_id,
              printify_product_id: tempProductId,
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

export const previewFakeGenerateFailure = inngest.createFunction(
  { id: "preview_fake_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    if (event.data.function_id !== "preview_fake_generate") {
      return { ignored: true };
    }

    const payload = previewFakeGeneratePayloadSchema.safeParse(
      event.data.event.data,
    );

    if (!payload.success) {
      logger.warn(
        { errors: payload.error.flatten().fieldErrors },
        "Missing payload data for preview fake generation failure",
      );
      return { skipped: true };
    }

    await step.run("mark-preview-failed", async () =>
      updatePreviewJob({
        jobId: payload.data.job_id,
        shopId: payload.data.shop_id,
        status: "failed",
        errorMessage: event.data.error?.message ?? "Preview generation failed.",
      }),
    );

    const job = await getPreviewJobById(
      payload.data.shop_id,
      payload.data.job_id,
    );
    const cleanupProductId = job?.tempPrintifyProductId ?? null;
    if (cleanupProductId) {
      try {
        await step.run("cleanup-temp-product", async () =>
          deleteProduct(payload.data.shop_id, cleanupProductId),
        );
      } catch (cleanupError) {
        logger.error(
          {
            shop_id: payload.data.shop_id,
            job_id: payload.data.job_id,
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

    logger.error(
      {
        shop_id: payload.data.shop_id,
        job_id: payload.data.job_id,
        error: event.data.error?.message,
      },
      "Preview fake generation failed",
    );

    return { recovered: true };
  },
);

const mockupsRetryPayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  design_url: z.string().url(),
  design_storage_key: z.string().nullable().optional(),
});

export const mockupsRetry = inngest.createFunction(
  {
    id: "mockups_retry",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.mockups.retry" },
  async ({ event, step }) => {
    const parsed = mockupsRetryPayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid mockups retry payload",
      );
      throw new NonRetriableError("Invalid mockups retry payload");
    }

    const payload = parsed.data;
    let tempProductId: string | null = null;

    try {
      const job = await step.run("load-job", async () =>
        getPreviewJobById(payload.shop_id, payload.job_id),
      );

      if (!job) {
        throw new NonRetriableError("Preview job not found.");
      }

      // Get the shop product to retrieve Printify product details
      const shopProduct = await step.run("load-shop-product", async () =>
        prisma.shopProduct.findUnique({
          where: {
            shop_id_product_id: {
              shop_id: payload.shop_id,
              product_id: job.productId,
            },
          },
          select: { printify_product_id: true },
        }),
      );

      const printifyProductId = shopProduct?.printify_product_id;
      if (!printifyProductId) {
        throw new NonRetriableError("Printify product not linked.");
      }

      const printifyProduct = await step.run(
        "fetch-printify-product",
        async () =>
          getPrintifyProductDetails(payload.shop_id, printifyProductId),
      );

      const previewVariant = selectPreviewVariant(printifyProduct.variants);
      if (!previewVariant) {
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

      await step.run("mark-creating-mockups", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "creating_mockups",
          errorMessage: null,
        }),
      );

      captureEvent("mockups.retry_started", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
      });

      const mockups = await step.run("generate-mockups", async () =>
        generateMockups({
          designUrl: payload.design_url,
          blueprintId: printifyProduct.blueprintId,
          printProviderId: printifyProduct.printProviderId,
          variants: [previewVariant],
          printArea: {
            position: printAreaDimensions?.position ?? "front",
            width: printAreaDimensions?.width ?? 1000,
            height: printAreaDimensions?.height ?? 1000,
          },
          shopId: payload.shop_id,
        }),
      );

      tempProductId = mockups.tempProductId;

      await step.run("mark-mockups-done", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "done",
          mockupUrls: mockups.mockupUrls,
          tempPrintifyProductId: mockups.tempProductId,
          errorMessage: null,
        }),
      );

      captureEvent("mockups.retry_succeeded", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        mockup_count: mockups.mockupUrls.length,
      });

      logger.info(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          mockup_count: mockups.mockupUrls.length,
        },
        "Mockup retry completed",
      );

      return {
        job_id: payload.job_id,
        mockup_urls: mockups.mockupUrls,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mockup retry failed";

      await step.run("mark-mockups-failed", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "mockups_failed",
          errorMessage: message,
        }),
      );

      captureEvent("mockups.retry_failed", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        error: message,
      });

      logger.error(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          error: message,
        },
        "Mockup retry failed",
      );

      throw new NonRetriableError(message);
    } finally {
      if (tempProductId) {
        const cleanupProductId = tempProductId;
        try {
          await step.run("cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          logger.error(
            {
              shop_id: payload.shop_id,
              job_id: payload.job_id,
              printify_product_id: tempProductId,
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

const mockupsGeneratePayloadSchema = z.object({
  job_id: z.string().min(1),
  shop_id: z.string().min(1),
  product_id: z.string().min(1),
  template_id: z.string().min(1),
  design_url: z.string().url(),
  design_storage_key: z.string().nullable().optional(),
  cover_print_area: z.boolean().default(false),
  image_width: z.number().default(1024),
  image_height: z.number().default(1024),
  fake_generation: z.boolean().default(false),
});

export const mockupsGenerate = inngest.createFunction(
  {
    id: "mockups_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "previews.mockups.generate" },
  async ({ event, step }) => {
    const parsed = mockupsGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid mockups generate payload",
      );
      throw new NonRetriableError("Invalid mockups generate payload");
    }

    const payload = parsed.data;
    let tempProductId: string | null = null;

    try {
      await step.run("mark-creating-mockups", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "creating_mockups",
          designUrl: payload.design_url,
          designStorageKey: payload.design_storage_key,
          errorMessage: null,
        }),
      );

      captureEvent("mockups.started", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        template_id: payload.template_id,
        product_id: payload.product_id,
        fake_generation: payload.fake_generation,
      });

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
        throw new NonRetriableError("Printify product not linked.");
      }

      const printifyProduct = await step.run(
        "fetch-printify-product",
        async () =>
          getPrintifyProductDetails(payload.shop_id, printifyProductId),
      );

      const previewVariant = selectPreviewVariant(printifyProduct.variants);
      if (!previewVariant) {
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

      const previewImageScale = resolvePreviewImageScale({
        coverPrintArea: payload.cover_print_area,
        imageSize: { width: payload.image_width, height: payload.image_height },
        printAreaDimensions,
      });

      const mockups = await step.run("generate-mockups", async () =>
        generateMockups({
          designUrl: payload.design_url,
          blueprintId: printifyProduct.blueprintId,
          printProviderId: printifyProduct.printProviderId,
          variants: [previewVariant],
          printArea: {
            position: printAreaDimensions?.position ?? "front",
            scale: previewImageScale ?? undefined,
            width: printAreaDimensions?.width ?? payload.image_width,
            height: printAreaDimensions?.height ?? payload.image_height,
          },
          shopId: payload.shop_id,
        }),
      );

      tempProductId = mockups.tempProductId;

      await step.run("mark-mockups-done", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "done",
          designUrl: payload.design_url,
          designStorageKey: payload.design_storage_key,
          mockupUrls: mockups.mockupUrls,
          tempPrintifyProductId: mockups.tempProductId,
          errorMessage: null,
        }),
      );

      captureEvent("mockups.succeeded", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        template_id: payload.template_id,
        product_id: payload.product_id,
        mockup_count: mockups.mockupUrls.length,
        fake_generation: payload.fake_generation,
      });

      logger.info(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          mockup_count: mockups.mockupUrls.length,
          fake_generation: payload.fake_generation,
        },
        "Mockup generation completed",
      );

      return {
        job_id: payload.job_id,
        mockup_urls: mockups.mockupUrls,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mockup generation failed";

      await step.run("mark-mockups-failed", async () =>
        updatePreviewJob({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "mockups_failed",
          designUrl: payload.design_url,
          designStorageKey: payload.design_storage_key,
          errorMessage: message,
        }),
      );

      captureEvent("mockups.failed", {
        shop_id: payload.shop_id,
        job_id: payload.job_id,
        template_id: payload.template_id,
        product_id: payload.product_id,
        error: message,
        fake_generation: payload.fake_generation,
      });

      logger.error(
        {
          shop_id: payload.shop_id,
          job_id: payload.job_id,
          error: message,
        },
        "Mockup generation failed",
      );

      throw new NonRetriableError(message);
    } finally {
      if (tempProductId) {
        const cleanupProductId = tempProductId;
        try {
          await step.run("cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          logger.error(
            {
              shop_id: payload.shop_id,
              job_id: payload.job_id,
              printify_product_id: tempProductId,
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
  previewGenerate,
  previewGenerateFailure,
  previewFakeGenerate,
  previewFakeGenerateFailure,
  mockupsGenerate,
  mockupsRetry,
];
