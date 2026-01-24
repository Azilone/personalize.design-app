import { NonRetriableError } from "inngest";
import prisma from "../../../db.server";
import { inngest } from "../client.server";
import {
  merchantPreviewGeneratePayloadSchema,
  merchantPreviewFakeGeneratePayloadSchema,
  type MerchantPreviewFakeGeneratePayload,
  type MerchantPreviewGeneratePayload,
} from "../types";
import { generateImages } from "../../fal/generate.server";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "../../../lib/generation-settings";
import logger from "../../../lib/logger";
import {
  buildUsageChargeIdempotencyKey,
  recordUsageCharge,
} from "../../shopify/billing.server";
import { usdToMills } from "../../shopify/billing-guardrails";
import { checkBillableActionAllowed } from "../../shopify/billing-guardrails.server";
import {
  createBillableEvent,
  confirmAndCharge,
  failBillableEvent,
  buildBillableEventIdempotencyKey,
  getBillableEventByIdempotencyKey,
} from "../../shopify/billable-events.server";
import { BillableEventType } from "@prisma/client";
import { updateMerchantPreview } from "../../merchant-previews/merchant-previews.server";
import { getTemplate } from "../../templates/templates.server";
import { applyPromptVariableValues } from "../../../lib/prompt-variables";
import { calculateFalImageSize } from "../../fal/image-size.server";
import { getPrintifyVariantPrintArea } from "../../printify/print-area.server";
import {
  createTempProduct,
  deleteProduct,
} from "../../printify/temp-product.server";
import { getPrintifyProductDetails } from "../../printify/product-details.server";
import { buildPlaceholderUrl } from "../../../lib/placeholder-images";

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

const selectPreviewVariant = (
  variants: Array<{ id: number; price: number; isEnabled: boolean }>,
) => {
  return variants.find((variant) => variant.isEnabled) ?? variants[0];
};

const buildPrompt = (
  templatePrompt: string,
  variableValues: Record<string, string>,
  testText?: string | null,
  allowTextInput?: boolean,
): string => {
  const rendered = applyPromptVariableValues(templatePrompt, variableValues);
  if (allowTextInput && testText?.trim()) {
    return `${rendered}\n\nCustom text: ${testText.trim()}`;
  }
  return rendered;
};

