import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function StorefrontPersonalizationSettings() {
  return (
    <s-page heading="Storefront personalization">
      <s-section heading="Enablement">
        <s-paragraph>
          Shop-level storefront personalization settings are coming soon. For
          now, this checklist item will remain Incomplete.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
