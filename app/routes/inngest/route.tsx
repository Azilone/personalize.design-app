import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serve } from "inngest/remix";
import { inngest } from "../../services/inngest/client.server";
import { inngestFunctions } from "../../services/inngest/index.server";

const handler = serve({
  client: inngest,
  functions: inngestFunctions,
  signingKey: process.env.INNGEST_SIGNING_KEY,
  signingKeyFallback: process.env.INNGEST_SIGNING_KEY_FALLBACK,
});

export const loader = async ({ request }: LoaderFunctionArgs) =>
  handler({ request });

export const action = async ({ request }: ActionFunctionArgs) =>
  handler({ request });
