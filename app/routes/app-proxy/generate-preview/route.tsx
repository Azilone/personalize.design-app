import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../../../shopify.server";
import {
  generatePreviewRequestSchema,
  type GeneratePreviewResponse,
} from "../../../schemas/app_proxy";
import { uploadFileAndGetReadUrl } from "../../../services/supabase/storage";
import { inngest } from "../../../services/inngest/client.server";
import { buyerPreviewGeneratePayloadSchema } from "../../../services/inngest/types";
import { createBuyerPreviewJob } from "../../../services/buyer-previews/buyer-previews.server";
import logger from "../../../lib/logger";

const parseVariableValues = (value?: string | null): Record<string, string> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, entry]) => [
        key,
        typeof entry === "string" ? entry : String(entry ?? ""),
      ]),
    );
  } catch {
    return {};
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const formData = await request.formData();
  const parsed = generatePreviewRequestSchema.safeParse(
    Object.fromEntries(formData),
  );

  if (!parsed.success) {
    return data<GeneratePreviewResponse>(
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

  const {
    shop_id,
    product_id,
    template_id,
    session_id,
    image_file,
    text_input,
    variable_values_json,
  } = parsed.data;

  if (image_file.size === 0) {
    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "invalid_request",
          message: "Image file is required.",
        },
      },
      { status: 400 },
    );
  }

  let uploadResult;
  try {
    uploadResult = await uploadFileAndGetReadUrl(
      shop_id,
      image_file.name,
      image_file.size,
      Buffer.from(await image_file.arrayBuffer()),
      image_file.type || "application/octet-stream",
    );
  } catch (error) {
    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "upload_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to upload preview image.",
        },
      },
      { status: 400 },
    );
  }

  const jobId = session_id;

  try {
    await createBuyerPreviewJob({
      jobId,
      shopId: shop_id,
      productId: product_id,
      templateId: template_id,
      buyerSessionId: session_id,
    });

    const payload = buyerPreviewGeneratePayloadSchema.parse({
      shop_id,
      product_id,
      template_id,
      buyer_session_id: session_id,
      image_url: uploadResult.readUrl,
      text_input: text_input || undefined,
      variable_values: parseVariableValues(variable_values_json),
    });

    await inngest.send({
      name: "buyer_previews.generate.requested",
      data: payload,
    });
  } catch (error) {
    logger.error(
      { shop_id, product_id, template_id, err: error },
      "Failed to queue buyer preview generation",
    );

    return data<GeneratePreviewResponse>(
      {
        error: {
          code: "generation_failed",
          message:
            error instanceof Error
              ? error.message
              : "Unable to queue preview generation.",
        },
      },
      { status: 500 },
    );
  }

  logger.info(
    {
      shop_id,
      product_id,
      template_id,
      job_id: jobId,
    },
    "Queued buyer preview generation",
  );

  return data<GeneratePreviewResponse>({
    data: {
      job_id: jobId,
      status: "pending",
    },
  });
};
