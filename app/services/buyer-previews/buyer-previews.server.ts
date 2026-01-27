import type { BuyerPreviewStatus } from "@prisma/client";
import prisma from "../../db.server";

export type BuyerPreviewJobRecord = {
  id: string;
  shopId: string;
  productId: string;
  templateId: string;
  buyerSessionId: string;
  status: BuyerPreviewStatus;
  previewStorageKey: string | null;
  previewUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateBuyerPreviewJobInput = {
  jobId: string;
  shopId: string;
  productId: string;
  templateId: string;
  buyerSessionId: string;
};

export type UpdateBuyerPreviewJobInput = {
  jobId: string;
  shopId: string;
  status: BuyerPreviewStatus;
  previewStorageKey?: string | null;
  previewUrl?: string | null;
  errorMessage?: string | null;
};

const mapBuyerPreviewJob = (record: {
  id: string;
  shop_id: string;
  product_id: string;
  template_id: string;
  buyer_session_id: string;
  status: BuyerPreviewStatus;
  preview_storage_key: string | null;
  preview_url: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}): BuyerPreviewJobRecord => ({
  id: record.id,
  shopId: record.shop_id,
  productId: record.product_id,
  templateId: record.template_id,
  buyerSessionId: record.buyer_session_id,
  status: record.status,
  previewStorageKey: record.preview_storage_key,
  previewUrl: record.preview_url,
  errorMessage: record.error_message,
  createdAt: record.created_at,
  updatedAt: record.updated_at,
});

export const createBuyerPreviewJob = async (
  input: CreateBuyerPreviewJobInput,
): Promise<BuyerPreviewJobRecord> => {
  const existing = await prisma.buyerPreviewJob.findUnique({
    where: {
      shop_id_id: {
        shop_id: input.shopId,
        id: input.jobId,
      },
    },
  });

  if (existing) {
    return mapBuyerPreviewJob(existing);
  }

  const record = await prisma.buyerPreviewJob.create({
    data: {
      id: input.jobId,
      shop_id: input.shopId,
      product_id: input.productId,
      template_id: input.templateId,
      buyer_session_id: input.buyerSessionId,
      status: "pending",
      preview_storage_key: null,
      preview_url: null,
      error_message: null,
    },
  });

  return mapBuyerPreviewJob(record);
};

export const updateBuyerPreviewJob = async (
  input: UpdateBuyerPreviewJobInput,
): Promise<BuyerPreviewJobRecord | null> => {
  const record = await prisma.buyerPreviewJob.update({
    where: {
      shop_id_id: {
        shop_id: input.shopId,
        id: input.jobId,
      },
    },
    data: {
      status: input.status,
      preview_storage_key: input.previewStorageKey ?? undefined,
      preview_url: input.previewUrl ?? undefined,
      error_message: input.errorMessage ?? undefined,
    },
  });

  return mapBuyerPreviewJob(record);
};

export const getBuyerPreviewJobById = async (
  shopId: string,
  jobId: string,
): Promise<BuyerPreviewJobRecord | null> => {
  const record = await prisma.buyerPreviewJob.findUnique({
    where: {
      shop_id_id: {
        shop_id: shopId,
        id: jobId,
      },
    },
  });

  return record ? mapBuyerPreviewJob(record) : null;
};
