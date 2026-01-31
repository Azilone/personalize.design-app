import { z } from "zod";

import logger from "../../lib/logger";
import { PrintifyRequestError } from "./client.server";
import {
  PRINTIFY_BASE_URL,
  assertPrintifyOk,
  fetchPrintify,
} from "./request.server";

const printifyWebhookSchema = z.object({
  id: z.union([z.number(), z.string()]),
  topic: z.string(),
  url: z.string().nullish(),
});

const printifyWebhooksResponseSchema = z.union([
  z.array(printifyWebhookSchema),
  z.object({ data: z.array(printifyWebhookSchema) }),
]);

type PrintifyWebhookPayload = z.infer<typeof printifyWebhookSchema>;

const resolveWebhookPayload = (payload: unknown): PrintifyWebhookPayload[] => {
  const parsed = printifyWebhooksResponseSchema.safeParse(payload);
  if (!parsed.success) return [];
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");

export const buildPrintifyWebhookUrl = (baseUrl: string): string => {
  return `${normalizeBaseUrl(baseUrl)}/webhooks/printify`;
};

export const listPrintifyWebhooks = async (input: {
  token: string;
  printifyShopId: string;
}): Promise<PrintifyWebhookPayload[]> => {
  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${input.printifyShopId}/webhooks.json`,
    input.token,
    { method: "GET" },
  );

  await assertPrintifyOk(response, "Unable to fetch Printify webhooks.");

  const payload = (await response.json()) as unknown;
  return resolveWebhookPayload(payload);
};

const createPrintifyWebhook = async (input: {
  token: string;
  printifyShopId: string;
  topic: string;
  url: string;
  secret?: string;
}): Promise<void> => {
  const body = input.secret
    ? { topic: input.topic, url: input.url, secret: input.secret }
    : { topic: input.topic, url: input.url };

  const response = await fetchPrintify(
    `${PRINTIFY_BASE_URL}/shops/${input.printifyShopId}/webhooks.json`,
    input.token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  await assertPrintifyOk(response, "Unable to create Printify webhook.");
};

export const ensurePrintifyWebhooks = async (input: {
  token: string;
  printifyShopId: string;
  baseUrl: string;
  topics: string[];
  secret?: string;
}): Promise<{ installed: string[]; skipped: string[] }> => {
  if (!input.baseUrl) {
    throw new PrintifyRequestError(
      "unexpected_response",
      "Printify webhook base URL missing",
    );
  }

  const webhookUrl = buildPrintifyWebhookUrl(input.baseUrl);
  const existing = await listPrintifyWebhooks({
    token: input.token,
    printifyShopId: input.printifyShopId,
  });

  const installed: string[] = [];
  const skipped: string[] = [];

  for (const topic of input.topics) {
    const already = existing.find(
      (hook) => hook.topic === topic && hook.url === webhookUrl,
    );

    if (already) {
      skipped.push(topic);
      continue;
    }

    try {
      await createPrintifyWebhook({
        token: input.token,
        printifyShopId: input.printifyShopId,
        topic,
        url: webhookUrl,
        secret: input.secret,
      });
    } catch (error) {
      if (input.secret && error instanceof PrintifyRequestError) {
        await createPrintifyWebhook({
          token: input.token,
          printifyShopId: input.printifyShopId,
          topic,
          url: webhookUrl,
        });
      } else {
        throw error;
      }
    }

    installed.push(topic);
  }

  logger.info(
    {
      printify_shop_id: input.printifyShopId,
      webhook_url: webhookUrl,
      installed,
      skipped,
    },
    "Printify webhooks ensured",
  );

  return { installed, skipped };
};
