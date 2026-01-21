import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import prisma from "../../../../db.server";
import logger from "../../../../lib/logger";
import { captureEvent } from "../../../../lib/posthog.server";
import { productTemplateAssignmentActionSchema } from "../../../../schemas/admin";
import {
  clearProductTemplateAssignment,
  getProductTemplateAssignment,
  saveProductTemplateAssignment,
} from "../../../../services/products/product-template-assignment.server";
import {
  getPublishedTemplate,
  listPublishedTemplates,
  type PublishedTemplateListItem,
} from "../../../../services/templates/templates.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const productId = params.productId
    ? decodeURIComponent(params.productId)
    : null;

  if (!productId) {
    return data(
      {
        error: {
          code: "missing_product_id",
          message: "Product ID is required.",
        },
      },
      { status: 400 },
    );
  }

  const [shopProduct, assignment, templates] = await Promise.all([
    prisma.shopProduct.findUnique({
      where: {
        shop_id_product_id: {
          shop_id: shopId,
          product_id: productId,
        },
      },
      select: {
        product_id: true,
        title: true,
        handle: true,
      },
    }),
    getProductTemplateAssignment({ shopId, productId }),
    listPublishedTemplates(shopId),
  ]);

  if (!shopProduct) {
    return data(
      {
        error: {
          code: "product_not_found",
          message: "Product not found or does not belong to this shop.",
        },
      },
      { status: 404 },
    );
  }

  return {
    product: {
      id: shopProduct.product_id,
      title: shopProduct.title,
      handle: shopProduct.handle,
    },
    assignment,
    templates,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = Object.fromEntries(await request.formData());
  const parsed = productTemplateAssignmentActionSchema.safeParse(formData);
  const routeProductId = params.productId
    ? decodeURIComponent(params.productId)
    : null;

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

  if (!routeProductId) {
    return data(
      {
        error: {
          code: "missing_product_id",
          message: "Product ID is required.",
        },
      },
      { status: 400 },
    );
  }

  if (parsed.data.intent !== "product_template_assignment_save") {
    return data(
      {
        error: {
          code: "invalid_request",
          message: "Invalid intent for this route.",
        },
      },
      { status: 400 },
    );
  }

  const productId = parsed.data.product_id.trim();
  const templateId = parsed.data.template_id.trim();
  const personalizationRequested =
    parsed.data.personalization_enabled === "true";

  if (productId !== routeProductId) {
    return data(
      {
        error: {
          code: "invalid_product_id",
          message: "Product ID mismatch.",
        },
      },
      { status: 400 },
    );
  }

  const shopProduct = await prisma.shopProduct.findUnique({
    where: {
      shop_id_product_id: {
        shop_id: shopId,
        product_id: productId,
      },
    },
    select: { product_id: true },
  });

  if (!shopProduct) {
    return data(
      {
        error: {
          code: "product_not_found",
          message: "Product not found or does not belong to this shop.",
        },
      },
      { status: 400 },
    );
  }

  if (!templateId && personalizationRequested) {
    return data(
      {
        error: {
          code: "template_required",
          message: "Assign a template before enabling personalization.",
        },
      },
      { status: 400 },
    );
  }

  if (!templateId) {
    await clearProductTemplateAssignment({ shopId, productId });

    captureEvent("product_template.assignment_saved", {
      shop_id: shopId,
      product_id: productId,
      template_id: null,
    });

    return data({
      success: true,
      assignment: null,
    });
  }

  const publishedTemplate = await getPublishedTemplate(templateId, shopId);
  if (!publishedTemplate) {
    return data(
      {
        error: {
          code: "template_not_published",
          message: "Template must be published before assignment.",
        },
      },
      { status: 400 },
    );
  }

  const assignment = await saveProductTemplateAssignment({
    shopId,
    productId,
    templateId,
    personalizationEnabled: false,
  });

  logger.info(
    {
      shop_id: shopId,
      product_id: productId,
      template_id: templateId,
      personalization_enabled: personalizationRequested,
    },
    "Product template assignment saved",
  );

  captureEvent("product_template.assignment_saved", {
    shop_id: shopId,
    product_id: productId,
    template_id: templateId,
  });

  if (personalizationRequested) {
    captureEvent("product_template.personalization_enabled", {
      shop_id: shopId,
      product_id: productId,
      template_id: templateId,
    });
  }

  return data({
    success: true,
    assignment: {
      templateId: assignment.templateId,
      personalizationEnabled: assignment.personalizationEnabled,
    },
  });
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

type LoaderData =
  | {
      product: {
        id: string;
        title: string;
        handle: string;
      };
      assignment: {
        templateId: string;
        personalizationEnabled: boolean;
      } | null;
      templates: PublishedTemplateListItem[];
    }
  | { error: { code: string; message: string } };

type ActionData = {
  error?: { message: string; details?: Record<string, string[]> };
  success?: boolean;
  assignment?: {
    templateId: string;
    personalizationEnabled: boolean;
  } | null;
};

export default function ProductConfigurationPage() {
  const loaderData = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const app = useAppBridge();
  const [embeddedSearch, setEmbeddedSearch] = useState("");

  useEffect(() => {
    if (!app) {
      return;
    }

    const config = app.config;
    if (!config?.shop || !config?.host) {
      return;
    }

    setEmbeddedSearch(
      buildEmbeddedSearch(`?shop=${config.shop}&host=${config.host}`),
    );
  }, [app]);

  const isSubmitting = navigation.state === "submitting";
  const isError = "error" in loaderData;
  const assignment = isError ? null : loaderData.assignment;
  const product = isError ? null : loaderData.product;
  const templates = isError ? [] : loaderData.templates;

  const [selectedTemplateId, setSelectedTemplateId] = useState(
    assignment?.templateId ?? "",
  );
  const [personalizationEnabled, setPersonalizationEnabled] = useState(
    assignment?.personalizationEnabled ?? false,
  );

  useEffect(() => {
    if (isError) {
      setSelectedTemplateId("");
      setPersonalizationEnabled(false);
      return;
    }

    setSelectedTemplateId(assignment?.templateId ?? "");
    setPersonalizationEnabled(assignment?.personalizationEnabled ?? false);
  }, [assignment?.templateId, assignment?.personalizationEnabled, isError]);

  if (isError || !product) {
    return (
      <s-page heading="Product configuration">
        <s-section heading="Error">
          <s-stack direction="block" gap="base">
            <s-banner tone="critical">
              <s-text>
                {isError
                  ? loaderData.error.message
                  : "Product configuration could not be loaded."}
              </s-text>
            </s-banner>
            <s-button
              variant="secondary"
              onClick={() => {
                window.open(`/app/products${embeddedSearch}`, "_top");
              }}
            >
              Back to products
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const assignedTemplateName = assignment
    ? (templates.find((template) => template.id === assignment.templateId)
        ?.templateName ?? "Unpublished template")
    : null;

  const statusLabel = assignment?.personalizationEnabled
    ? "Enabled"
    : "Disabled";
  const statusTone = assignment?.personalizationEnabled ? "success" : "info";

  const errorMessage = actionData?.error?.message ?? null;
  const successMessage = actionData?.success
    ? "Product configuration saved."
    : null;

  return (
    <s-page heading="Product configuration">
      <s-section heading="Product details">
        <s-stack direction="block" gap="small">
          <s-text>
            <strong>{product.title}</strong>
          </s-text>
          <s-text color="subdued">{product.handle}</s-text>
          <s-text color="subdued">{product.id}</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Personalization setup">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Assign a published template to this product and explicitly enable
            personalization when you&apos;re ready. Personalization stays
            disabled until you switch it on.
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

          {assignment ? (
            <s-banner tone="info">
              <s-text>
                Assigned template: {assignedTemplateName} (
                {assignment.templateId})
              </s-text>
            </s-banner>
          ) : (
            <s-banner tone="warning">
              <s-text>No template assigned yet.</s-text>
            </s-banner>
          )}

          <Form method="post">
            <input
              type="hidden"
              name="intent"
              value="product_template_assignment_save"
            />
            <input type="hidden" name="product_id" value={product.id} />
            <input
              type="hidden"
              name="template_id"
              value={selectedTemplateId}
            />
            <input
              type="hidden"
              name="personalization_enabled"
              value={personalizationEnabled ? "true" : "false"}
            />

            <s-stack direction="block" gap="base">
              <s-stack direction="block" gap="small">
                <s-text>
                  <strong>Template assignment</strong>
                </s-text>
                <s-text color="subdued">
                  Select one published template to assign (MVP: single template
                  only).
                </s-text>
              </s-stack>

              <s-select
                label="Assigned template"
                value={selectedTemplateId}
                onChange={(event: { currentTarget: { value: string } }) => {
                  const nextValue = event.currentTarget.value;
                  setSelectedTemplateId(nextValue);
                  if (!nextValue) {
                    setPersonalizationEnabled(false);
                  }
                }}
              >
                <option value="">No template assigned</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.templateName}
                  </option>
                ))}
              </s-select>

              {templates.length === 0 ? (
                <s-banner tone="info">
                  <s-text>
                    No published templates available. Publish a template to
                    assign it here.
                  </s-text>
                </s-banner>
              ) : null}

              <s-checkbox
                label="Multiple templates (Coming soon)"
                checked={false}
                disabled
              />

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-stack direction="inline" gap="small">
                  <s-text>
                    <strong>Personalization status</strong>
                  </s-text>
                  <s-badge tone={statusTone}>{statusLabel}</s-badge>
                </s-stack>
                <s-text color="subdued">
                  {selectedTemplateId
                    ? "Personalization can be enabled after assignment."
                    : "Assign a template before enabling personalization."}
                </s-text>
              </s-stack>

              <s-checkbox
                label="Enable personalization for this product"
                checked={personalizationEnabled}
                disabled={!selectedTemplateId}
                onChange={() =>
                  setPersonalizationEnabled(!personalizationEnabled)
                }
              />

              <s-stack direction="inline" gap="base">
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  Save
                </s-button>
                <s-button
                  variant="secondary"
                  onClick={() => {
                    window.open(`/app/products${embeddedSearch}`, "_top");
                  }}
                >
                  Back to products
                </s-button>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}
