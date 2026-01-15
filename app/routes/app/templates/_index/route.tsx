import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData, useLocation } from "react-router";

import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import {
  listTemplates,
  type DesignTemplateListItem,
} from "../../../../services/templates/templates.server";

export type LoaderData = {
  templates: DesignTemplateListItem[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);

  const templates = await listTemplates(shopId);

  return { templates };
};

export const headers: HeadersFunction = () => {
  return {
    "Cache-Control": "no-store",
  };
};

export default function TemplatesListPage() {
  const { templates } = useLoaderData<typeof loader>();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const createHref = `/app/templates/new${embeddedSearch}`;
  const setupHref = `/app${embeddedSearch}`;

  const isEmpty = templates.length === 0;

  return (
    <s-page heading="Templates">
      <s-section heading="Design Templates">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Create design templates (Blueprints) with prompt variables to let
            buyers personalize products while maintaining consistent,
            premium-quality outputs.
          </s-paragraph>

          {isEmpty ? (
            <s-stack direction="block" gap="base">
              <s-banner tone="info">
                <s-text>
                  No templates yet. Create your first design template to get
                  started.
                </s-text>
              </s-banner>
              <s-stack direction="inline" gap="base">
                <Link to={createHref}>Create template</Link>
                <Link to={setupHref}>Back to setup</Link>
              </s-stack>
            </s-stack>
          ) : (
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base">
                <Link to={createHref}>Create template</Link>
                <Link to={setupHref}>Back to setup</Link>
              </s-stack>

              <s-stack direction="block" gap="small">
                {templates.map((template) => (
                  <Link
                    key={template.id}
                    to={`/app/templates/${template.id}${embeddedSearch}`}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <s-box
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                    >
                      <s-stack direction="block" gap="small">
                        <s-text>
                          <strong>{template.templateName}</strong>
                        </s-text>
                        <s-stack direction="inline" gap="small">
                          <s-badge
                            tone={
                              template.status === "published"
                                ? "success"
                                : "info"
                            }
                          >
                            {template.status}
                          </s-badge>
                          <s-text color="subdued">
                            {template.variableCount} variable
                            {template.variableCount === 1 ? "" : "s"}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </s-box>
                  </Link>
                ))}
              </s-stack>
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
