import { NonRetriableError } from "inngest";
import { inngest } from "../client.server";
import {
  templateTestFakeGeneratePayloadSchema,
  templateTestGeneratePayloadSchema,
  templateTestRemoveBackgroundPayloadSchema,
  type TemplateTestFakeGeneratePayload,
  type TemplateTestGeneratePayload,
  type TemplateTestRemoveBackgroundPayload,
} from "../types";
import { generateImages } from "../../fal/generate.server";
import { removeBackground } from "../../fal/models/birefnet-v2";
import { calculateFalImageSize } from "../../fal/image-size.server";
import { buildPlaceholderUrl } from "../../../lib/placeholder-images";
import {
  MVP_PRICE_USD_PER_GENERATION,
  REMOVE_BG_PRICE_USD,
} from "../../../lib/generation-settings";
import {
  getTemplate,
  recordTestGeneration,
  releaseTestGenerationQuota,
} from "../../templates/templates.server";
import {
  buildUsageChargeIdempotencyKey,
  recordUsageCharge,
} from "../../shopify/billing.server";
import { usdToMills } from "../../shopify/billing-guardrails";
import { checkBillableActionAllowed } from "../../shopify/billing-guardrails.server";
import logger from "../../../lib/logger";
import type { GenerationOutput } from "../../fal/types";

export type TemplateTestGenerateResult = {
  results: Array<{
    url: string;
    generation_time_seconds: number | null;
    cost_usd: number;
    generation_cost_usd?: number;
    remove_bg_cost_usd?: number;
    seed?: number;
  }>;
  total_time_seconds: number;
  total_cost_usd: number;
  generation_cost_usd: number;
  remove_bg_cost_usd: number;
};

