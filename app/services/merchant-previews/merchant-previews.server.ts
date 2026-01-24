import { Prisma } from "@prisma/client";
import prisma from "../../db.server";
import type { MerchantPreviewStatus } from "@prisma/client";

export type MerchantPreviewRecord = {
  id: string;
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  status: MerchantPreviewStatus;
  coverPrintArea: boolean;
  testImageUrl: string;
  testText: string | null;
  variableValues: Record<string, string>;
  designUrl: string | null;
  mockupUrls: string[];
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMerchantPreviewInput = {
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  coverPrintArea: boolean;
  testImageUrl: string;
  testText?: string | null;
  variableValues: Record<string, string>;
};

export type UpdateMerchantPreviewInput = {
  jobId: string;
  shopId: string;
  status: MerchantPreviewStatus;
  designUrl?: string | null;
  mockupUrls?: string[] | null;
  errorMessage?: string | null;
};

const normalizeMockupUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

const normalizeVariableValues = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" ? entry : String(entry ?? ""),
    ]),
  );
};

const mapMerchantPreview = (record: {
  id: string;
  job_id: string;
  shop_id: string;
  product_id: string;
  template_id: string;
  status: MerchantPreviewStatus;
  cover_print_area: boolean;
  test_image_url: string;
  test_text: string | null;
  variable_values: unknown;
  design_url: string | null;
  mockup_urls: unknown;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}): MerchantPreviewRecord => ({
  id: record.id,
  jobId: record.job_id,
  shopId: record.shop_id,
  productId: record.product_id,
  templateId: record.template_id,
  status: record.status,
  coverPrintArea: record.cover_print_area,
  testImageUrl: record.test_image_url,
  testText: record.test_text,
  variableValues: normalizeVariableValues(record.variable_values),
  designUrl: record.design_url,
  mockupUrls: normalizeMockupUrls(record.mockup_urls),
  errorMessage: record.error_message,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const createMerchantPreview = async (
  input: CreateMerchantPreviewInput,
): Promise<MerchantPreviewRecord> => {
  const record = await prisma.merchantPreview.create({
    data: {
      job_id: input.jobId,
      shop_id: input.shopId,
      product_id: input.productId,
      template_id: input.templateId,
      status: "queued",
      cover_print_area: input.coverPrintArea,
      test_image_url: input.testImageUrl,
      test_text: input.testText ?? null,
      variable_values: input.variableValues,
      design_url: null,
      mockup_urls: Prisma.DbNull,
      error_message: null,
    },
  });

  return mapMerchantPreview(record);
};

export const updateMerchantPreview = async (
  input: UpdateMerchantPreviewInput,
): Promise<MerchantPreviewRecord | null> => {
  const record = await prisma.merchantPreview.update({
    where: {
      shop_id_job_id: {
        shop_id: input.shopId,
        job_id: input.jobId,
      },
    },
    data: {
      status: input.status,
      design_url: input.designUrl ?? undefined,
      mockup_urls: input.mockupUrls ?? undefined,
      error_message: input.errorMessage ?? undefined,
    },
  });

  return mapMerchantPreview(record);
};

export const getMerchantPreviewByJobId = async (
  shopId: string,
  jobId: string,
): Promise<MerchantPreviewRecord | null> => {
  const record = await prisma.merchantPreview.findUnique({
    where: {
      shop_id_job_id: {
        shop_id: shopId,
        job_id: jobId,
      },
    },
  });

  return record ? mapMerchantPreview(record) : null;
};