export const merchantPreviewFakeGenerate = inngest.createFunction(
  {
    id: "merchant_preview_fake_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "merchant_previews.fake_generate.requested" },
  async ({ event, step }) => {
    const parsed = merchantPreviewFakeGeneratePayloadSchema.safeParse(
      event.data,
    );
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid merchant preview fake payload",
      );
      throw new NonRetriableError("Invalid merchant preview fake payload");
    }

    const payload: MerchantPreviewFakeGeneratePayload = parsed.data;

    const template = await step.run("load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      await step.run("mark-preview-failed-no-prompt", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
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
        select: {
          printify_product_id: true,
        },
      }),
    );

    const printifyProductId = shopProduct?.printify_product_id;
    if (!printifyProductId) {
      await step.run("mark-preview-failed-no-printify-link", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
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
        updateMerchantPreview({
          jobId: payload.job_id,
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
      coverPrintArea: payload.cover_print_area,
      templateAspectRatio: template.aspectRatio,
      printAreaDimensions,
    });

    const previewImageScale = resolvePreviewImageScale({
      coverPrintArea: payload.cover_print_area,
      imageSize,
      printAreaDimensions,
    });

    const designUrl = buildPlaceholderUrl(imageSize);

    await step.run("mark-generating", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "generating",
      }),
    );

    await step.run("mark-creating-mockups", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "creating_mockups",
      }),
    );

    let tempProductId: string | null = null;

    try {
      const tempProduct = await step.run("create-temp-product", async () =>
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

      await step.run("mark-preview-done", async () =>
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
          fake_generation: true,
        },
        "Merchant preview fake generation completed",
      );

      return {
        job_id: payload.job_id,
        design_url: designUrl,
        mockup_urls: tempProduct.mockupUrls,
      };
    } catch (error) {
      await step.run("mark-preview-failed-mockup-error", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Preview generation failed.",
        }),
      );

      throw error;
    } finally {
      if (tempProductId !== null) {
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

export const merchantPreviewGenerate = inngest.createFunction(
  {
    id: "merchant_preview_generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "merchant_previews.generate.requested" },
  async ({ event, step }) => {
    const parsed = merchantPreviewGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid merchant preview payload",
      );
      throw new NonRetriableError("Invalid merchant preview payload");
    }

    const payload: MerchantPreviewGeneratePayload = parsed.data;
    const usageIdempotencyId = event.id ?? payload.job_id;

    const template = await step.run("load-template", async () =>
      getTemplate(payload.template_id, payload.shop_id),
    );

    if (!template?.prompt) {
      await step.run("mark-preview-failed-no-prompt", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
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
        select: {
          printify_product_id: true,
        },
      }),
    );

    const printifyProductId = shopProduct?.printify_product_id;
    if (!printifyProductId) {
      await step.run("mark-preview-failed-no-printify-link", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
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
        updateMerchantPreview({
          jobId: payload.job_id,
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
      coverPrintArea: payload.cover_print_area,
      templateAspectRatio: template.aspectRatio,
      printAreaDimensions,
    });

    const previewImageScale = resolvePreviewImageScale({
      coverPrintArea: payload.cover_print_area,
      imageSize,
      printAreaDimensions,
    });

    const safeVariableValues: Record<string, string> = {};
    for (const variable of template.variables) {
      const rawValue = payload.variable_values[variable.name];
      if (rawValue !== undefined) {
        safeVariableValues[variable.name] = rawValue;
      }
    }

    const templatePrompt = template.prompt ?? "";
    const generationPrompt = buildPrompt(
      templatePrompt,
      safeVariableValues,
      payload.test_text,
      template.textInputEnabled,
    );

    if (!generationPrompt.trim()) {
      await step.run("mark-preview-failed-empty-prompt", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
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
        await updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: check.message,
        });
        throw new NonRetriableError(check.message);
      }
    });

    // AC 5: Create billable event BEFORE provider call with stable idempotency key
    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      "merchant_preview_generation",
      usageIdempotencyId,
    );

    await step.run("create-billable-event", async () =>
      createBillableEvent({
        shopId: payload.shop_id,
        eventType: BillableEventType.generation,
        amountMills: usdToMills(estimatedCostUsd),
        idempotencyKey: billableEventIdempotencyKey,
        description: "merchant_preview_generation",
        sourceId: payload.job_id,
      }),
    );

    await step.run("mark-generating", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "generating",
      }),
    );

    const generationResult = await step.run("generate-images", async () =>
      generateImages({
        modelId: template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID, // Use imported ID if template has none
        imageUrls: [payload.test_image_url],
        prompt: generationPrompt,
        numImages: 1,
        imageSize,
        shopId: payload.shop_id,
        removeBackgroundEnabled: template.removeBackgroundEnabled,
      }),
    );

    const designUrl = generationResult.images[0]?.url;
    if (!designUrl) {
      await step.run("mark-preview-failed-no-design", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage: "No design was generated.",
        }),
      );

      throw new NonRetriableError("No design generated.");
    }

    // AC 5, 6: Confirm billable event and record usage charge only after
    // asset is persisted (design generated)
    await step.run("confirm-billable-event-and-charge", async () =>
      confirmAndCharge({
        shopId: payload.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        totalCostUsd: generationResult.totalCostUsd,
        description: "merchant_preview_generation",
      }),
    );

    await step.run("mark-creating-mockups", async () =>
      updateMerchantPreview({
        jobId: payload.job_id,
        shopId: payload.shop_id,
        status: "creating_mockups",
      }),
    );

    let tempProductId: string | null = null;

    try {
      const tempProduct = await step.run("create-temp-product", async () =>
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

      await step.run("mark-preview-done", async () =>
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
        "Merchant preview completed",
      );

      return {
        job_id: payload.job_id,
        design_url: designUrl,
        mockup_urls: tempProduct.mockupUrls,
      };
    } catch (error) {
      await step.run("mark-preview-failed-mockup-error", async () =>
        updateMerchantPreview({
          jobId: payload.job_id,
          shopId: payload.shop_id,
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Preview generation failed.",
        }),
      );

      throw error;
    } finally {
      if (tempProductId !== null) {
        const cleanupProductId = tempProductId;
        try {
          await step.run("cleanup-temp-product", async () =>
            deleteProduct(payload.shop_id, cleanupProductId),
          );
        } catch (cleanupError) {
          // Log but don't throw - cleanup failure should not mask the original error
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

export const merchantPreviewGenerateFailure = inngest.createFunction(
  { id: "merchant_preview_generate_failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    const isPreviewGenerate =
      event.data.function_id === "merchant_preview_generate";

    if (!isPreviewGenerate) {
      return { ignored: true };
    }

    const payload = merchantPreviewGeneratePayloadSchema.safeParse(
      event.data.event.data,
    );

    if (!payload.success) {
      logger.warn(
        {
          errors: payload.error.flatten().fieldErrors,
        },
        "Missing payload data for merchant preview failure",
      );
      return { skipped: true };
    }

    await step.run("mark-preview-failed", async () =>
      updateMerchantPreview({
        jobId: payload.data.job_id,
        shopId: payload.data.shop_id,
        status: "failed",
        errorMessage: event.data.error?.message ?? "Preview generation failed.",
      }),
    );

    const usageIdempotencyId =
      event.data.event.id ?? payload.data.job_id ?? payload.data.template_id;
    const billableEventIdempotencyKey = buildBillableEventIdempotencyKey(
      "merchant_preview_generation",
      usageIdempotencyId,
    );
    const existingEvent = await getBillableEventByIdempotencyKey(
      payload.data.shop_id,
      billableEventIdempotencyKey,
    );

    if (!existingEvent) {
      return { recovered: true, eventMissing: true };
    }

    const failedStep = event.data.step?.name;
    const providerCostMayBeIncurred =
      failedStep === "generate-images" ||
      failedStep === "confirm-billable-event-and-charge" ||
      failedStep === "mark-creating-mockups" ||
      failedStep === "create-temp-product" ||
      failedStep === "mark-preview-done" ||
      failedStep === "mark-preview-failed-mockup-error";

    await step.run("fail-billable-event", async () =>
      failBillableEvent({
        shopId: payload.data.shop_id,
        idempotencyKey: billableEventIdempotencyKey,
        errorMessage: event.data.error?.message,
        waived: providerCostMayBeIncurred,
      }),
    );

    logger.error(
      {
        shop_id: payload.data.shop_id,
        job_id: payload.data.job_id,
        error: event.data.error?.message,
      },
      "Merchant preview generation failed",
    );

    return { recovered: true };
  },
);

export const inngestFunctions = [
  merchantPreviewFakeGenerate,
  merchantPreviewGenerate,
  merchantPreviewGenerateFailure,
];
