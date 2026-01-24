import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedRedirectPath } from "../../../../lib/routing";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import { getShopReadinessSignals } from "../../../../services/shops/readiness.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const readinessSignals = await getShopReadinessSignals(shopId);

  if (readinessSignals.spendSafetyConfigured) {
    return redirect(buildEmbeddedRedirectPath(request, "/app"));
  }

  return null;
};

export default function SpendSafetyOnboarding() {
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const billingHref = `/app/billing${embeddedSearch}`;
  const setupHref = `/app${embeddedSearch}`;

  return (
    <s-page heading="Enable paid usage">
      <s-section heading="Review billing before enabling paid usage">
        <s-stack direction="block" gap="base">
          <s-banner tone="info">
            <s-text>
              To use AI generation features, you must{" "}
              <strong>enable paid usage</strong>. You will only be charged for
              what you use, up to your monthly spending cap.
            </s-text>
          </s-banner>
          <s-paragraph>
            Review these spend safety details before enabling paid usage.
          </s-paragraph>
          <s-card>
            <s-stack direction="block" gap="base">
              <s-heading>Pricing details</s-heading>
              <s-unordered-list>
                <s-list-item>
                  You start with a <strong>$1.00 USD free AI usage gift</strong>
                  .
                </s-list-item>
                <s-list-item>
                  Current pricing (USD): <strong>$0.05</strong> per generated
                  image; <strong>$0.025</strong> per remove background
                  operation.
                </s-list-item>
                <s-list-item>
                  Billable actions: <strong>generate</strong>,{" "}
                  <strong>regenerate</strong>,{" "}
                  <strong>remove background</strong>.
                </s-list-item>
                <s-list-item>
                  Printify mockup generation is <strong>not</strong> billed.
                </s-list-item>
                <s-list-item>
                  After the gift is used, usage is billed via{" "}
                  <strong>Shopify Usage Charges</strong>.
                </s-list-item>
                <s-list-item>
                  By clicking the button below, you will proceed to{" "}
                  <strong>enable paid usage</strong>.
                </s-list-item>
                <s-list-item>
                  Your <strong>monthly spending cap</strong> limits the maximum
                  amount that can be charged in a month.
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-card>
          <Link to={billingHref}>
            <s-button variant="primary">
              Enable paid usage & configure safety
            </s-button>
          </Link>
          <Link to={setupHref}>Back to setup</Link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
