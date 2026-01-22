import { z } from "zod";

import logger from "../../lib/logger";
import { PrintifyRequestError } from "./client.server";
import { getPrintifyIntegrationWithToken } from "./integration.server";
import { decryptPrintifyToken } from "./token-encryption.server";
import {
  PRINTIFY_BASE_URL,
  assertPrintifyOk,
  fetchPrintify,
} from "./request.server";

export type PrintifyPrintAreaDimensions = {
  position: string;
  width: number;
  height: number;
};

type PrintifyPlaceholderPayload = {
  position: string;
  width: number;
  height: number;
};

const printifyPlaceholderSchema = z.object({
  position: z.string(),
  width: z.number(),
  height: z.number(),
});

const printifyPlaceholderValueSchema = z.union([
  printifyPlaceholderSchema,
  z.array(printifyPlaceholderSchema),
]);

const printifyVariantSchema = z.object({
  id: z.number(),
  placeholders: z
    .union([
      z.array(printifyPlaceholderSchema),
      z.record(z.string(), printifyPlaceholderValueSchema),
    ])
    .optional(),
});

type PrintifyVariantPayload = z.infer<typeof printifyVariantSchema>;

const printifyVariantsResponseSchema = z.array(printifyVariantSchema);

const parseVariantCandidate = (candidate: unknown): PrintifyVariantPayload[] => {
  const parsed = printifyVariantsResponseSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  if (candidate && typeof candidate === "object") {
    const values = Object.values(candidate as Record<string, unknown>);
    const valueParsed = printifyVariantsResponseSchema.safeParse(values);
    if (valueParsed.success) {
      return valueParsed.data;
    }
  }

  return [];
};

const extractVariantsArray = (payload: unknown): PrintifyVariantPayload[] => {
  const direct = parseVariantCandidate(payload);
  if (direct.length) {
    return direct;
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidates = [
      record.data,
      record.variants,
      record.items,
      record.results,
      record.data && typeof record.data === "object"
        ? (record.data as Record<string, unknown>).variants
        : undefined,
    ];

    for (const candidate of candidates) {
      const parsedCandidate = parseVariantCandidate(candidate);
      if (parsedCandidate.length) {
        return parsedCandidate;
      }
    }
  }

  return [];
};

const normalizePlaceholders = (
  placeholders: unknown,
): PrintifyPlaceholderPayload[] => {
  if (Array.isArray(placeholders)) {
    return placeholders as PrintifyPlaceholderPayload[];
  }

  if (!placeholders || typeof placeholders !== "object") {
    return [];
  }

  const normalized: PrintifyPlaceholderPayload[] = [];
  for (const entry of Object.values(placeholders)) {
    if (Array.isArray(entry)) {
      normalized.push(
        ...(entry.filter((item) => item && typeof item === "object") as PrintifyPlaceholderPayload[]),
      );
    } else if (entry && typeof entry === "object") {
      normalized.push(entry as PrintifyPlaceholderPayload);
    }
  }

  return normalized;
};

export const getPrintifyVariantPrintArea = async (input: {
  shopId: string;
  blueprintId: number;
  printProviderId: number;
  variantId: number;
  position?: string;
}): Promise<PrintifyPrintAreaDimensions | null> => {
  const integration = await getPrintifyIntegrationWithToken(input.shopId);
  if (!integration) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify integration not configured for this shop.",
    );
  }

  const token = decryptPrintifyToken(integration.encryptedToken);
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/catalog/blueprints/${input.blueprintId}/print_providers/${input.printProviderId}/variants.json?show-out-of-stock=1`,
    token,
    { method: "GET" },
  );

  await assertPrintifyOk(
    response,
    "Unable to fetch Printify variant print areas.",
  );

  const payload = (await response.json()) as unknown;
  const variants = extractVariantsArray(payload);
  if (!variants.length) {
    logger.error(
      {
        shop_id: input.shopId,
        blueprint_id: input.blueprintId,
        print_provider_id: input.printProviderId,
        variant_id: input.variantId,
        payload_type: Array.isArray(payload) ? "array" : typeof payload,
        payload_keys:
          payload && typeof payload === "object"
            ? Object.keys(payload as Record<string, unknown>)
            : null,
      },
      "Printify variants response schema validation failed",
    );
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify variants response was invalid.",
    );
  }
  const variant = variants.find((item) => item.id === input.variantId);
  const placeholders = normalizePlaceholders(variant?.placeholders);
  if (!placeholders.length) {
    return null;
  }

  const resolved = input.position
    ? placeholders.find((placeholder) => placeholder.position === input.position)
    : placeholders[0];

  if (!resolved) {
    return null;
  }

  const dimensions: PrintifyPrintAreaDimensions = {
    position: resolved.position,
    width: resolved.width,
    height: resolved.height,
  };

  logger.info(
    {
      shop_id: input.shopId,
      blueprint_id: input.blueprintId,
      print_provider_id: input.printProviderId,
      variant_id: input.variantId,
      print_area_position: dimensions.position,
      print_area_width: dimensions.width,
      print_area_height: dimensions.height,
    },
    "Resolved Printify print area",
  );

  return dimensions;
};

export const buildPrintAreaDimensions = (
  placeholder: PrintifyPlaceholderPayload,
): PrintifyPrintAreaDimensions => ({
  position: placeholder.position,
  width: placeholder.width,
  height: placeholder.height,
});