const mapGenerationResult = (
  output: GenerationOutput,
): TemplateTestGenerateResult => {
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

const mapRemoveBackgroundResult = (
  payload: TemplateTestRemoveBackgroundPayload,
  removeBgTotalCost: number,
  removeBgTotalTimeSeconds: number,
  removeBgResults: Array<{ imageUrl: string; costUsd: number }>,
): TemplateTestGenerateResult => {
  const images = payload.generated_images.map((image, index) => {
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
  });

  return {
    results: images,
    total_time_seconds:
      payload.generation_total_time_seconds + removeBgTotalTimeSeconds,
    total_cost_usd:
      payload.generation_total_cost_usd + Number(removeBgTotalCost.toFixed(3)),
    generation_cost_usd: payload.generation_total_cost_usd,
    remove_bg_cost_usd: Number(removeBgTotalCost.toFixed(3)),
  };
};

export const templateTestFakeGenerate = inngest.createFunction(
  {
    id: "templates/test-fake-generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "templates/test.fake_generate.requested" },
  async ({ event, step }) => {
    const parsed = templateTestFakeGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid fake generation payload",
      );
      throw new NonRetriableError("Invalid fake generation payload");
    }

    const payload: TemplateTestFakeGeneratePayload = parsed.data;
    const usageIdempotencyId = event.id ?? payload.template_id;

    const template = await step.run("load-template", async () =>
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

    await step.run("record-test-generation", async () =>
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

    await step.run("record-test-usage-ledger", async () =>
      recordUsageCharge({
        shopId: payload.shop_id,
        totalCostUsd: fakeResult.totalCostUsd,
        idempotencyKey: buildUsageChargeIdempotencyKey(
          "template_test_fake_generate",
          usageIdempotencyId,
        ),
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
  },
);

export const templateTestGenerate = inngest.createFunction(
  {
    id: "templates/test-generate",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "templates/test.generate.requested" },
  async ({ event, step }) => {
    const parsed = templateTestGeneratePayloadSchema.safeParse(event.data);
    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid test generation payload",
      );
      throw new NonRetriableError("Invalid test generation payload");
    }

    const payload: TemplateTestGeneratePayload = parsed.data;
    const usageIdempotencyId =
      event.id ?? `${payload.shop_id}:${payload.template_id}`;

    const template = await step.run("load-template", async () =>
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

    // Check billing guardrails before incurring costs
    const estimatedCostUsd =
      MVP_PRICE_USD_PER_GENERATION * payload.num_images +
      (payload.remove_background_enabled
        ? REMOVE_BG_PRICE_USD * payload.num_images
        : 0);

    await step.run("check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedCostUsd),
      });

      if (!check.allowed) {
        throw new NonRetriableError(check.message);
      }
    });

    const generationResult = await step.run("generate-images", async () =>
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

      await step.run("record-test-generation", async () =>
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

      await step.run("record-test-usage-ledger", async () =>
        recordUsageCharge({
          shopId: payload.shop_id,
          totalCostUsd: generationResult.totalCostUsd,
          idempotencyKey: buildUsageChargeIdempotencyKey(
            "template_test_generate",
            usageIdempotencyId,
          ),
          description: "template_test_generate",
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

    const nextPayload = templateTestRemoveBackgroundPayloadSchema.parse({
      shop_id: payload.shop_id,
      template_id: payload.template_id,
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

    const { ids } = await step.sendEvent("queue-remove-background", {
      name: "templates/test.remove_background.requested",
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
  },
);

export const templateTestRemoveBackground = inngest.createFunction(
  {
    id: "templates/test-remove-background",
    concurrency: {
      key: "event.data.shop_id",
      limit: 2,
    },
  },
  { event: "templates/test.remove_background.requested" },
  async ({ event, step }) => {
    const parsed = templateTestRemoveBackgroundPayloadSchema.safeParse(
      event.data,
    );

    if (!parsed.success) {
      logger.warn(
        { errors: parsed.error.flatten().fieldErrors },
        "Invalid remove background payload",
      );
      throw new NonRetriableError("Invalid remove background payload");
    }

    const payload = parsed.data;
    const usageIdempotencyId =
      event.id ?? `${payload.shop_id}:${payload.template_id}`;

    // Check billing guardrails before incurring costs
    const estimatedRemoveBgCostUsd =
      REMOVE_BG_PRICE_USD * payload.generated_images.length;

    await step.run("check-billing-guardrails", async () => {
      const check = await checkBillableActionAllowed({
        shopId: payload.shop_id,
        costMills: usdToMills(estimatedRemoveBgCostUsd),
      });

      if (!check.allowed) {
        throw new NonRetriableError(check.message);
      }
    });

    const removeBgResults = await step.run("remove-background", async () =>
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

    const finalResult = mapRemoveBackgroundResult(
      payload,
      removeBgTotalCost,
      removeBgTotalTimeSeconds,
      removeBgResults,
    );

    await step.run("record-test-generation", async () =>
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

    await step.run("record-test-usage-ledger", async () =>
      recordUsageCharge({
        shopId: payload.shop_id,
        totalCostUsd: finalResult.total_cost_usd,
        idempotencyKey: buildUsageChargeIdempotencyKey(
          "template_test_remove_background",
          usageIdempotencyId,
        ),
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

export const templateTestGenerateFailure = inngest.createFunction(
  { id: "templates/test-generate-failure" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    const isTestGenerate = event.data.function_id === "templates/test-generate";
    const isFakeGenerate =
      event.data.function_id === "templates/test-fake-generate";
    const isRemoveBg =
      event.data.function_id === "templates/test-remove-background";

    if (!isTestGenerate && !isFakeGenerate && !isRemoveBg) {
      return { ignored: true };
    }

    const payload = isRemoveBg
      ? templateTestRemoveBackgroundPayloadSchema.safeParse(
          event.data.event.data,
        )
      : isFakeGenerate
        ? templateTestFakeGeneratePayloadSchema.safeParse(event.data.event.data)
        : templateTestGeneratePayloadSchema.safeParse(event.data.event.data);

    if (!payload.success) {
      logger.warn(
        {
          errors: payload.error.flatten().fieldErrors,
        },
        "Missing payload data for quota release",
      );
      return { skipped: true };
    }

    await step.run("release-test-generation-quota", async () =>
      releaseTestGenerationQuota(
        payload.data.template_id,
        payload.data.shop_id,
        payload.data.num_images,
      ),
    );

    await step.run("record-test-generation-failure", async () =>
      recordTestGeneration({
        templateId: payload.data.template_id,
        shopId: payload.data.shop_id,
        numImagesRequested: payload.data.num_images,
        numImagesGenerated: 0,
        totalCostUsd: 0,
        totalTimeSeconds: 0,
        success: false,
        errorMessage: event.data.error?.message,
      }),
    );

    logger.error(
      {
        shop_id: payload.data.shop_id,
        template_id: payload.data.template_id,
        error: event.data.error?.message,
      },
      "Template test generation failed",
    );

    return { recovered: true };
  },
);

export const inngestFunctions = [
  templateTestFakeGenerate,
  templateTestGenerate,
  templateTestRemoveBackground,
  templateTestGenerateFailure,
];
