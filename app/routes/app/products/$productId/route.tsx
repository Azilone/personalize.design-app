import { useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  data,
  useActionData,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import prisma from "../../../../db.server";
import logger from "../../../../lib/logger";
import { captureEvent } from "../../../../lib/posthog.server";
import { productTemplateAssignmentActionSchema } from "../../../../schemas/admin";
import { merchantPreviewGeneratePayloadSchema } from "../../../../services/inngest/types";
import { inngest } from "../../../../services/inngest/client.server";
import {
  clearProductTemplateAssignment,
  getProductTemplateAssignment,
  saveProductTemplateAssignment,
} from "../../../../services/products/product-template-assignment.server";
import { createMerchantPreview } from "../../../../services/merchant-previews/merchant-previews.server";
import {
  getPublishedTemplate,
  listPublishedTemplates,
  type PublishedTemplateListItem,
  getTemplate,
  type DesignTemplateDto,
} from "../../../../services/templates/templates.server";
import {
  generateSignedUrls,
  isSupabaseConfigured,
  uploadFileAndGetReadUrl,
} from "../../../../services/supabase/storage";

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
        printify_product_id: true,
      },
    }),
    getProductTemplateAssignment({ shopId, productId }),
    listPublishedTemplates(shopId),
  ]);

  const template = assignment?.templateId
    ? await getTemplate(assignment.templateId, shopId)
    : null;

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
      hasPrintifyProduct: Boolean(shopProduct.printify_product_id),
    },
    assignment,
    templates,
    template,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);
  const formData = await request.formData();
  const parsed = productTemplateAssignmentActionSchema.safeParse(
    Object.fromEntries(formData),
  );
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

  if (parsed.data.intent === "product_preview_generate") {
    const productId = parsed.data.product_id.trim();
    const templateId = parsed.data.template_id.trim();
    const coverPrintArea = parsed.data.cover_print_area === "true";

    if (productId !== routeProductId) {
      return data(
        {
          previewError: {
            message: "Product ID mismatch.",
          },
        },
        { status: 400 },
      );
    }

    const testImage = formData.get("test_image");
    if (!(testImage instanceof File) || testImage.size === 0) {
      return data(
        {
          previewError: {
            message: "Please upload a test image before generating a preview.",
          },
        },
        { status: 400 },
      );
    }

    let variableValues: Record<string, string> = {};
    try {
      const candidate = JSON.parse(parsed.data.variable_values_json);
      if (candidate && typeof candidate === "object") {
        variableValues = Object.fromEntries(
          Object.entries(candidate).map(([key, value]) => [
            String(key),
            typeof value === "string" ? value : String(value ?? ""),
          ]),
        );
      }
    } catch {
      variableValues = {};
    }

    let uploadResult;
    let requiresUpload = false;
    try {
      const supabaseConfigured = isSupabaseConfigured();
      if (supabaseConfigured) {
        uploadResult = await uploadFileAndGetReadUrl(
          shopId,
          testImage.name,
          testImage.size,
          Buffer.from(await testImage.arrayBuffer()),
          testImage.type || "application/octet-stream",
        );
      } else {
        requiresUpload = true;
        uploadResult = await generateSignedUrls(
          shopId,
          testImage.name,
          testImage.size,
        );
      }
    } catch (error) {
      return data(
        {
          previewError: {
            message:
              error instanceof Error
                ? error.message
                : "Unable to prepare upload.",
          },
        },
        { status: 400 },
      );
    }

    if (
      requiresUpload &&
      !uploadResult.uploadUrl.includes("mock-storage.example.com")
    ) {
      const uploadResponse = await fetch(uploadResult.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": testImage.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: Buffer.from(await testImage.arrayBuffer()),
      });

      if (!uploadResponse.ok) {
        const responseText = await uploadResponse.text();
        logger.warn(
          {
            shop_id: shopId,
            product_id: productId,
            template_id: templateId,
            status: uploadResponse.status,
            response: responseText,
          },
          "Supabase upload failed",
        );

        return data(
          {
            previewError: {
              message: "Upload failed. Please retry the preview.",
            },
          },
          { status: 400 },
        );
      }
    }

    const jobId = crypto.randomUUID();

    logger.info(
      {
        shop_id: shopId,
        product_id: productId,
        template_id: templateId,
        job_id: jobId,
        cover_print_area: coverPrintArea,
        variable_count: Object.keys(variableValues).length,
        has_test_text: Boolean(parsed.data.test_text?.trim()),
      },
      "Queued merchant preview generation",
    );

    try {
      await createMerchantPreview({
        jobId,
        shopId,
        productId,
        templateId,
        coverPrintArea,
        testImageUrl: uploadResult.readUrl,
        testText: parsed.data.test_text ?? null,
        variableValues,
      });

      const payload = merchantPreviewGeneratePayloadSchema.parse({
        job_id: jobId,
        shop_id: shopId,
        product_id: productId,
        template_id: templateId,
        cover_print_area: coverPrintArea,
        test_image_url: uploadResult.readUrl,
        test_text: parsed.data.test_text,
        variable_values: variableValues,
      });

      await inngest.send({
        name: "merchant_previews.generate.requested",
        data: payload,
      });
    } catch (error) {
      return data(
        {
          previewError: {
            message:
              error instanceof Error
                ? error.message
                : "Unable to queue preview generation.",
          },
        },
        { status: 500 },
      );
    }

    return data({
      preview: {
        jobId,
        status: "Queued",
        designUrl: null,
        mockupUrls: [],
        errorMessage: null,
      },
    });
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
    personalizationEnabled: personalizationRequested,
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
        hasPrintifyProduct: boolean;
      };
      assignment: {
        templateId: string;
        personalizationEnabled: boolean;
      } | null;
      templates: PublishedTemplateListItem[];
      template: DesignTemplateDto | null;
    }
  | { error: { code: string; message: string } };

