import {
  Prisma,
  type PreviewJobStatus,
  type PreviewJobType,
} from "@prisma/client";
import prisma from "../../db.server";

export type CreatePreviewJobParams = {
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  type: PreviewJobType;
  sessionId?: string;
  inputImageUrl?: string;
  inputText?: string;
  variableValues?: Record<string, string>;
  coverPrintArea?: boolean;
};

export type UpdatePreviewJobParams = {
  jobId: string;
  shopId: string;
  status: PreviewJobStatus;
  designUrl?: string | null;
  designStorageKey?: string | null;
  mockupUrls?: string[] | null;
  tempPrintifyProductId?: string | null;
  errorMessage?: string | null;
};

export type PreviewJobRecord = {
  id: string;
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  type: PreviewJobType;
  inputImageUrl: string | null;
  inputText: string | null;
  variableValues: Record<string, string>;
  coverPrintArea: boolean;
  designUrl: string | null;
  designStorageKey: string | null;
  mockupUrls: string[];
  tempPrintifyProductId: string | null;
  sessionId: string | null;
  status: PreviewJobStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
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

const mapPreviewJob = (record: {
  id: string;
  job_id: string;
  shop_id: string;
  product_id: string;
  template_id: string;
  type: PreviewJobType;
  input_image_url: string | null;
  input_text: string | null;
  variable_values: unknown;
  cover_print_area: boolean;
  design_url: string | null;
  design_storage_key: string | null;
  mockup_urls: unknown;
  temp_printify_product_id: string | null;
  session_id: string | null;
  status: PreviewJobStatus;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}): PreviewJobRecord => ({
  id: record.id,
  jobId: record.job_id,
  shopId: record.shop_id,
  productId: record.product_id,
  templateId: record.template_id,
  type: record.type,
  inputImageUrl: record.input_image_url,
  inputText: record.input_text,
  variableValues: normalizeVariableValues(record.variable_values),
  coverPrintArea: record.cover_print_area,
  designUrl: record.design_url,
  designStorageKey: record.design_storage_key,
  mockupUrls: normalizeMockupUrls(record.mockup_urls),
  tempPrintifyProductId: record.temp_printify_product_id,
  sessionId: record.session_id,
  status: record.status,
  errorMessage: record.error_message,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const createPreviewJob = async (
  params: CreatePreviewJobParams,
): Promise<PreviewJobRecord> => {
  const existing = await prisma.previewJob.findUnique({
    where: {
      shop_id_job_id: {
        shop_id: params.shopId,
        job_id: params.jobId,
      },
    },
  });

  if (existing) {
    return mapPreviewJob(existing);
  }

  const record = await prisma.previewJob.create({
    data: {
      job_id: params.jobId,
      shop_id: params.shopId,
      product_id: params.productId,
      template_id: params.templateId,
      type: params.type,
      input_image_url: params.inputImageUrl ?? null,
      input_text: params.inputText ?? null,
      variable_values: params.variableValues ?? Prisma.DbNull,
      cover_print_area: params.coverPrintArea ?? false,
      design_url: null,
      design_storage_key: null,
      mockup_urls: Prisma.DbNull,
      temp_printify_product_id: null,
      session_id: params.sessionId ?? null,
      status: "queued",
      error_message: null,
    },
  });

  return mapPreviewJob(record);
};

export const updatePreviewJob = async (
  params: UpdatePreviewJobParams,
): Promise<PreviewJobRecord | null> => {
  const record = await prisma.previewJob.update({
    where: {
      shop_id_job_id: {
        shop_id: params.shopId,
        job_id: params.jobId,
      },
    },
    data: {
      status: params.status,
      design_url: params.designUrl ?? undefined,
      design_storage_key: params.designStorageKey ?? undefined,
      mockup_urls:
        params.mockupUrls === null
          ? Prisma.DbNull
          : (params.mockupUrls ?? undefined),
      temp_printify_product_id: params.tempPrintifyProductId ?? undefined,
      error_message: params.errorMessage ?? undefined,
    },
  });

  return mapPreviewJob(record);
};

export const getPreviewJobById = async (
  shopId: string,
  jobId: string,
): Promise<PreviewJobRecord | null> => {
  const record = await prisma.previewJob.findUnique({
    where: {
      shop_id_job_id: {
        shop_id: shopId,
        job_id: jobId,
      },
    },
  });

  return record ? mapPreviewJob(record) : null;
};
