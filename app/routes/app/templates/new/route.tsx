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
  validateVariableNames,
  validatePromptVariableReferences,
} from "../../../../lib/prompt-variables";
import { createTemplate } from "../../../../services/templates/templates.server";
import { getAllModelConfigs } from "../../../../services/fal/registry";
import {
  MVP_GENERATION_MODEL_ID,
  MVP_PRICE_USD_PER_GENERATION,
} from "../../../../lib/generation-settings";
import {
  DEFAULT_TEMPLATE_ASPECT_RATIO,
  TEMPLATE_ASPECT_RATIO_LABELS,
  TEMPLATE_ASPECT_RATIOS,
  type TemplateAspectRatio,
} from "../../../../lib/template-aspect-ratios";
import logger from "../../../../lib/logger";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const modelConfigs = getAllModelConfigs();

  return {
    mode: "create" as const,
    template: null,
    modelConfigs,
  };
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

  if (parsed.data.intent !== "template_create") {
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
    aspect_ratio,
    generation_model_identifier,
    price_usd_per_generation,
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
    const template = await createTemplate({
      shopId,
      templateName: template_name,
      photoRequired: true,
      textInputEnabled: text_input_enabled === "true",
      prompt: prompt || null,
      generationModelIdentifier:
        generation_model_identifier ?? MVP_GENERATION_MODEL_ID,
      priceUsdPerGeneration:
        price_usd_per_generation ?? MVP_PRICE_USD_PER_GENERATION,
      aspectRatio: aspect_ratio,
      variableNames,
    });

    logger.info(
      { shop_id: shopId, template_id: template.id },
      "Template created",
    );

    return data({ success: true, templateId: template.id });
  } catch (error) {
    logger.error({ shop_id: shopId, err: error }, "Template creation failed");

    return data(
      {
        error: {
          code: "internal_error",
          message: "Failed to create template. Please try again.",
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

export default function TemplateNewPage() {
  const loaderData = useLoaderData<typeof loader>();
  // Use a type assertion if TS complains about missing modelConfigs in the generic type inference
  // because useLoaderData infers from the loader return type which might be implicit
  const { modelConfigs } = loaderData as unknown as {
    modelConfigs: {
      modelId: string;
      displayName: string;
      pricePerImage: number;
    }[];
  };

  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const { search } = useLocation();
  const embeddedSearch = buildEmbeddedSearch(search);
  const templatesHref = `/app/templates${embeddedSearch}`;

  const isSubmitting = navigation.state === "submitting";

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

  const createdTemplateId =
    actionData &&
    typeof actionData === "object" &&
    "templateId" in actionData &&
    typeof actionData.templateId === "string"
      ? actionData.templateId
      : null;

  // State for form fields
  const [templateName, setTemplateName] = useState("");
  const [textInputEnabled, setTextInputEnabled] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_TEMPLATE_ASPECT_RATIO);
  const [prompt, setPrompt] = useState("");
  const [variableNames, setVariableNames] = useState<string[]>([]);
  const [variableInput, setVariableInput] = useState("");

  // Generation settings
  const [generationModel, setGenerationModel] = useState(
    MVP_GENERATION_MODEL_ID,
  );
  const [generationPrice, setGenerationPrice] = useState(
    MVP_PRICE_USD_PER_GENERATION,
  );

  // Update price when model changes
  const handleModelChange = (newModelId: string) => {
    setGenerationModel(newModelId);
    const config = modelConfigs.find((c) => c.modelId === newModelId);
    if (config) {
      setGenerationPrice(config.pricePerImage);
    }
  };

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

  // Redirect after success
  useEffect(() => {
    if (success && createdTemplateId) {
      navigate(`/app/templates/${createdTemplateId}${embeddedSearch}`);
    }
  }, [success, createdTemplateId, embeddedSearch, navigate]);

  return (
    <s-page heading="Create Template">
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
              <s-text>Template created successfully!</s-text>
            </s-banner>
          ) : null}

          <Form method="post">
            <input type="hidden" name="intent" value="template_create" />
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
                <label htmlFor="aspect_ratio">
                  <strong>Base aspect ratio</strong>
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    id="aspect_ratio"
                    name="aspect_ratio"
                    value={aspectRatio}
                    onChange={(event) =>
                      setAspectRatio(event.target.value as TemplateAspectRatio)
                    }
                    style={{
                      width: "100%",
                      padding: "8px 32px 8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      appearance: "none",
                    }}
                  >
                    {TEMPLATE_ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {TEMPLATE_ASPECT_RATIO_LABELS[ratio]}
                      </option>
                    ))}
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
                  Used when &quot;Cover entire print area&quot; is disabled in
                  previews.
                </s-text>
              </s-stack>

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
                <label htmlFor="generation_model">
                  <strong>Model</strong>
                </label>
                <div style={{ position: "relative" }}>
                  <select
                    id="generation_model"
                    value={generationModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 32px 8px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      appearance: "none",
                    }}
                  >
                    {modelConfigs.map((config) => (
                      <option key={config.modelId} value={config.modelId}>
                        {config.displayName}
                      </option>
                    ))}
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
              </s-stack>

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

              <s-stack direction="inline" gap="base">
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                >
                  Save Draft
                </s-button>
                <Link to={templatesHref}>Cancel</Link>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>
    </s-page>
  );
}
