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
import {
  getTemplate,
  updateTemplate,
  deleteTemplate,
  type DesignTemplateDto,
} from "../../../../services/templates/templates.server";
import logger from "../../../../lib/logger";

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

  const { template_name, text_input_enabled, prompt, variable_names_json } =
    parsed.data;

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
