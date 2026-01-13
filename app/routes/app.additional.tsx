export default function AdditionalPage() {
  return (
    <s-page heading="Sandbox (dev)">
      <s-section heading="Template sandbox">
        <s-paragraph>
          This page is a sandbox used during development. It’s safe to delete
          once you replace it with real product pages.
        </s-paragraph>
        <s-paragraph>
          It demonstrates how to create multiple pages within app navigation
          using{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            App Bridge
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          To add a page to the nav, create a route in <code>app/routes</code>{" "}
          and add a link in <code>app/routes/app.tsx</code>.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              App nav best practices
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
