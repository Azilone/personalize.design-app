import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLocation } from "react-router";
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
    <s-page heading="Spend safety">
      <s-section heading="Review billing before enabling paid usage">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Review these spend safety details before continuing to
            configuration.
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
                  You will <strong>not be charged</strong> unless you{" "}
                  <strong>enable paid usage</strong>.
                </s-list-item>
                <s-list-item>
                  Your <strong>monthly spending cap</strong> limits the maximum
                  amount that can be charged in a month.
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-card>
          <s-link href={billingHref}>
            <s-button variant="primary">Configure spend safety</s-button>
          </s-link>
          <s-link href={setupHref}>Back to setup</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
