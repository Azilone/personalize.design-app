import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type MoneyInput = {
  amount: number;
  currencyCode: "USD";
};

type AppRecurringPricingDetailsInput = {
  price: MoneyInput;
  interval: "EVERY_30_DAYS";
};

type AppUsagePricingDetailsInput = {
  cappedAmount: MoneyInput;
  terms: string;
};

type AppSubscriptionLineItemInput = {
  plan: {
    appRecurringPricingDetails?: AppRecurringPricingDetailsInput;
    appUsagePricingDetails?: AppUsagePricingDetailsInput;
  };
};

type AppSubscriptionCreateInput = {
  name: string;
  returnUrl: string;
  trialDays: number;
  lineItems: AppSubscriptionLineItemInput[];
};

type BuildStandardInputArgs = {
  returnUrl: string;
};

export const buildStandardSubscriptionInput = (
  args: BuildStandardInputArgs,
): AppSubscriptionCreateInput => {
  return {
    name: "Personalize Design Standard",
    returnUrl: args.returnUrl,
    trialDays: 7,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 19, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: 10, currencyCode: "USD" },
            terms: "Usage charges for personalized order lines and AI usage.",
          },
        },
      },
    ],
  };
};

type BuildEarlyAccessInputArgs = {
  returnUrl: string;
};

export const buildEarlyAccessSubscriptionInput = (
  args: BuildEarlyAccessInputArgs,
): AppSubscriptionCreateInput => {
  return {
    name: "Personalize Design Early Access",
    returnUrl: args.returnUrl,
    trialDays: 0,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: 0, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
      {
        plan: {
          appUsagePricingDetails: {
            cappedAmount: { amount: 10, currencyCode: "USD" },
            terms: "Usage charges for personalized order lines and AI usage.",
          },
        },
      },
    ],
  };
};

type AppSubscriptionCreateResult = {
  confirmationUrl: string;
  subscriptionId: string;
  subscriptionStatus: string;
};

type SubscriptionCreateArgs = {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
  test: boolean;
};

const getIsTestSubscription = (): boolean => {
  const configured =
    process.env.SHOPIFY_BILLING_TEST_MODE ??
    (process.env.NODE_ENV === "development" ? "true" : "false");

  if (configured !== "true" && configured !== "false") {
    throw new Error(
      "Invalid SHOPIFY_BILLING_TEST_MODE (expected 'true' or 'false').",
    );
  }

  if (configured === "true" && process.env.NODE_ENV !== "development") {
    throw new Error(
      "SHOPIFY_BILLING_TEST_MODE=true is only allowed in development.",
    );
  }

  return configured === "true";
};

const createSubscription = async (
  input: SubscriptionCreateArgs,
): Promise<AppSubscriptionCreateResult> => {
  const isTest = input.test;
  const response = await input.admin.graphql(
    `#graphql
      mutation createAppSubscription(
        $name: String!
        $returnUrl: URL!
        $trialDays: Int!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          trialDays: $trialDays
          lineItems: $lineItems
          test: $test
        ) {
          userErrors {
            field
            message
          }
          confirmationUrl
          appSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { ...input.subscriptionInput, test: isTest } },
  );

  const responseJson = await response.json();
  const payload = responseJson?.data?.appSubscriptionCreate;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors[0]?.message ?? "Unable to start subscription.";
    throw new Error(message);
  }

  const confirmationUrl = payload?.confirmationUrl;
  const subscriptionId = payload?.appSubscription?.id;
  const subscriptionStatus = payload?.appSubscription?.status;

  if (!confirmationUrl || !subscriptionId || !subscriptionStatus) {
    throw new Error("Subscription response was incomplete.");
  }

  return {
    confirmationUrl,
    subscriptionId,
    subscriptionStatus,
  };
};

export const createStandardSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
}): Promise<AppSubscriptionCreateResult> => {
  return createSubscription({
    ...input,
    test: getIsTestSubscription(),
  });
};

export const createEarlyAccessSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionInput: AppSubscriptionCreateInput;
}): Promise<AppSubscriptionCreateResult> => {
  return createSubscription({
    ...input,
    test: getIsTestSubscription(),
  });
};

type SubscriptionStatusResult = {
  id: string;
  status: string;
};

type SubscriptionCancelResult = {
  id: string;
  status: string;
};

export const getSubscriptionStatus = async (input: {
  admin: AdminApiContext;
  subscriptionId: string;
}): Promise<SubscriptionStatusResult> => {
  const response = await input.admin.graphql(
    `#graphql
      query subscriptionStatus($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { id: input.subscriptionId } },
  );

  const responseJson = await response.json();
  const subscription = responseJson?.data?.node;

  if (!subscription?.id || !subscription?.status) {
    throw new Error("Subscription status not found.");
  }

  return {
    id: subscription.id,
    status: subscription.status,
  };
};

export const cancelSubscription = async (input: {
  admin: AdminApiContext;
  subscriptionId: string;
}): Promise<SubscriptionCancelResult> => {
  const response = await input.admin.graphql(
    `#graphql
      mutation cancelSubscription($id: ID!) {
        appSubscriptionCancel(id: $id) {
          userErrors {
            field
            message
          }
          appSubscription {
            id
            status
          }
        }
      }
    `,
    { variables: { id: input.subscriptionId } },
  );

  const responseJson = await response.json();
  const payload = responseJson?.data?.appSubscriptionCancel;
  const userErrors = payload?.userErrors ?? [];

  if (userErrors.length > 0) {
    const message = userErrors[0]?.message ?? "Unable to cancel subscription.";
    throw new Error(message);
  }

  const cancelled = payload?.appSubscription;
  if (!cancelled?.id || !cancelled?.status) {
    throw new Error("Subscription cancel response was incomplete.");
  }

  return {
    id: cancelled.id,
    status: cancelled.status,
  };
};
