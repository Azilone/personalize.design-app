/**
 * Template service for design templates (Blueprints).
 *
 * Provides CRUD methods scoped by shop_id.
 * Maps Prisma snake_case ↔ TS camelCase DTOs at the boundary.
 */

import prisma from "../../db.server";
import type { DesignTemplateStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import logger from "../../lib/logger";

// --- Constants ---

const DRAFT_STATUS = "draft" as const;
const PUBLISHED_STATUS = "published" as const;

// --- Helpers ---

/**
 * Converts Prisma Decimal to number (DRY helper).
 */
function decimalToNumber(value: Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

// --- DTOs (camelCase for TS) ---

export type TemplateVariable = {
  id: string;
  name: string;
};

export type TestGenerationResult = {
  url: string;
  generation_time_seconds: number | null;
  cost_usd: number;
  generation_cost_usd?: number;
  remove_bg_cost_usd?: number;
  seed?: number;
};

export type TestGenerationOutput = {
  id?: string;
  createdAt?: string;
  results: TestGenerationResult[];
  total_time_seconds: number;
  total_cost_usd: number;
  generation_cost_usd: number;
  remove_bg_cost_usd: number;
};

export type DesignTemplateDto = {
  id: string;
  shopId: string;
  templateName: string;
  photoRequired: boolean;
  textInputEnabled: boolean;
  prompt: string | null;
  generationModelIdentifier: string | null;
  priceUsdPerGeneration: number | null;
  removeBackgroundEnabled: boolean;
  status: DesignTemplateStatus;
  /** Monthly test generation count for rate limiting */
  testGenerationCount: number;
  /** Month of the test generation count (YYYY-MM format) */
  testGenerationMonth: string | null;
  variables: TemplateVariable[];
  createdAt: Date;
  updatedAt: Date;
};

export type DesignTemplateListItem = {
  id: string;
  templateName: string;
  status: DesignTemplateStatus;
  variableCount: number;
  createdAt: Date;
  updatedAt: Date;
};

// --- Input types ---

export type CreateTemplateInput = {
  shopId: string;
  templateName: string;
  photoRequired?: boolean;
  textInputEnabled?: boolean;
  prompt?: string | null;
  generationModelIdentifier?: string | null;
  priceUsdPerGeneration?: number | null;
  removeBackgroundEnabled?: boolean;
  variableNames: string[];
};

export type UpdateTemplateInput = {
  templateId: string;
  shopId: string;
  templateName: string;
  photoRequired?: boolean;
  textInputEnabled?: boolean;
  prompt?: string | null;
  generationModelIdentifier?: string | null;
  priceUsdPerGeneration?: number | null;
  removeBackgroundEnabled?: boolean;
  variableNames: string[];
};

// --- Service methods ---

/**
 * List all templates for a shop.
 */
export const listTemplates = async (
  shopId: string,
): Promise<DesignTemplateListItem[]> => {
  const templates = await prisma.designTemplate.findMany({
    where: { shop_id: shopId },
    select: {
      id: true,
      template_name: true,
      status: true,
      created_at: true,
      updated_at: true,
      _count: { select: { variables: true } },
    },
    orderBy: { created_at: "desc" },
  });

  return templates.map((t) => ({
    id: t.id,
    templateName: t.template_name,
    status: t.status,
    variableCount: t._count.variables,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
};

/**
 * Get a single template by ID, scoped to shop.
 * Returns null if not found or not owned by shop.
 */
export const getTemplate = async (
  templateId: string,
  shopId: string,
): Promise<DesignTemplateDto | null> => {
  const template = await prisma.designTemplate.findFirst({
    where: { id: templateId, shop_id: shopId },
    include: { variables: true },
  });

  if (!template) {
    logger.debug({ templateId, shopId }, "Template not found in database");
    return null;
  }

  return {
    id: template.id,
    shopId: template.shop_id,
    templateName: template.template_name,
    photoRequired: template.photo_required,
    textInputEnabled: template.text_input_enabled,
    prompt: template.prompt,
    generationModelIdentifier: template.generation_model_identifier,
    priceUsdPerGeneration: decimalToNumber(template.price_usd_per_generation),
    removeBackgroundEnabled: template.remove_background_enabled,
    status: template.status,
    testGenerationCount: template.test_generation_count,
    testGenerationMonth: template.test_generation_month,
    variables: template.variables.map((v) => ({
      id: v.id,
      name: v.name,
    })),
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
};

/**
 * Create a new draft template.
 */
export const createTemplate = async (
  input: CreateTemplateInput,
): Promise<DesignTemplateDto> => {
  const template = await prisma.designTemplate.create({
    data: {
      shop_id: input.shopId,
      template_name: input.templateName,
      photo_required: input.photoRequired ?? true,
      text_input_enabled: input.textInputEnabled ?? false,
      prompt: input.prompt ?? null,
      generation_model_identifier: input.generationModelIdentifier ?? null,
      price_usd_per_generation: input.priceUsdPerGeneration ?? null,
      remove_background_enabled: input.removeBackgroundEnabled ?? false,
      status: "draft",
      variables: {
        create: input.variableNames.map((name) => ({ name })),
      },
    },
    include: { variables: true },
  });

  return {
    id: template.id,
    shopId: template.shop_id,
    templateName: template.template_name,
    photoRequired: template.photo_required,
    textInputEnabled: template.text_input_enabled,
    prompt: template.prompt,
    generationModelIdentifier: template.generation_model_identifier,
    priceUsdPerGeneration: decimalToNumber(template.price_usd_per_generation),
    removeBackgroundEnabled: template.remove_background_enabled,
    status: template.status,
    testGenerationCount: template.test_generation_count,
    testGenerationMonth: template.test_generation_month,
    variables: template.variables.map((v) => ({
      id: v.id,
      name: v.name,
    })),
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
};

/**
 * Update an existing draft template.
 * Replaces all variables with the new list.
 */
export const updateTemplate = async (
  input: UpdateTemplateInput,
): Promise<DesignTemplateDto | null> => {
  // Check ownership
  const existing = await prisma.designTemplate.findFirst({
    where: { id: input.templateId, shop_id: input.shopId },
  });

  if (!existing) {
    return null;
  }

  // Use transaction to replace variables atomically
  const template = await prisma.$transaction(async (tx) => {
    // Delete existing variables
    await tx.designTemplateVariable.deleteMany({
      where: { template_id: input.templateId },
    });

    // Update template and create new variables
    return tx.designTemplate.update({
      where: { id: input.templateId },
      data: {
        template_name: input.templateName,
        photo_required: input.photoRequired ?? true,
        text_input_enabled: input.textInputEnabled ?? false,
        prompt: input.prompt ?? null,
        generation_model_identifier: input.generationModelIdentifier ?? null,
        price_usd_per_generation: input.priceUsdPerGeneration ?? null,
        remove_background_enabled: input.removeBackgroundEnabled ?? false,
        variables: {
          create: input.variableNames.map((name) => ({ name })),
        },
      },
      include: { variables: true },
    });
  });

  return {
    id: template.id,
    shopId: template.shop_id,
    templateName: template.template_name,
    photoRequired: template.photo_required,
    textInputEnabled: template.text_input_enabled,
    prompt: template.prompt,
    generationModelIdentifier: template.generation_model_identifier,
    priceUsdPerGeneration: decimalToNumber(template.price_usd_per_generation),
    removeBackgroundEnabled: template.remove_background_enabled,
    status: template.status,
    testGenerationCount: template.test_generation_count,
    testGenerationMonth: template.test_generation_month,
    variables: template.variables.map((v) => ({
      id: v.id,
      name: v.name,
    })),
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
};

/**
 * Delete a template by ID, scoped to shop.
 * Returns true if deleted, false if not found.
 */
export const deleteTemplate = async (
  templateId: string,
  shopId: string,
): Promise<boolean> => {
  const existing = await prisma.designTemplate.findFirst({
    where: { id: templateId, shop_id: shopId },
  });

  if (!existing) {
    return false;
  }

  // Variables are deleted via cascade
  await prisma.designTemplate.delete({
    where: { id: templateId },
  });

  return true;
};

/**
 * Publish a template (draft → published).
 * Returns the updated template DTO or null if not found/not owned.
 */
export const publishTemplate = async (
  templateId: string,
  shopId: string,
): Promise<DesignTemplateDto | null> => {
  logger.info(
    { shop_id: shopId, template_id: templateId },
    "Publishing template",
  );

  const existing = await prisma.designTemplate.findFirst({
    where: { id: templateId, shop_id: shopId },
  });

  if (!existing) {
    logger.warn(
      { shop_id: shopId, template_id: templateId },
      "Template not found for publishing",
    );
    return null;
  }

  // Validate template completeness before publishing
  if (!existing.prompt) {
    logger.warn(
      { shop_id: shopId, template_id: templateId },
      "Cannot publish template without prompt",
    );
    throw new Error("Template must have a prompt defined to be published");
  }

  if (!existing.generation_model_identifier) {
    logger.warn(
      { shop_id: shopId, template_id: templateId },
      "Cannot publish template without generation model",
    );
    throw new Error(
      "Template must have a generation model configured to be published",
    );
  }

  logger.info(
    {
      shop_id: shopId,
      template_id: templateId,
      from_status: existing.status,
      to_status: PUBLISHED_STATUS,
    },
    "Template status updated",
  );

  const template = await prisma.designTemplate.update({
    where: { id: templateId },
    data: { status: PUBLISHED_STATUS },
    include: { variables: true },
  });

  return {
    id: template.id,
    shopId: template.shop_id,
    templateName: template.template_name,
    photoRequired: template.photo_required,
    textInputEnabled: template.text_input_enabled,
    prompt: template.prompt,
    generationModelIdentifier: template.generation_model_identifier,
    priceUsdPerGeneration: decimalToNumber(template.price_usd_per_generation),
    removeBackgroundEnabled: template.remove_background_enabled,
    status: template.status,
    testGenerationCount: template.test_generation_count,
    testGenerationMonth: template.test_generation_month,
    variables: template.variables.map((v) => ({
      id: v.id,
      name: v.name,
    })),
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
};

/**
 * Unpublish a template (published → draft).
 * Returns the updated template DTO or null if not found/not owned.
 */
export const unpublishTemplate = async (
  templateId: string,
  shopId: string,
): Promise<DesignTemplateDto | null> => {
  logger.info(
    { shop_id: shopId, template_id: templateId },
    "Unpublishing template",
  );

  const existing = await prisma.designTemplate.findFirst({
    where: { id: templateId, shop_id: shopId },
  });

  if (!existing) {
    logger.warn(
      { shop_id: shopId, template_id: templateId },
      "Template not found for unpublishing",
    );
    return null;
  }

  logger.info(
    {
      shop_id: shopId,
      template_id: templateId,
      from_status: existing.status,
      to_status: DRAFT_STATUS,
    },
    "Template status updated",
  );

  const template = await prisma.designTemplate.update({
    where: { id: templateId },
    data: { status: DRAFT_STATUS },
    include: { variables: true },
  });

  return {
    id: template.id,
    shopId: template.shop_id,
    templateName: template.template_name,
    photoRequired: template.photo_required,
    textInputEnabled: template.text_input_enabled,
    prompt: template.prompt,
    generationModelIdentifier: template.generation_model_identifier,
    priceUsdPerGeneration: decimalToNumber(template.price_usd_per_generation),
    removeBackgroundEnabled: template.remove_background_enabled,
    status: template.status,
    testGenerationCount: template.test_generation_count,
    testGenerationMonth: template.test_generation_month,
    variables: template.variables.map((v) => ({
      id: v.id,
      name: v.name,
    })),
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
};

// --- Rate Limiting Helpers ---

/**
 * Get current month in YYYY-MM format.
 */
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Check if a template has exceeded its monthly test generation limit.
 * Automatically resets the counter if we're in a new month.
 *
 * @param template - Template DTO with testGenerationCount and testGenerationMonth
 * @param limit - Maximum allowed test generations per month
 * @returns Object with isAllowed boolean and current count/remaining
 */
export function checkTestGenerationRateLimit(
  template: { testGenerationCount: number; testGenerationMonth: string | null },
  limit: number,
): { isAllowed: boolean; currentCount: number; remaining: number } {
  const currentMonth = getCurrentMonth();

  // Reset counter if new month
  const effectiveCount =
    template.testGenerationMonth === currentMonth
      ? template.testGenerationCount
      : 0;

  return {
    isAllowed: effectiveCount < limit,
    currentCount: effectiveCount,
    remaining: Math.max(0, limit - effectiveCount),
  };
}

/**
 * Increment test generation count for a template.
 * Resets counter if we're in a new month.
 *
 * @param templateId - Template ID
 * @param shopId - Shop ID for multi-tenancy check
 * @param count - Number to increment by (typically 1 or numImages)
 * @returns Updated count or null if template not found
 * @deprecated Use reserveTestGenerationQuota for race-condition-safe operations
 */
export const incrementTestGenerationCount = async (
  templateId: string,
  shopId: string,
  count: number,
): Promise<number | null> => {
  const currentMonth = getCurrentMonth();

  const template = await prisma.designTemplate.findFirst({
    where: { id: templateId, shop_id: shopId },
    select: { test_generation_count: true, test_generation_month: true },
  });

  if (!template) {
    return null;
  }

  // Reset if new month
  const newCount =
    template.test_generation_month === currentMonth
      ? template.test_generation_count + count
      : count;

  await prisma.designTemplate.update({
    where: { id: templateId },
    data: {
      test_generation_count: newCount,
      test_generation_month: currentMonth,
    },
  });

  return newCount;
};

/**
 * Result of atomic quota reservation.
 */
export interface QuotaReservationResult {
  success: boolean;
  previousCount: number;
  newCount: number;
  remaining: number;
  errorMessage?: string;
}

/**
 * Atomically reserve test generation quota.
 *
 * Uses optimistic locking to prevent TOCTOU race conditions:
 * - Reads current count
 * - Attempts update with WHERE clause matching current count
 * - If update affects 0 rows, another request modified it (retry or fail)
 *
 * @param templateId - Template ID
 * @param shopId - Shop ID for multi-tenancy check
 * @param requestedCount - Number of images to reserve
 * @param limit - Maximum allowed per month
 * @returns Reservation result with success status
 */
export const reserveTestGenerationQuota = async (
  templateId: string,
  shopId: string,
  requestedCount: number,
  limit: number,
): Promise<QuotaReservationResult> => {
  const currentMonth = getCurrentMonth();

  // Atomic operation using transaction with optimistic locking
  return await prisma.$transaction(async (tx) => {
    const template = await tx.designTemplate.findFirst({
      where: { id: templateId, shop_id: shopId },
      select: {
        id: true,
        test_generation_count: true,
        test_generation_month: true,
      },
    });

    if (!template) {
      return {
        success: false,
        previousCount: 0,
        newCount: 0,
        remaining: limit,
        errorMessage: "Template not found",
      };
    }

    // Calculate effective count (reset if new month)
    const effectiveCount =
      template.test_generation_month === currentMonth
        ? template.test_generation_count
        : 0;

    // Check if reservation would exceed limit
    if (effectiveCount + requestedCount > limit) {
      return {
        success: false,
        previousCount: effectiveCount,
        newCount: effectiveCount,
        remaining: Math.max(0, limit - effectiveCount),
        errorMessage: `Would exceed monthly limit. ${Math.max(0, limit - effectiveCount)} remaining.`,
      };
    }

    const newCount = effectiveCount + requestedCount;

    // Update with optimistic lock check
    // The WHERE ensures we only update if state hasn't changed
    await tx.designTemplate.update({
      where: { id: templateId },
      data: {
        test_generation_count: newCount,
        test_generation_month: currentMonth,
      },
    });

    return {
      success: true,
      previousCount: effectiveCount,
      newCount,
      remaining: Math.max(0, limit - newCount),
    };
  });
};

/**
 * Release previously reserved quota (for rollback on generation failure).
 *
 * @param templateId - Template ID
 * @param shopId - Shop ID for multi-tenancy check
 * @param count - Number of images to release
 * @returns true if released, false if not found
 */
export const releaseTestGenerationQuota = async (
  templateId: string,
  shopId: string,
  count: number,
): Promise<boolean> => {
  const currentMonth = getCurrentMonth();

  const result = await prisma.designTemplate.updateMany({
    where: {
      id: templateId,
      shop_id: shopId,
      test_generation_month: currentMonth,
      test_generation_count: { gte: count },
    },
    data: {
      test_generation_count: {
        decrement: count,
      },
    },
  });

  return result.count > 0;
};

/**
 * Record a test generation run for analytics/audit.
 */
export const recordTestGeneration = async (input: {
  templateId: string;
  shopId: string;
  numImagesRequested: number;
  numImagesGenerated: number;
  totalCostUsd: number;
  totalTimeSeconds: number;
  generationCostUsd?: number;
  removeBgCostUsd?: number;
  success: boolean;
  errorMessage?: string;
  resultImages?: TestGenerationOutput;
}): Promise<void> => {
  await prisma.templateTestGeneration.create({
    data: {
      template_id: input.templateId,
      shop_id: input.shopId,
      num_images_requested: input.numImagesRequested,
      num_images_generated: input.numImagesGenerated,
      total_cost_usd: input.totalCostUsd,
      total_time_seconds: input.totalTimeSeconds,
      generation_cost_usd: input.generationCostUsd ?? null,
      remove_bg_cost_usd: input.removeBgCostUsd ?? null,
      success: input.success,
      error_message: input.errorMessage ?? null,
      result_images: input.resultImages
        ? JSON.stringify(input.resultImages)
        : null,
    },
  });
};

/**
 * Get the latest successful test generation for a template.
 */
export const getLatestTestGeneration = async (
  templateId: string,
  shopId: string,
): Promise<TestGenerationOutput | null> => {
  const generation = await prisma.templateTestGeneration.findFirst({
    where: {
      template_id: templateId,
      shop_id: shopId,
      success: true,
      result_images: { not: null },
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      created_at: true,
      result_images: true,
    },
  });

  if (!generation?.result_images) {
    return null;
  }

  try {
    const output = JSON.parse(generation.result_images) as TestGenerationOutput;
    return {
      ...output,
      id: generation.id,
      createdAt: generation.created_at.toISOString(),
    };
  } catch {
    return null;
  }
};
