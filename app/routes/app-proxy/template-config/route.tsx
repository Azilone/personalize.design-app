import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import {
  templateConfigRequestSchema,
  type TemplateConfigResponse,
} from "../../../schemas/app_proxy";
import { getTemplate } from "../../../services/templates/templates.server";
import logger from "../../../lib/logger";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const parsed = templateConfigRequestSchema.safeParse({
    shop_id: url.searchParams.get("shop_id"),
    template_id: url.searchParams.get("template_id"),
  });

  if (!parsed.success) {
    return data<TemplateConfigResponse>(
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

  const { shop_id, template_id } = parsed.data;

  const template = await getTemplate(template_id, shop_id);
  if (!template || template.status !== "published") {
    logger.warn(
      { shop_id, template_id },
      "Template not found or not published",
    );
    return data<TemplateConfigResponse>(
      {
        error: {
          code: "not_found",
          message: "Template not found.",
        },
      },
      { status: 404 },
    );
  }

  return data<TemplateConfigResponse>({
    data: {
      template_id: template.id,
      template_name: template.templateName,
      photo_required: template.photoRequired,
      text_input_enabled: template.textInputEnabled,
      variables: template.variables.map((variable) => ({
        id: variable.id,
        name: variable.name,
      })),
    },
  });
};
