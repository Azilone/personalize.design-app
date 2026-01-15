/**
 * Template service for design templates (Blueprints).
 *
 * Provides CRUD methods scoped by shop_id.
 * Maps Prisma snake_case ↔ TS camelCase DTOs at the boundary.
 */

import prisma from "../../db.server";
import type { DesignTemplateStatus } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

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

export type DesignTemplateDto = {
  id: string;
  shopId: string;
  templateName: string;
  photoRequired: boolean;
  textInputEnabled: boolean;
  prompt: string | null;
  generationModelIdentifier: string | null;
  priceUsdPerGeneration: number | null;
  status: DesignTemplateStatus;
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
    status: template.status,
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
    status: template.status,
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
    status: template.status,
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