type ActionData = {
  error?: { message: string; details?: Record<string, string[]> };
  success?: boolean;
  assignment?: {
    templateId: string;
    personalizationEnabled: boolean;
  } | null;
  preview?: {
    jobId: string;
    status: "Queued" | "Generating" | "Creating Mockups" | "Done" | "Failed";
    designUrl?: string | null;
    mockupUrls?: string[];
    errorMessage?: string | null;
  };
  previewError?: { message: string; details?: Record<string, string[]> };
};

export default function ProductConfigurationPage() {
  const loaderData = useLoaderData<typeof loader>() as LoaderData;
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const previewFetcher = useFetcher();
  const navigate = useNavigate();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const noTemplateValue = "__none__";

  const isSubmitting = navigation.state === "submitting";
  const isError = "error" in loaderData;
  const assignment = isError ? null : loaderData.assignment;
  const product = isError ? null : loaderData.product;
  const templates = isError ? [] : loaderData.templates;
  const template = isError ? null : loaderData.template;

  const [selectedTemplateId, setSelectedTemplateId] = useState(
    assignment?.templateId ?? noTemplateValue,
  );
  const [personalizationEnabled, setPersonalizationEnabled] = useState(
    assignment?.personalizationEnabled ?? false,
  );
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const previewPollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isError) {
      setSelectedTemplateId("");
      setPersonalizationEnabled(false);
      return;
    }

    setSelectedTemplateId(assignment?.templateId ?? noTemplateValue);
    setPersonalizationEnabled(assignment?.personalizationEnabled ?? false);
  }, [
    assignment?.templateId,
    assignment?.personalizationEnabled,
    isError,
    noTemplateValue,
  ]);

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
                navigate(`/app/products${embeddedSearch}`);
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
  const previewFetchError =
    previewFetcher.data &&
    typeof previewFetcher.data === "object" &&
    "error" in previewFetcher.data
      ? (previewFetcher.data as { error?: { message?: string } }).error?.message
      : null;
  const previewFetchResults =
    previewFetcher.data &&
    typeof previewFetcher.data === "object" &&
    "preview" in previewFetcher.data
      ? ((previewFetcher.data as { preview?: ActionData["preview"] }).preview ??
        null)
      : null;
  const previewStatus =
    previewFetchResults?.status ?? actionData?.preview?.status ?? null;
  const previewErrorMessage =
    previewFetchResults?.errorMessage ??
    previewFetchError ??
    actionData?.previewError?.message ??
    null;
  const previewResults = previewFetchResults ?? actionData?.preview ?? null;
  const isPreviewSubmitting =
    isSubmitting &&
    navigation.formData?.get("intent") === "product_preview_generate";
  const isPreviewInFlight =
    isPreviewSubmitting ||
    (previewStatus !== null &&
      previewStatus !== "Done" &&
      previewStatus !== "Failed");

  useEffect(() => {
    if (actionData?.preview?.jobId) {
      setPreviewJobId(actionData.preview.jobId);
    }
  }, [actionData?.preview?.jobId]);

  useEffect(() => {
    if (previewPollTimeoutRef.current) {
      window.clearTimeout(previewPollTimeoutRef.current);
      previewPollTimeoutRef.current = null;
    }

    if (!previewJobId) {
      return;
    }

    if (previewStatus === "Done" || previewStatus === "Failed") {
      return;
    }

    const previewUrl = `/app/api/preview/${encodeURIComponent(previewJobId)}${embeddedSearch}`;

    const poll = () => {
      if (previewFetcher.state === "idle") {
        previewFetcher.load(previewUrl);
      }

      previewPollTimeoutRef.current = window.setTimeout(poll, 3000);
    };

    previewPollTimeoutRef.current = window.setTimeout(poll, 0);

    return () => {
      if (previewPollTimeoutRef.current) {
        window.clearTimeout(previewPollTimeoutRef.current);
        previewPollTimeoutRef.current = null;
      }
    };
  }, [previewJobId, previewStatus, embeddedSearch]);

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
              value={
                selectedTemplateId === noTemplateValue ? "" : selectedTemplateId
              }
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
                onChange={(event: {
                  currentTarget: { value?: string };
                  detail?: { value?: string };
                }) => {
                  const nextValue =
                    typeof event.detail?.value === "string"
                      ? event.detail.value
                      : (event.currentTarget.value ?? "");
                  const normalizedValue = nextValue || noTemplateValue;
                  setSelectedTemplateId(normalizedValue);
                  if (normalizedValue === noTemplateValue) {
                    setPersonalizationEnabled(false);
                  }
                }}
              >
                <s-option value={noTemplateValue}>
                  No template assigned
                </s-option>
                {templates.map((template) => (
                  <s-option key={template.id} value={template.id}>
                    {template.templateName}
                  </s-option>
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
                  {selectedTemplateId !== noTemplateValue
                    ? "Personalization can be enabled after assignment."
                    : "Assign a template before enabling personalization."}
                </s-text>
              </s-stack>

              <s-checkbox
                label="Enable personalization for this product"
                checked={personalizationEnabled}
                disabled={selectedTemplateId === noTemplateValue}
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
                    navigate(`/app/products${embeddedSearch}`);
                  }}
                >
                  Back to products
                </s-button>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading="Test & Preview">
        <s-stack direction="block" gap="base">
          {assignment && template ? (
            product.hasPrintifyProduct ? (
              <SimulatorPanel
                productId={product.id}
                template={template}
                previewStatus={previewStatus}
                previewResults={previewResults}
                previewErrorMessage={previewErrorMessage}
                isPreviewSubmitting={isPreviewSubmitting}
                isPreviewInFlight={isPreviewInFlight}
              />
            ) : (
              <s-banner tone="warning">
                <s-text>
                  This product is not linked to a Printify product. Link a
                  Printify product to enable preview generation with mockups.
                </s-text>
              </s-banner>
            )
          ) : (
            <s-banner tone="info">
              <s-text>
                Assign a published template to enable the preview simulator.
              </s-text>
            </s-banner>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

type PreviewStatus = NonNullable<ActionData["preview"]>["status"];

type SimulatorPanelProps = {
  productId: string;
  template: DesignTemplateDto;
  previewStatus: PreviewStatus | null;
  previewResults: ActionData["preview"] | null;
  previewErrorMessage: string | null;
  isPreviewSubmitting: boolean;
  isPreviewInFlight: boolean;
};

function SimulatorPanel({
  productId,
  template,
  previewStatus,
  previewResults,
  previewErrorMessage,
  isPreviewSubmitting,
  isPreviewInFlight,
}: SimulatorPanelProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {},
  );
  const [testText, setTestText] = useState("");
  const [coverPrintArea, setCoverPrintArea] = useState(true);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const variableValuesJson = JSON.stringify(variableValues);
  const hasResults = Boolean(
    previewResults?.designUrl || previewResults?.mockupUrls?.length,
  );
  const showPending = Boolean(previewStatus && !hasResults);
  const statusTone =
    previewStatus === "Failed"
      ? "critical"
      : previewStatus === "Done"
        ? "success"
        : previewStatus
          ? "info"
          : "info";

  const getDownloadName = (url: string, fallback: string) => {
    try {
      const pathName = new URL(url).pathname;
      const fileName = pathName.split("/").pop();
      if (fileName && fileName.length > 0) {
        return fileName;
      }
    } catch (error) {
      console.error("Unable to parse download URL", error);
    }
    return fallback;
  };

  const downloadFile = async (url: string, fallbackName: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed with ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = getDownloadName(url, fallbackName);
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  const handleDownloadDesign = async () => {
    if (!previewResults?.designUrl) {
      return;
    }
    await downloadFile(previewResults.designUrl, "generated-design.png");
  };

  const handleDownloadMockups = async () => {
    if (!previewResults?.mockupUrls?.length) {
      return;
    }
    for (const [index, url] of previewResults.mockupUrls.entries()) {
      await downloadFile(url, `mockup-${index + 1}.png`);
    }
  };

  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        Upload a test image and optional text to preview the personalization
        experience before publishing. Mockups will be generated via Printify.
      </s-paragraph>

      {previewErrorMessage ? (
        <s-banner tone="critical">
          <s-text>{previewErrorMessage}</s-text>
        </s-banner>
      ) : null}

      {previewStatus ? (
        <s-stack direction="inline" gap="small">
          <s-text>
            <strong>Preview status</strong>
          </s-text>
          <s-badge tone={statusTone}>{previewStatus}</s-badge>
        </s-stack>
      ) : null}

      <Form method="post" encType="multipart/form-data">
        <input type="hidden" name="intent" value="product_preview_generate" />
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="template_id" value={template.id} />
        <input
          type="hidden"
          name="cover_print_area"
          value={coverPrintArea ? "true" : "false"}
        />
        <input
          type="hidden"
          name="variable_values_json"
          value={variableValuesJson}
        />

        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <label htmlFor="test_image">
              <strong>Test image</strong>
            </label>
            <input
              id="test_image"
              name="test_image"
              type="file"
              accept="image/*"
              required
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setSelectedFileName(file ? file.name : null);
              }}
            />
            {selectedFileName ? (
              <s-text color="subdued">Selected: {selectedFileName}</s-text>
            ) : (
              <s-text color="subdued">
                Upload a JPG, PNG, HEIC, AVIF, or WEBP file (max 10MB).
              </s-text>
            )}
          </s-stack>

          {template.variables.length > 0 && (
            <s-stack direction="block" gap="small">
              <s-text>
                <strong>Prompt variables</strong>
              </s-text>
              <s-text color="subdued">
                Provide test values for each prompt variable.
              </s-text>
              <s-stack direction="block" gap="small">
                {template.variables.map((variable) => (
                  <s-text-field
                    key={variable.id}
                    label={variable.name}
                    placeholder={`Enter ${variable.name}`}
                    value={variableValues[variable.name] ?? ""}
                    onChange={(event: {
                      currentTarget?: { value?: string };
                      detail?: { value?: string };
                    }) => {
                      const value =
                        event.detail?.value ?? event.currentTarget?.value ?? "";
                      setVariableValues((prev) => ({
                        ...prev,
                        [variable.name]: value,
                      }));
                    }}
                  />
                ))}
              </s-stack>
            </s-stack>
          )}

          {template.textInputEnabled && (
            <s-text-field
              label="Test text"
              name="test_text"
              placeholder="Optional text to append to the prompt"
              value={testText}
              onChange={(event: {
                currentTarget?: { value?: string };
                detail?: { value?: string };
              }) => {
                const value =
                  event.detail?.value ?? event.currentTarget?.value ?? "";
                setTestText(value);
              }}
            />
          )}

          <s-checkbox
            label="Cover entire print area"
            checked={coverPrintArea}
            onChange={() => setCoverPrintArea(!coverPrintArea)}
          />
          <s-text color="subdued">
            When enabled, the preview will use the exact Printify print area
            dimensions. When disabled, it uses the template&apos;s base aspect
            ratio.
          </s-text>

          <s-button
            type="submit"
            variant="primary"
            loading={isPreviewSubmitting}
            disabled={isPreviewInFlight}
          >
            {isPreviewSubmitting ? "Generating preview..." : "Generate Preview"}
          </s-button>
        </s-stack>
      </Form>

      {isPreviewSubmitting && !previewResults ? (
        <s-banner tone="info">
          <s-text>Generating preview... this can take a minute.</s-text>
        </s-banner>
      ) : null}

      <s-divider />

      {hasResults ? (
        <s-stack direction="block" gap="base">
          <s-text>
            <strong>Generated design</strong>
          </s-text>
          {previewResults?.designUrl ? (
            <s-stack direction="block" gap="small">
              <img
                src={previewResults.designUrl}
                alt="Generated design"
                style={{
                  width: "100%",
                  maxWidth: "420px",
                  borderRadius: "12px",
                  border: "1px solid #e0e0e0",
                }}
              />
              <s-button
                type="button"
                variant="secondary"
                onClick={handleDownloadDesign}
              >
                Download design
              </s-button>
            </s-stack>
          ) : (
            <s-text color="subdued">Design preview will appear here.</s-text>
          )}

          <s-stack direction="block" gap="small">
            <s-text>
              <strong>Printify mockups</strong>
            </s-text>
            {previewResults?.mockupUrls?.length ? (
              <s-button
                type="button"
                variant="secondary"
                onClick={handleDownloadMockups}
              >
                Download all mockups
              </s-button>
            ) : null}
          </s-stack>
          {previewResults?.mockupUrls?.length ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "12px",
              }}
            >
              {previewResults.mockupUrls.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: "10px",
                    padding: "8px",
                  }}
                >
                  <img
                    src={url}
                    alt={`Mockup ${index + 1}`}
                    style={{
                      width: "100%",
                      height: "140px",
                      objectFit: "cover",
                      borderRadius: "8px",
                    }}
                  />
                  <a
                    href={url}
                    download
                    style={{
                      display: "inline-block",
                      marginTop: "6px",
                    }}
                  >
                    Download mockup
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <s-text color="subdued">
              Mockups will appear here once generated.
            </s-text>
          )}
        </s-stack>
      ) : showPending ? (
        <s-text color="subdued">
          Preview is in progress. Results will appear here when ready.
        </s-text>
      ) : (
        <s-text color="subdued">No preview generated yet.</s-text>
      )}
    </s-stack>
  );
}
