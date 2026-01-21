import type { ProductTemplateAssignment } from "@prisma/client";
import prisma from "../../db.server";

export type ProductTemplateAssignmentDto = {
  id: string;
  shopId: string;
  productId: string;
  templateId: string;
  personalizationEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveProductTemplateAssignmentInput = {
  shopId: string;
  productId: string;
  templateId: string;
  personalizationEnabled: boolean;
};

export const mapProductTemplateAssignmentRecord = (
  record: ProductTemplateAssignment,
): ProductTemplateAssignmentDto => {
  return {
    id: record.id,
    shopId: record.shop_id,
    productId: record.product_id,
    templateId: record.template_id,
    personalizationEnabled: record.personalization_enabled,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
};

export const getProductTemplateAssignment = async (input: {
  shopId: string;
  productId: string;
}): Promise<ProductTemplateAssignmentDto | null> => {
  const assignment = await prisma.productTemplateAssignment.findUnique({
    where: {
      shop_id_product_id: {
        shop_id: input.shopId,
        product_id: input.productId,
      },
    },
  });

  return assignment ? mapProductTemplateAssignmentRecord(assignment) : null;
};

export const saveProductTemplateAssignment = async (
  input: SaveProductTemplateAssignmentInput,
): Promise<ProductTemplateAssignmentDto> => {
  const assignment = await prisma.productTemplateAssignment.upsert({
    where: {
      shop_id_product_id: {
        shop_id: input.shopId,
        product_id: input.productId,
      },
    },
    create: {
      shop_id: input.shopId,
      product_id: input.productId,
      template_id: input.templateId,
      personalization_enabled: false,
    },
    update: {
      template_id: input.templateId,
      personalization_enabled: false,
    },
  });

  return mapProductTemplateAssignmentRecord(assignment);
};

export const clearProductTemplateAssignment = async (input: {
  shopId: string;
  productId: string;
}): Promise<boolean> => {
  const result = await prisma.productTemplateAssignment.deleteMany({
    where: {
      shop_id: input.shopId,
      product_id: input.productId,
    },
  });

  return result.count > 0;
};
