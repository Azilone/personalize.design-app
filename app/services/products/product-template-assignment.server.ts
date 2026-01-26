import type { ProductTemplateAssignment } from "@prisma/client";
import prisma from "../../db.server";

/**
 * Shopify Admin GraphQL client interface.
 * Shopify may provide either a .graphql() or .request() method depending on client version.
 */
export interface ShopifyAdminClient {
  /**
   * GraphQL method that returns a Response object (newer versions)
   */
  graphql?: (
    query: string,
    options: { variables: Record<string, unknown> },
  ) => Promise<Response>;

  /**
   * Request method that directly returns data (older versions)
   */
  request?: (
    query: string,
    options: { variables: Record<string, unknown> },
  ) => Promise<unknown>;
}

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

export type ProductTemplateAssignmentSummary = {
  productId: string;
  templateId: string;
  templateName: string;
  personalizationEnabled: boolean;
};

export const updateProductPersonalizationMetafield = async (input: {
  admin: ShopifyAdminClient;
  productId: string;
  templateId: string | null;
  personalizationEnabled: boolean;
}) => {
  const value = input.templateId
    ? JSON.stringify({
        template_id: input.templateId,
        personalization_enabled: input.personalizationEnabled,
      })
    : null;

  // If no template, we might want to delete the metafield or set it to null/empty
  // Setting it to null in the mutation deletes it.

  const productGid = input.productId.startsWith("gid://")
    ? input.productId
    : `gid://shopify/Product/${input.productId}`;

  const query = `#graphql
    mutation updateProductMetafield($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          metafields(first: 1) {
            edges {
              node {
                namespace
                key
                value
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const variables = {
    input: {
      id: productGid,
      metafields: [
        {
          namespace: "personalize_design",
          key: "config",
          type: "json",
          value: value,
        },
      ],
    },
  };

  let data: unknown;

  if (typeof input.admin.graphql === "function") {
    const response = await input.admin.graphql(query, { variables });
    data = await response.json();
  } else if (typeof input.admin.request === "function") {
    data = await input.admin.request(query, { variables });
  } else {
    throw new Error(
      "Invalid admin client: must have either graphql or request method",
    );
  }

  const dataObj = data as {
    data?: {
      productUpdate?: {
        product?: unknown;
        userErrors?: Array<{ message: string }>;
      };
    };
  };

  if (
    dataObj.data?.productUpdate?.userErrors &&
    dataObj.data.productUpdate.userErrors.length > 0
  ) {
    console.error(
      "Metafield update failed",
      dataObj.data.productUpdate.userErrors,
    );
    throw new Error(dataObj.data.productUpdate.userErrors[0].message);
  }

  return dataObj.data?.productUpdate?.product;
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
      personalization_enabled: input.personalizationEnabled,
    },
    update: {
      template_id: input.templateId,
      personalization_enabled: input.personalizationEnabled,
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

export const listProductTemplateAssignments = async (
  shopId: string,
): Promise<ProductTemplateAssignmentSummary[]> => {
  const assignments = await prisma.productTemplateAssignment.findMany({
    where: { shop_id: shopId },
    select: {
      product_id: true,
      template_id: true,
      personalization_enabled: true,
    },
  });

  if (assignments.length === 0) {
    return [];
  }

  const templateIds = Array.from(
    new Set(assignments.map((assignment) => assignment.template_id)),
  );

  const templates = await prisma.designTemplate.findMany({
    where: {
      id: { in: templateIds },
      shop_id: shopId,
    },
    select: {
      id: true,
      template_name: true,
    },
  });

  const templateNameById = new Map(
    templates.map((template) => [template.id, template.template_name]),
  );

  return assignments.map((assignment) => ({
    productId: assignment.product_id,
    templateId: assignment.template_id,
    templateName:
      templateNameById.get(assignment.template_id) ?? "Unknown template",
    personalizationEnabled: assignment.personalization_enabled,
  }));
};
