import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  Link,
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopIdFromSession } from "../lib/tenancy";
import { buildEmbeddedSearch } from "../lib/embedded-search";
import logger from "../lib/logger";
import { spendSafetyActionSchema } from "../schemas/admin";
import {
  getSpendSafetySettings,
  upsertSpendSafetySettings,
} from "../services/shops/spend-safety.server";

const DEFAULT_MONTHLY_CAP_CENTS = 1000;

const shouldLogAuthFlow = () =>
  process.env.NODE_ENV === "development" ||
  process.env.PD_DEBUG_AUTH_BOUNCE === "1";

const safeBillingLogContext = (request: Request) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded");
  const host = url.searchParams.get("host");
  const locale = url.searchParams.get("locale");

  return {
    path: url.pathname,
    has_shop: Boolean(shop),
    shop,
    embedded,
    has_host: Boolean(host),
    has_locale: Boolean(locale),
    has_id_token: url.searchParams.has("id_token"),
    has_x_shopify_bounce: request.headers.has("X-Shopify-Bounce"),
    has_auth_header: request.headers.has("Authorization"),
  };
};

const isSpendSafetyConfigured = (input: {
  monthlyCapCents: number | null;
  paidUsageConsentAt: string | null;
}) => {
  const monthlyCapCents = input.monthlyCapCents ?? 0;

  return monthlyCapCents > 0 && Boolean(input.paidUsageConsentAt);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const logCtx = safeBillingLogContext(request);
  if (shouldLogAuthFlow()) {
    logger.info(logCtx, "Billing requested");
  }

  try {
    const { session } = await authenticate.admin(request);
    const shopId = getShopIdFromSession(session);
    const settings = await getSpendSafetySettings(shopId);
    const monthlyCapCents =
      settings.monthlyCapCents ?? DEFAULT_MONTHLY_CAP_CENTS;

    return {
      monthlyCapCents,
      paidUsageConsentAt: settings.paidUsageConsentAt
        ? settings.paidUsageConsentAt.toISOString()
        : null,
    };
  } catch (error) {
    if (error instanceof Response) {
      if (shouldLogAuthFlow()) {
        const location = error.headers.get("location");
        let locationPath: string | null = null;

        if (location) {
          try {
            locationPath = new URL(location, request.url).pathname;
          } catch {
            locationPath = null;
          }
        }

        logger.info(
          {
            ...logCtx,
            status: error.status,
            has_location: Boolean(location),
            location_path: locationPath,
          },
          "Billing responded (Response)",
        );
      }

      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error({ ...logCtx, err_message: message }, "Billing failed");
    throw error;
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = spendSafetyActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      { error: { code: "invalid_request", message: "Invalid request." } },
      { status: 400 },
    );
  }

  const settings = await getSpendSafetySettings(shopId);
  const consentAlreadyRecorded = Boolean(settings.paidUsageConsentAt);
  const consentProvided = Boolean(parsed.data.paid_usage_consent);

  if (!consentAlreadyRecorded && !consentProvided) {
    return data(
      {
        error: {
          code: "consent_required",
          message: "Confirm paid usage consent to continue.",
        },
      },
      { status: 400 },
    );
  }

  const monthlyCapCents = Math.round(parsed.data.monthly_cap_usd * 100);

  if (!Number.isFinite(monthlyCapCents) || monthlyCapCents <= 0) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "Monthly cap must be greater than $0.00.",
        },
      },
      { status: 400 },
    );
  }

  const paidUsageConsentAt = consentAlreadyRecorded
    ? settings.paidUsageConsentAt
    : new Date();

  await upsertSpendSafetySettings({
    shopId,
    monthlyCapCents,
    paidUsageConsentAt,
  });

  return data({ success: true });
};

export default function BillingSettings() {
  const { monthlyCapCents, paidUsageConsentAt } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const setupHref = `/app${embeddedSearch}`;

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;
  const successMessage =
    actionData && typeof actionData === "object" && "success" in actionData
      ? "Spend safety updated."
      : null;
  const hasConsent = Boolean(paidUsageConsentAt);
  const consentDate = paidUsageConsentAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(paidUsageConsentAt))
    : null;
  const isSubmitting =
    navigation.formData?.get("intent") === "save_spend_safety";
  const monthlyCapUsd = (monthlyCapCents / 100).toFixed(2);
  const spendSafetyConfigured = isSpendSafetyConfigured({
    monthlyCapCents,
    paidUsageConsentAt,
  });

  return (
    <s-page heading="Billing & spend safety">
      <s-section heading="Spend safety">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
            </s-banner>
          ) : null}
          {successMessage ? (
            <s-banner tone="success">
              <s-text>{successMessage}</s-text>
            </s-banner>
          ) : null}
          {spendSafetyConfigured ? (
            <s-banner tone="success">
              <s-text>Spend safety is configured.</s-text>
            </s-banner>
          ) : null}
          <s-paragraph>
            Set a monthly spending cap and confirm paid usage before usage
            charges can apply. The $1.00 free AI usage gift is applied first.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="save_spend_safety" />
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Monthly spending cap (USD)"
                name="monthly_cap_usd"
                placeholder="10.00"
                defaultValue={monthlyCapUsd}
              />
              {!hasConsent ? (
                <label>
                  <input type="checkbox" name="paid_usage_consent" /> I
                  understand paid usage charges will apply after the free gift
                  is used.
                </label>
              ) : (
                <s-paragraph>
                  Paid usage consent recorded {consentDate}.
                </s-paragraph>
              )}
              <s-button
                type="submit"
                variant="primary"
                {...(isSubmitting ? { loading: true } : {})}
              >
                Save spend safety
              </s-button>
            </s-stack>
          </Form>
          <Link to={setupHref}>Back to setup</Link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
