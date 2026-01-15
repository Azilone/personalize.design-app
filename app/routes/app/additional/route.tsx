import { Link } from "react-router";

export default function AdditionalPage() {
  return (
    <s-page heading="Sandbox (dev)">
      <s-section heading="Template sandbox">
        <s-paragraph>
          This page is a sandbox used during development. It's safe to delete
          once you replace it with real product pages.
        </s-paragraph>
        <s-paragraph>
          It demonstrates how to create multiple pages within app navigation
          using{" "}
          <Link
            to="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
            rel="noopener noreferrer"
          >
            App Bridge
          </Link>
          .
        </s-paragraph>
        <s-paragraph>
          To add a page to the nav, create a route in <code>app/routes</code>{" "}
          and add a link in <code>app/routes/app/route.tsx</code>.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <Link
              to="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
              rel="noopener noreferrer"
            >
              App nav best practices
            </Link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
