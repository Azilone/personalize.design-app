import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function PrintifySetup() {
  return (
    <s-page heading="Printify setup">
      <s-section heading="Connect Printify">
        <s-paragraph>
          Printify connection management is coming soon. For now, this checklist
          item will remain Incomplete.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
