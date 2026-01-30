import { useState } from "react";
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

import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import { templateActionSchema } from "../../../../schemas/admin";
import {
  listTemplates,
  publishTemplate,
  unpublishTemplate,
  type DesignTemplateListItem,
} from "../../../../services/templates/templates.server";
import logger from "../../../../lib/logger";

export type LoaderData = {
  templates: DesignTemplateListItem[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);

  const templates = await listTemplates(shopId);

  return { templates };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = templateActionSchema.safeParse(formData);

  if (!parsed.success) {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "Invalid request.",
          details: parsed.error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  // Handle publish intent
  if (parsed.data.intent === "template_publish") {
    try {
      const result = await publishTemplate(parsed.data.template_id, shopId);

      if (!result) {
        return data(
          { error: { code: "not_found", message: "Template not found." } },
          { status: 404 },
        );
      }

      logger.info(
        { shop_id: shopId, template_id: parsed.data.template_id },
        "Template published",
      );
      return data({ published: true, templateId: parsed.data.template_id });
    } catch (error) {
      logger.error(
        { shop_id: shopId, template_id: parsed.data.template_id, error },
        "Failed to publish template",
      );

      // Check if this is a validation error from the service
      const errorMessage = error instanceof Error ? error.message : "";
      const isValidationError = errorMessage.includes(
        "Cannot publish template:",
      );

      return data(
        {
          error: {
            code: isValidationError ? "validation_error" : "internal_error",
            message: isValidationError
              ? errorMessage.replace("Cannot publish template: ", "")
              : "Failed to publish template. Please try again.",
          },
        },
        { status: isValidationError ? 400 : 500 },
      );
    }
  }

  // Handle unpublish intent
  if (parsed.data.intent === "template_unpublish") {
    try {
      const result = await unpublishTemplate(parsed.data.template_id, shopId);

      if (!result) {
        return data(
          { error: { code: "not_found", message: "Template not found." } },
          { status: 404 },
        );
      }

      logger.info(
        { shop_id: shopId, template_id: parsed.data.template_id },
        "Template unpublished",
      );
      return data({ unpublished: true, templateId: parsed.data.template_id });
    } catch (error) {
      logger.error(
        { shop_id: shopId, template_id: parsed.data.template_id, error },
        "Failed to unpublish template",
      );
      return data(
        {
          error: {
            code: "internal_error",
            message: "Failed to unpublish template.",
          },
        },
        { status: 500 },
      );
    }
  }

  return data(
    {
      error: {
        code: "invalid_request",
        message: "Invalid intent for this route.",
      },
    },
    { status: 400 },
  );
};

export const headers: HeadersFunction = () => {
  return {
    "Cache-Control": "no-store",
  };
};

export default function TemplatesListPage() {
  const { templates } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { search } = useLocation();
  const navigation = useNavigation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const createHref = `/app/templates/new${embeddedSearch}`;
  const setupHref = `/app${embeddedSearch}`;

  // Track which template is showing confirmation (null = none)
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  const isSubmitting = navigation.state === "submitting";
  const submittingTemplateId = isSubmitting
    ? navigation.formData?.get("template_id")?.toString()
    : null;

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;

  const successMessage =
    actionData && typeof actionData === "object"
      ? "published" in actionData
        ? "Template published successfully!"
        : "unpublished" in actionData
          ? "Template unpublished successfully!"
          : null
      : null;

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
                  <s-box
                    key={template.id}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                  >
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="base">
                        <Link
                          to={`/app/templates/${template.id}${embeddedSearch}`}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <s-text>
                            <strong>{template.templateName}</strong>
                          </s-text>
                        </Link>
                      </s-stack>

                      <s-stack direction="inline" gap="small">
                        <s-badge
                          tone={
                            template.status === "published" ? "success" : "info"
                          }
                        >
                          {template.status === "published"
                            ? "Published"
                            : "Draft"}
                        </s-badge>
                        <s-text color="subdued">
                          {template.variableCount} variable
                          {template.variableCount === 1 ? "" : "s"}
                        </s-text>
                      </s-stack>

                      {/* Publish/Unpublish actions with inline confirmation */}
                      {confirmAction === template.id ? (
                        <s-stack direction="block" gap="small">
                          <s-text>
                            {template.status === "draft"
                              ? `Publish "${template.templateName}"? Published templates can be assigned to products.`
                              : `Unpublish "${template.templateName}"? It will no longer be available for new assignments.`}
                          </s-text>
                          <s-stack direction="inline" gap="small">
                            <Form method="post">
                              <input
                                type="hidden"
                                name="intent"
                                value={
                                  template.status === "draft"
                                    ? "template_publish"
                                    : "template_unpublish"
                                }
                              />
                              <input
                                type="hidden"
                                name="template_id"
                                value={template.id}
                              />
                              <s-button
                                variant="primary"
                                type="submit"
                                loading={submittingTemplateId === template.id}
                              >
                                {template.status === "draft"
                                  ? "Confirm Publish"
                                  : "Confirm Unpublish"}
                              </s-button>
                            </Form>
                            <s-button
                              variant="secondary"
                              onClick={() => setConfirmAction(null)}
                            >
                              Cancel
                            </s-button>
                          </s-stack>
                        </s-stack>
                      ) : (
                        <s-stack direction="inline" gap="small">
                          {template.status === "draft" ? (
                            <s-button
                              variant="secondary"
                              onClick={() => setConfirmAction(template.id)}
                            >
                              Publish
                            </s-button>
                          ) : (
                            <s-button
                              variant="secondary"
                              onClick={() => setConfirmAction(template.id)}
                            >
                              Unpublish
                            </s-button>
                          )}
                          <Link
                            to={`/app/templates/${template.id}${embeddedSearch}`}
                          >
                            <s-button variant="tertiary">Edit</s-button>
                          </Link>
                        </s-stack>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
