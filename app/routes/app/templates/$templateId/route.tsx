import { useState, useEffect, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  Form,
  data,
  Link,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";

import { authenticate } from "../../../../shopify.server";
import { getShopIdFromSession } from "../../../../lib/tenancy";
import { buildEmbeddedSearch } from "../../../../lib/embedded-search";
import { templateActionSchema } from "../../../../schemas/admin";
import {
  applyPromptVariableValues,
  validateVariableNames,
  validatePromptVariableReferences,
} from "../../../../lib/prompt-variables";
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  reserveTestGenerationQuota,
  releaseTestGenerationQuota,
  recordTestGeneration,
  type DesignTemplateDto,
} from "../../../../services/templates/templates.server";
import { generateImages } from "../../../../services/fal/generate.server";
import logger from "../../../../lib/logger";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_GENERATION_MODEL_DISPLAY_NAME,
  MVP_PRICE_USD_PER_GENERATION,
  TEMPLATE_TEST_LIMIT_PER_MONTH,
  REMOVE_BG_PRICE_USD,
} from "../../../../lib/generation-settings";

export type LoaderData = {
  template: DesignTemplateDto | null;
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopId = getShopIdFromSession(session);

  const templateId = params.templateId;
  if (!templateId) {
    throw new Response("Template ID required", { status: 400 });
  }

  const template = await getTemplate(templateId, shopId);

  if (!template) {
    throw new Response("Template not found", { status: 404 });
  }

  return { template };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
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

  const templateId = params.templateId;
  if (!templateId) {
    return data(
      { error: { code: "invalid_request", message: "Template ID required." } },
      { status: 400 },
    );
  }

  // Handle delete intent
  if (parsed.data.intent === "template_delete") {
    const deleted = await deleteTemplate(templateId, shopId);

    if (!deleted) {
      return data(
        { error: { code: "not_found", message: "Template not found." } },
        { status: 404 },
      );
    }

    logger.info(
      { shop_id: shopId, template_id: templateId },
      "Template deleted",
    );
    return data({ deleted: true });
  }

  // Handle test_generate intent
  if (parsed.data.intent === "template_test_generate") {
    const template = await getTemplate(templateId, shopId);

    if (!template) {
      return data(
        { error: { code: "not_found", message: "Template not found." } },
        { status: 404 },
      );
    }

    // Only allow test generation for draft templates
    if (template.status !== "draft") {
      return data(
        {
          error: {
            code: "invalid_request",
            message: "Test generation is only available for draft templates.",
          },
        },
        { status: 400 },
      );
    }

    const { test_photo_url, test_text, num_images, variable_values_json } =
      parsed.data;

    // Require prompt for test generation
    if (!template.prompt?.trim()) {
      return data(
        {
          error: {
            code: "validation_error",
            message:
              "Please define a prompt template before testing generation.",
          },
        },
        { status: 400 },
      );
    }

    // Atomically reserve quota (prevents TOCTOU race condition)
    const reservation = await reserveTestGenerationQuota(
      templateId,
      shopId,
      num_images,
      TEMPLATE_TEST_LIMIT_PER_MONTH,
    );

    if (!reservation.success) {
      return data(
        {
          error: {
            code: "rate_limited",
            message:
              reservation.errorMessage ??
              `Monthly test generation limit reached. You have ${reservation.remaining} remaining.`,
          },
        },
        { status: 429 },
      );
    }

    let parsedVariableValues: Record<string, string> = {};
    try {
      const candidate = JSON.parse(variable_values_json);
      if (candidate && typeof candidate === "object") {
        parsedVariableValues = Object.fromEntries(
          Object.entries(candidate).map(([key, value]) => [
            String(key),
            typeof value === "string" ? value : String(value ?? ""),
          ]),
        );
      }
    } catch {
      parsedVariableValues = {};
    }

    const safeVariableValues: Record<string, string> = {};
    for (const variable of template.variables) {
      const rawValue = parsedVariableValues[variable.name];
      if (rawValue !== undefined) {
        safeVariableValues[variable.name] = rawValue;
      }
    }

    const renderedPrompt = applyPromptVariableValues(
      template.prompt,
      safeVariableValues,
    );

    // Build prompt: base template + optional test text
    let generationPrompt = renderedPrompt;
    if (template.textInputEnabled && test_text?.trim()) {
      // Append buyer's custom text to the prompt
      generationPrompt = `${renderedPrompt}\n\nCustom text: ${test_text.trim()}`;
    }

    try {
      // Call fal.ai generation service
      const generationResult = await generateImages({
        modelId: template.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID,
        imageUrls: [test_photo_url],
        prompt: generationPrompt,
        numImages: num_images,
        shopId,
        removeBackgroundEnabled: template.removeBackgroundEnabled,
      });

      // Record test generation metadata for analytics
      await recordTestGeneration({
        templateId,
        shopId,
        numImagesRequested: num_images,
        numImagesGenerated: generationResult.images.length,
        totalCostUsd: generationResult.totalCostUsd,
        totalTimeSeconds: generationResult.totalTimeSeconds,
        generationCostUsd: generationResult.images[0]?.generationCostUsd,
        removeBgCostUsd: generationResult.images[0]?.removeBgCostUsd,
        success: true,
      });

      logger.info(
        {
          shop_id: shopId,
          template_id: templateId,
          generated_count: generationResult.images.length,
        },
        "Test generation completed",
      );

      // Map to response format with per-image metadata (including cost breakdown)
      const results = generationResult.images.map((img) => ({
        url: img.url,
        generation_time_seconds: img.generationTimeSeconds,
        cost_usd: img.costUsd,
        generation_cost_usd: img.generationCostUsd,
        remove_bg_cost_usd: img.removeBgCostUsd,
        seed: img.seed,
      }));

      return data({
        results,
        total_time_seconds: generationResult.totalTimeSeconds,
        total_cost_usd: generationResult.totalCostUsd,
        generation_cost_usd: generationResult.images.reduce(
          (sum, img) => sum + (img.generationCostUsd || 0),
          0,
        ),
        remove_bg_cost_usd: generationResult.images.reduce(
          (sum, img) => sum + (img.removeBgCostUsd || 0),
          0,
        ),
        usage: {
          count: reservation.newCount,
          limit: TEMPLATE_TEST_LIMIT_PER_MONTH,
          remaining: reservation.remaining,
        },
      });
    } catch (error) {
      // Release reserved quota since generation failed
      await releaseTestGenerationQuota(templateId, shopId, num_images);

      // Record failed test generation for analytics
      await recordTestGeneration({
        templateId,
        shopId,
        numImagesRequested: num_images,
        numImagesGenerated: 0,
        totalCostUsd: 0,
        totalTimeSeconds: 0,
        success: false,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });

      logger.error(
        { shop_id: shopId, template_id: templateId, err: error },
        "Test generation failed",
      );

      // Handle GenerationError and other errors
      if (error instanceof Error) {
        return data(
          { error: { code: "generation_failed", message: error.message } },
          { status: 500 },
        );
      }

      return data(
        {
          error: {
            code: "generation_failed",
            message: "An unexpected error occurred during generation.",
          },
        },
        { status: 500 },
      );
    }
  }

  // Handle update intent
  if (parsed.data.intent !== "template_update") {
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

  const {
    template_name,
    text_input_enabled,
    prompt,
    variable_names_json,
    generation_model_identifier,
    price_usd_per_generation,
    remove_background_enabled,
  } = parsed.data;

  // Parse variable names from JSON
  let variableNames: string[] = [];
  try {
    variableNames = JSON.parse(variable_names_json);
    if (!Array.isArray(variableNames)) {
      variableNames = [];
    }
    variableNames = variableNames.filter((n) => typeof n === "string");
  } catch {
    variableNames = [];
  }

  // Validate variable names
  const variableValidation = validateVariableNames(variableNames);
  if (!variableValidation.valid) {
    return data(
      {
        error: {
          code: "validation_error",
          message: "Invalid variable names.",
          details: { variable_names: variableValidation.errors },
        },
      },
      { status: 400 },
    );
  }

  // Validate prompt variable references if prompt is provided
  if (prompt) {
    const promptValidation = validatePromptVariableReferences(
      prompt,
      variableNames,
    );
    if (!promptValidation.valid) {
      return data(
        {
          error: {
            code: "validation_error",
            message: "Invalid prompt variable references.",
            details: { prompt: promptValidation.errors },
          },
        },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await updateTemplate({
      templateId,
      shopId,
      templateName: template_name,
      photoRequired: true,
      textInputEnabled: text_input_enabled === "true",
      prompt: prompt || null,
      generationModelIdentifier: generation_model_identifier ?? null,
      priceUsdPerGeneration: price_usd_per_generation ?? null,
      removeBackgroundEnabled: remove_background_enabled === "true",
      variableNames,
    });

    if (!updated) {
      return data(
        { error: { code: "not_found", message: "Template not found." } },
        { status: 404 },
      );
    }

    logger.info(
      { shop_id: shopId, template_id: templateId },
      "Template updated",
    );

    return data({ success: true });
  } catch (error) {
    logger.error({ shop_id: shopId, err: error }, "Template update failed");

    return data(
      {
        error: {
          code: "internal_error",
          message: "Failed to update template. Please try again.",
        },
      },
      { status: 500 },
    );
  }
};

export const headers: HeadersFunction = () => {
  return {
    "Cache-Control": "no-store",
  };
};

export default function TemplateEditPage() {
  const { template } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const templatesHref = `/app/templates${embeddedSearch}`;

  const isSubmitting = navigation.state === "submitting";
  const isUpdating =
    isSubmitting && navigation.formData?.get("intent") === "template_update";
  const isDeleting =
    isSubmitting && navigation.formData?.get("intent") === "template_delete";

  const errorMessage =
    actionData && typeof actionData === "object" && "error" in actionData
      ? actionData.error.message
      : null;

  const errorDetails =
    actionData &&
    typeof actionData === "object" &&
    "error" in actionData &&
    actionData.error &&
    typeof actionData.error === "object" &&
    "details" in actionData.error
      ? (actionData.error as { details?: Record<string, string[]> }).details
      : null;

  const success =
    actionData && typeof actionData === "object" && "success" in actionData;

  const deleted =
    actionData && typeof actionData === "object" && "deleted" in actionData;

  // State for form fields (initialized from template)
  const [templateName, setTemplateName] = useState(
    template?.templateName ?? "",
  );
  const [textInputEnabled, setTextInputEnabled] = useState(
    template?.textInputEnabled ?? false,
  );
  const [prompt, setPrompt] = useState(template?.prompt ?? "");
  const [variableNames, setVariableNames] = useState<string[]>(
    template?.variables.map((v) => v.name) ?? [],
  );
  const [variableInput, setVariableInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removeBackgroundEnabled, setRemoveBackgroundEnabled] = useState(
    template?.removeBackgroundEnabled ?? false,
  );

  // Generation settings (MVP: use constants, read persisted from template)
  const generationModel =
    template?.generationModelIdentifier ?? MVP_GENERATION_MODEL_ID;
  const generationPrice =
    template?.priceUsdPerGeneration ?? MVP_PRICE_USD_PER_GENERATION;

  // Test generation state
  const [testPhotoUrl, setTestPhotoUrl] = useState("");
  const [testVariableValues, setTestVariableValues] = useState<
    Record<string, string>
  >({});
  const [numImagesToGenerate, setNumImagesToGenerate] = useState(1);
  const isTestGenerating =
    isSubmitting &&
    navigation.formData?.get("intent") === "template_test_generate";

  // Extract test generation results from actionData
  const testResults =
    actionData &&
    typeof actionData === "object" &&
    "results" in actionData &&
    Array.isArray(actionData.results)
      ? (actionData as {
          results: Array<{
            url: string;
            generation_time_seconds: number | null;
            cost_usd: number;
            seed?: number;
          }>;
          total_time_seconds: number;
          total_cost_usd: number;
          usage?: { count: number; limit: number; remaining: number };
        })
      : null;

  // Calculate current usage from template or recent results
  const testGenerationUsage = testResults?.usage ?? {
    count: template?.testGenerationCount ?? 0,
    limit: TEMPLATE_TEST_LIMIT_PER_MONTH,
    remaining:
      TEMPLATE_TEST_LIMIT_PER_MONTH - (template?.testGenerationCount ?? 0),
  };

  // Estimated cost before generation (includes remove-bg if enabled)
  const estimatedGenerationCost = generationPrice * numImagesToGenerate;
  const estimatedRemoveBgCost = removeBackgroundEnabled
    ? REMOVE_BG_PRICE_USD * numImagesToGenerate
    : 0;
  const estimatedCost = estimatedGenerationCost + estimatedRemoveBgCost;

  // Serialize variable names to JSON for form submission
  const variableNamesJson = JSON.stringify(variableNames);

  const addVariable = useCallback(() => {
    const trimmed = variableInput.trim();
    if (trimmed && !variableNames.includes(trimmed)) {
      setVariableNames((prev) => [...prev, trimmed]);
      setVariableInput("");
    }
  }, [variableInput, variableNames]);

  const removeVariable = useCallback((name: string) => {
    setVariableNames((prev) => prev.filter((n) => n !== name));
  }, []);

  // Redirect after delete
  useEffect(() => {
    if (deleted) {
      navigate(templatesHref);
    }
  }, [deleted, templatesHref, navigate]);

  if (!template) {
    return (
      <s-page heading="Template Not Found">
        <s-section>
          <s-banner tone="critical">
            <s-text>Template not found or you don't have access.</s-text>
          </s-banner>
          <Link to={templatesHref}>Back to templates</Link>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={`Edit: ${template.templateName}`}>
      <s-section heading="Template Details">
        <s-stack direction="block" gap="base">
          {errorMessage ? (
            <s-banner tone="critical">
              <s-text>{errorMessage}</s-text>
              {errorDetails?.variable_names ? (
                <ul>
                  {errorDetails.variable_names.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : null}
              {errorDetails?.prompt ? (
                <ul>
                  {errorDetails.prompt.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </s-banner>
          ) : null}

          {success ? (
            <s-banner tone="success">
              <s-text>Template updated successfully!</s-text>
            </s-banner>
          ) : null}

          <s-stack direction="inline" gap="small">
            <s-badge
              tone={template.status === "published" ? "success" : "info"}
            >
              {template.status}
            </s-badge>
          </s-stack>

          <Form method="post">
            <input type="hidden" name="intent" value="template_update" />
            <input type="hidden" name="template_id" value={template.id} />
            <input
              type="hidden"
              name="variable_names_json"
              value={variableNamesJson}
            />
            <input
              type="hidden"
              name="generation_model_identifier"
              value={generationModel}
            />
            <input
              type="hidden"
              name="price_usd_per_generation"
              value={generationPrice}
            />
            <input
              type="hidden"
              name="remove_background_enabled"
              value={removeBackgroundEnabled ? "true" : "false"}
            />

            <s-stack direction="block" gap="base">
              <s-text-field
                label="Template name"
                name="template_name"
                placeholder="e.g., Pet Portrait, Custom Mug Design"
                value={templateName}
                onChange={(event: { currentTarget: { value: string } }) =>
                  setTemplateName(event.currentTarget.value)
                }
                required
              />

              <s-stack direction="block" gap="small">
                <s-checkbox
                  label="Enable text input from buyer"
                  name="text_input_enabled"
                  value="true"
                  checked={textInputEnabled}
                  onChange={() => setTextInputEnabled(!textInputEnabled)}
                />
                <s-text color="subdued">
                  Allow buyers to enter custom text when ordering.
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <s-text>
                  <strong>Prompt Variables</strong>
                </s-text>
                <s-text color="subdued">
                  Define variables that can be referenced in your prompt using
                  {"{{variable_name}}"} syntax.
                </s-text>
              </s-stack>

              {variableNames.length > 0 ? (
                <s-stack direction="inline" gap="small">
                  {variableNames.map((name) => (
                    <s-badge key={name} tone="info">
                      {name}
                      <button
                        type="button"
                        onClick={() => removeVariable(name)}
                        style={{
                          marginLeft: "4px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </s-badge>
                  ))}
                </s-stack>
              ) : null}

              <s-stack direction="inline" gap="small">
                <s-text-field
                  label="Add variable"
                  placeholder="e.g., animal, color, style"
                  value={variableInput}
                  onChange={(event: { currentTarget: { value: string } }) =>
                    setVariableInput(event.currentTarget.value)
                  }
                />
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={addVariable}
                  disabled={!variableInput.trim()}
                >
                  Add
                </s-button>
              </s-stack>

              <s-divider />

              <s-stack direction="block" gap="small">
                <label htmlFor="prompt">
                  <strong>Prompt template</strong>
                </label>
                <textarea
                  id="prompt"
                  name="prompt"
                  placeholder="A majestic {{animal}} in {{color}} tones..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    resize: "vertical",
                  }}
                />
                <s-text color="subdued">
                  Use {"{{variable_name}}"} to reference your defined variables.
                </s-text>
              </s-stack>

              <s-divider />

              {/* Generation Settings Section (AC#1, AC#2) */}
              <s-stack direction="block" gap="small">
                <s-text>
                  <strong>Generation settings</strong>
                </s-text>
                <s-text color="subdued">
                  Configure the AI model used to generate images.
                </s-text>
              </s-stack>

              <s-stack direction="block" gap="small">
                <label htmlFor="generation_model">
                  <strong>Model</strong>
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    id="generation_model"
                    value={generationModel}
                    disabled
                    style={{
                      width: "100%",
                      padding: "8px 32px 8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      backgroundColor: "#f5f5f5",
                      cursor: "not-allowed",
                      appearance: "none",
                    }}
                  >
                    <option value={MVP_GENERATION_MODEL_ID}>
                      {MVP_GENERATION_MODEL_DISPLAY_NAME}
                    </option>
                  </select>
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      pointerEvents: "none",
                      color: "#666",
                    }}
                  >
                    ▼
                  </span>
                </div>
                <s-text color="subdued">
                  MVP: Single model available. More options coming soon.
                </s-text>
              </s-stack>

              <s-banner tone="info">
                <s-stack direction="block" gap="small">
                  <s-text>
                    <strong>
                      ${generationPrice.toFixed(2)} per generated image
                    </strong>
                  </s-text>
                  <s-text color="subdued">
                    Billable actions: generate, regenerate, remove background.
                    Printify mockups are not billed.
                  </s-text>
                </s-stack>
              </s-banner>

              {/* Remove Background Setting */}
              <s-stack direction="block" gap="small">
                <s-checkbox
                  label="Remove background from photos"
                  value="true"
                  checked={removeBackgroundEnabled}
                  onChange={() =>
                    setRemoveBackgroundEnabled(!removeBackgroundEnabled)
                  }
                />
                <s-text color="subdued">
                  Automatically remove photo backgrounds before generation.{" "}
                  <strong>+ $0.025 per image</strong>
                </s-text>
              </s-stack>

              <s-divider />

              <s-stack direction="inline" gap="base">
                <s-button type="submit" variant="primary" loading={isUpdating}>
                  Save Changes
                </s-button>
                <Link to={templatesHref}>Back to templates</Link>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      {/* Test Panel Section (AC #1-5) */}
      {template.status === "draft" && (
        <s-section heading="Test Generation">
          <s-stack direction="block" gap="base">
            {/* Monthly Usage Display */}
            <s-stack direction="block" gap="small">
              <s-text>
                <strong>Monthly Usage</strong>
              </s-text>
              <s-stack direction="inline" gap="small">
                <s-text>
                  {testGenerationUsage.count}/{testGenerationUsage.limit} test
                  generations used this month
                </s-text>
              </s-stack>
              <div
                style={{
                  height: "8px",
                  backgroundColor: "#e0e0e0",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (testGenerationUsage.count / testGenerationUsage.limit) * 100)}%`,
                    backgroundColor:
                      testGenerationUsage.remaining > 10
                        ? "#22c55e"
                        : "#f59e0b",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              {testGenerationUsage.remaining <= 0 && (
                <s-banner tone="warning">
                  <s-text>
                    Monthly limit reached. Test generations will reset next
                    month.
                  </s-text>
                </s-banner>
              )}
            </s-stack>

            <s-divider />

            {/* Test Form */}
            <Form method="post">
              <input
                type="hidden"
                name="intent"
                value="template_test_generate"
              />
              <input type="hidden" name="template_id" value={template.id} />
              <input
                type="hidden"
                name="variable_values_json"
                value={JSON.stringify(testVariableValues)}
              />

              <s-stack direction="block" gap="base">
                {/* Photo URL Input */}
                <s-text-field
                  label="Test Photo URL"
                  name="test_photo_url"
                  placeholder="https://example.com/photo.jpg"
                  value={testPhotoUrl}
                  onChange={(event: { currentTarget: { value: string } }) =>
                    setTestPhotoUrl(event.currentTarget.value)
                  }
                />
                <s-text color="subdued">
                  Enter a publicly accessible URL to a test image
                </s-text>

                {template.variables.length > 0 && (
                  <s-stack direction="block" gap="small">
                    <s-text>
                      <strong>Variable Values</strong>
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
                          value={testVariableValues[variable.name] ?? ""}
                          onChange={(event: {
                            currentTarget: { value: string };
                          }) =>
                            setTestVariableValues((prev) => ({
                              ...prev,
                              [variable.name]: event.currentTarget.value,
                            }))
                          }
                        />
                      ))}
                    </s-stack>
                  </s-stack>
                )}

                {/* Text Input (if enabled) */}
                {template.textInputEnabled && (
                  <s-text-field
                    label="Test Text (optional)"
                    name="test_text"
                    placeholder="Enter test text for generation"
                  />
                )}

                {/* Number of Images Selector */}
                <s-stack direction="block" gap="small">
                  <label htmlFor="num_images">
                    <strong>Number of images</strong>
                  </label>
                  <s-stack direction="inline" gap="small">
                    {[1, 2, 3, 4].map((n) => (
                      <s-button
                        key={n}
                        type="button"
                        variant={
                          numImagesToGenerate === n ? "primary" : "secondary"
                        }
                        onClick={() => setNumImagesToGenerate(n)}
                      >
                        {n}
                      </s-button>
                    ))}
                  </s-stack>
                  <input
                    type="hidden"
                    name="num_images"
                    value={numImagesToGenerate}
                  />
                </s-stack>

                {/* Estimated Cost Display */}
                <s-banner tone="info">
                  <s-stack direction="block" gap="small">
                    <s-text>
                      <strong>
                        Estimated cost: ${estimatedCost.toFixed(2)}
                      </strong>
                    </s-text>
                    <s-text color="subdued">
                      Generation: ${generationPrice.toFixed(2)} ×{" "}
                      {numImagesToGenerate} = $
                      {estimatedGenerationCost.toFixed(2)}
                      {removeBackgroundEnabled && (
                        <>
                          <br />
                          Remove Background: ${REMOVE_BG_PRICE_USD.toFixed(
                            3,
                          )} × {numImagesToGenerate} = $
                          {estimatedRemoveBgCost.toFixed(2)}
                        </>
                      )}
                    </s-text>
                  </s-stack>
                </s-banner>

                {/* Generate Button */}
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isTestGenerating}
                  disabled={
                    !testPhotoUrl.trim() ||
                    testGenerationUsage.remaining <= 0 ||
                    isTestGenerating
                  }
                >
                  {isTestGenerating
                    ? "Generating..."
                    : `Generate ${numImagesToGenerate} Image${numImagesToGenerate > 1 ? "s" : ""}`}
                </s-button>
              </s-stack>
            </Form>

            {/* Results Gallery */}
            {testResults && (
              <s-stack direction="block" gap="base">
                <s-divider />
                <s-text>
                  <strong>Generated Images</strong>
                </s-text>
                <s-text color="subdued">
                  Total time: {testResults.total_time_seconds.toFixed(1)}s |
                  Total cost: ${testResults.total_cost_usd.toFixed(2)}
                </s-text>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {testResults.results.map((result, index) => (
                    <div
                      key={index}
                      style={{
                        border: "1px solid #e0e0e0",
                        borderRadius: "8px",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={result.url}
                        alt={`Generated image ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "200px",
                          objectFit: "cover",
                        }}
                      />
                      <div style={{ padding: "8px" }}>
                        <s-text color="subdued">
                          {result.generation_time_seconds?.toFixed(1) ?? "—"}s |
                          ${result.cost_usd.toFixed(2)}
                        </s-text>
                      </div>
                    </div>
                  ))}
                </div>
              </s-stack>
            )}

            {/* Error Display */}
            {errorMessage &&
              actionData &&
              typeof actionData === "object" &&
              "error" in actionData &&
              (actionData.error as { code?: string })?.code ===
                "generation_failed" && (
                <s-banner tone="critical">
                  <s-stack direction="block" gap="small">
                    <s-text>{errorMessage}</s-text>
                    <s-text color="subdued">
                      Please try again or check your photo URL.
                    </s-text>
                  </s-stack>
                </s-banner>
              )}

            {/* Remove Background Error */}
            {errorMessage &&
              actionData &&
              typeof actionData === "object" &&
              "error" in actionData &&
              (actionData.error as { code?: string })?.code ===
                "remove_bg_failed" && (
                <s-banner tone="critical">
                  <s-stack direction="block" gap="small">
                    <s-text>{errorMessage}</s-text>
                    <s-text color="subdued">
                      Background removal failed. This usually happens with
                      certain image formats or transparent images. Try a
                      different photo.
                    </s-text>
                  </s-stack>
                </s-banner>
              )}

            {/* Rate Limit Error */}
            {errorMessage &&
              actionData &&
              typeof actionData === "object" &&
              "error" in actionData &&
              (actionData.error as { code?: string })?.code ===
                "rate_limited" && (
                <s-banner tone="warning">
                  <s-text>{errorMessage}</s-text>
                </s-banner>
              )}
          </s-stack>
        </s-section>
      )}

      {/* Delete Section */}
      <s-section heading="Danger Zone">
        <s-stack direction="block" gap="base">
          {showDeleteConfirm ? (
            <s-stack direction="block" gap="small">
              <s-banner tone="critical">
                <s-text>
                  Are you sure you want to delete this template? This cannot be
                  undone.
                </s-text>
              </s-banner>
              <s-stack direction="inline" gap="small">
                <Form method="post">
                  <input type="hidden" name="intent" value="template_delete" />
                  <input type="hidden" name="template_id" value={template.id} />
                  <s-button
                    type="submit"
                    variant="primary"
                    tone="critical"
                    loading={isDeleting}
                  >
                    Confirm Delete
                  </s-button>
                </Form>
                <s-button
                  variant="secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </s-button>
              </s-stack>
            </s-stack>
          ) : (
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Template
            </s-button>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
