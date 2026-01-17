import { Inngest } from "inngest";

export const INNGEST_APP_ID = "personalize-design";

export const inngest = new Inngest({
  id: INNGEST_APP_ID,
  env: process.env.INNGEST_ENV,
});
