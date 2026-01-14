const PRINTIFY_BASE_URL = "https://api.printify.com/v1";

export type PrintifyShopSummary = {
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

type PrintifyShopPayload = {
  id: number | string;
  title?: string | null;
  sales_channel?: string | null;
};

const resolveShopPayload = (payload: unknown): PrintifyShopPayload[] => {
  if (Array.isArray(payload)) {
    return payload as PrintifyShopPayload[];
  }

  if (
    payload &&
    typeof payload === "object" &&
    "data" in payload &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: PrintifyShopPayload[] }).data;
  }

  return [];
};

export const validatePrintifyToken = async (
  token: string,
): Promise<PrintifyShopSummary> => {
  const response = await fetch(`${PRINTIFY_BASE_URL}/shops.json`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": getPrintifyUserAgent(),
      Accept: "application/json",
    },
  });

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

  const primaryShop = shops[0];

  return {
    shopId: String(primaryShop.id),
    shopTitle: primaryShop.title ? String(primaryShop.title) : "Printify shop",
    salesChannel:
      typeof primaryShop.sales_channel === "string"
        ? primaryShop.sales_channel
        : null,
  };
};
