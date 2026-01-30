import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import {
  productConfigRequestSchema,
  type ProductConfigResponse,
} from "../../../schemas/app_proxy";
import { getProductTemplateAssignment } from "../../../services/products/product-template-assignment.server";
import { getTemplate } from "../../../services/templates/templates.server";
import logger from "../../../lib/logger";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  logger.info(
    { url: request.url },
    "Product config app proxy request received",
  );

  try {
    await authenticate.public.appProxy(request);
    logger.info("Product config app proxy authentication successful");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Product config app proxy authentication failed",
    );
    throw error;
  }

  const url = new URL(request.url);
  const parsed = productConfigRequestSchema.safeParse({
    shop_id: url.searchParams.get("shop_id"),
    product_id: url.searchParams.get("product_id"),
  });

  if (!parsed.success) {
    return data<ProductConfigResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Invalid request.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const { shop_id, product_id } = parsed.data;

  const productIdCandidates = new Set<string>();
  const trimmedProductId = product_id.trim();
  if (trimmedProductId.length > 0) {
    productIdCandidates.add(trimmedProductId);
  }

  if (trimmedProductId.startsWith("gid://shopify/Product/")) {
    const numericId = trimmedProductId.split("/").pop();
    if (numericId) {
      productIdCandidates.add(numericId);
    }
  } else {
    productIdCandidates.add(`gid://shopify/Product/${trimmedProductId}`);
  }

  // Check if product has a template assignment in our DB
  let assignment = null;
  for (const candidate of productIdCandidates) {
    assignment = await getProductTemplateAssignment({
      shopId: shop_id,
      productId: candidate,
    });
    if (assignment) {
      break;
    }
  }

  if (!assignment || !assignment.personalizationEnabled) {
    logger.info(
      { shop_id, product_id },
      "Product not configured for personalization",
    );
    return data<ProductConfigResponse>({
      data: null,
    });
  }

  // Verify the template exists and is published
  const template = await getTemplate(assignment.templateId, shop_id);
  if (!template || template.status !== "published") {
    logger.warn(
      { shop_id, product_id, template_id: assignment.templateId },
      "Template not found or not published",
    );
    return data<ProductConfigResponse>({
      data: null,
    });
  }

  logger.info(
    { shop_id, product_id, template_id: assignment.templateId },
    "Product config retrieved successfully",
  );

  return data<ProductConfigResponse>({
    data: {
      template_id: assignment.templateId,
      personalization_enabled: assignment.personalizationEnabled,
      text_enabled: template.textInputEnabled,
    },
  });
};
