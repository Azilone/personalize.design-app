import { z } from "zod";

const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

export type PrintifyShopSummary = {
  shopId: string;
  shopTitle: string;
  salesChannel: string | null;
  shopCount: number;
};

export type PrintifyShopChoice = {
  shopId: string;
  shopTitle: string;
  salesChannel: string | null;
};

export type PrintifyErrorCode =
  | "invalid_token"
  | "rate_limited"
  | "no_shops"
  | "unexpected_response";

export class PrintifyRequestError extends Error {
  code: PrintifyErrorCode;
  status?: number;

  constructor(code: PrintifyErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const getPrintifyUserAgent = (): string => {
  return process.env.PRINTIFY_USER_AGENT ?? "personalize-design-app";
};

const printifyShopSchema = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().nullish(),
  sales_channel: z.string().nullish(),
});

type PrintifyShopPayload = z.infer<typeof printifyShopSchema>;

const printifyShopsResponseSchema = z.union([
  z.array(printifyShopSchema),
  z.object({ data: z.array(printifyShopSchema) }),
]);

const resolveShopPayload = (payload: unknown): PrintifyShopPayload[] => {
  const parsed = printifyShopsResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return [];
  }

  return Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
};

export const listPrintifyShops = async (
  token: string,
): Promise<PrintifyShopChoice[]> => {
  let response: Response;

  try {
    response = await fetch(`${PRINTIFY_BASE_URL}/shops.json`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": getPrintifyUserAgent(),
        Accept: "application/json",
      },
    });
  } catch {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Unable to validate the Printify token right now.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new PrintifyRequestError(
      "invalid_token",
      "Printify token is invalid or expired.",
      response.status,
    );
  }

  if (response.status === 429) {
    throw new PrintifyRequestError(
      "rate_limited",
      "Printify is rate limiting requests. Please retry in a moment.",
      response.status,
    );
  }

  if (!response.ok) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Unable to validate the Printify token right now.",
      response.status,
    );
  }

  const payload = (await response.json()) as unknown;
  const shops = resolveShopPayload(payload);

  if (!shops.length) {
    throw new PrintifyRequestError(
      "no_shops",
      "No Printify shops were returned for this token.",
      response.status,
    );
  }

  return shops.map((shop) => ({
    shopId: String(shop.id),
    shopTitle: shop.title ? String(shop.title) : "Printify shop",
    salesChannel:
      typeof shop.sales_channel === "string" ? shop.sales_channel : null,
  }));
};

export const validatePrintifyToken = async (
  token: string,
): Promise<PrintifyShopSummary> => {
  const shops = await listPrintifyShops(token);
  const primaryShop = shops[0];

  return {
    shopId: primaryShop.shopId,
    shopTitle: primaryShop.shopTitle,
    salesChannel: primaryShop.salesChannel,
    shopCount: shops.length,
  };
};
