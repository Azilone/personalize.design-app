import { generateImages } from "../fal/generate.server";
import { uploadFileAndGetReadUrl } from "../supabase/storage";
import type { GenerationInput, GenerationOutput } from "../fal/types";
import { MVP_GENERATION_MODEL_ID } from "../../lib/generation-settings";
import { buildPlaceholderUrl } from "../../lib/placeholder-images";
import logger from "../../lib/logger";

export type GenerateImageParams = {
  imageUrl: string;
  prompt: string;
  modelId?: string;
  removeBackground?: boolean;
  imageSize: { width: number; height: number };
  aspectRatio?: GenerationInput["aspectRatio"];
  shopId: string;
};

export type GenerateImageResult = {
  designUrl: string;
  storageKey: string;
  readUrl: string;
  costUsd: number;
  generation: GenerationOutput;
};

const resolveImageFilename = (url: string, fallback: string): string => {
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

export const generateImage = async (
  params: GenerateImageParams,
): Promise<GenerateImageResult> => {
  const generation = await generateImages({
    modelId: params.modelId ?? MVP_GENERATION_MODEL_ID,
    imageUrls: [params.imageUrl],
    prompt: params.prompt,
    numImages: 1,
    imageSize: params.imageSize,
    aspectRatio: params.aspectRatio,
    shopId: params.shopId,
    removeBackgroundEnabled: params.removeBackground ?? false,
  });

  const designUrl = generation.images[0]?.url;
  if (!designUrl) {
    throw new Error("No design was generated.");
  }

  const response = await fetch(designUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const filename = resolveImageFilename(designUrl, `preview-${Date.now()}.png`);
  const contentType = resolveContentType(response.headers.get("content-type"));

  const stored = await uploadFileAndGetReadUrl(
    params.shopId,
    filename,
    arrayBuffer.byteLength,
    Buffer.from(arrayBuffer),
    contentType,
  );

  return {
    designUrl: stored.readUrl,
    storageKey: stored.storageKey,
    readUrl: stored.readUrl,
    costUsd: generation.totalCostUsd,
    generation,
  };
};

export type GenerateFakeImageParams = {
  imageSize: { width: number; height: number };
  shopId: string;
  text?: string;
};

export type GenerateFakeImageResult = {
  designUrl: string;
  storageKey: string;
  readUrl: string;
  costUsd: number;
};

/**
 * Generate a fake placeholder image and upload to Supabase Storage.
 * This is 1:1 with real generation except it doesn't call fal.ai.
 * Used for development/testing to avoid fal.ai costs.
 */
export const generateFakeImage = async (
  params: GenerateFakeImageParams,
): Promise<GenerateFakeImageResult> => {
  const placeholderUrl = buildPlaceholderUrl(params.imageSize);
  const textParam = params.text
    ? `?text=${encodeURIComponent(params.text)}`
    : "";
  const fullUrl = `${placeholderUrl}${textParam}`;

  logger.info(
    {
      shop_id: params.shopId,
      placeholder_url: fullUrl,
      image_size: params.imageSize,
    },
    "Generating fake image from placeholder",
  );

  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch placeholder image (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const filename = `fake-preview-${Date.now()}.png`;
  const contentType = response.headers.get("content-type") ?? "image/png";

  const stored = await uploadFileAndGetReadUrl(
    params.shopId,
    filename,
    arrayBuffer.byteLength,
    Buffer.from(arrayBuffer),
    contentType,
  );

  logger.info(
    {
      shop_id: params.shopId,
      storage_key: stored.storageKey,
    },
    "Fake image uploaded to storage",
  );

  return {
    designUrl: stored.readUrl,
    storageKey: stored.storageKey,
    readUrl: stored.readUrl,
    costUsd: 0, // Fake generation has no cost
  };
};
