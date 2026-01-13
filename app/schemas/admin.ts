import { z } from "zod";

const subscribeIntentSchema = z.object({
  intent: z.literal("subscribe"),
});

const inviteUnlockSchema = z.object({
  intent: z.literal("invite_unlock"),
  invite_code: z.string(),
});

export const paywallActionSchema = z.discriminatedUnion("intent", [
  subscribeIntentSchema,
  inviteUnlockSchema,
]);

export type PaywallActionInput = z.infer<typeof paywallActionSchema>;
