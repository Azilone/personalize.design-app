import { PostHog } from "posthog-node";

const isEnabled = Boolean(process.env.POSTHOG_API_KEY);

const client = isEnabled
  ? new PostHog(process.env.POSTHOG_API_KEY as string, {
      host: process.env.POSTHOG_HOST,
    })
  : null;

export const captureEvent = (
  event: string,
  payload: {
    shop_id: string;
    [key: string]: string | number | boolean | null | undefined;
  },
) => {
  if (!client) {
    return;
  }

  client.capture({
    distinctId: payload.shop_id,
    event,
    properties: payload,
  });
};
