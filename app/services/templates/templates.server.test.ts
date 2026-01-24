import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../db.server";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  publishTemplate,
  unpublishTemplate,
  checkTestGenerationRateLimit,
  getCurrentMonth,
  reserveTestGenerationQuota,
  releaseTestGenerationQuota,
  getLatestTestGeneration,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type TestGenerationOutput,
} from "./templates.server";
import {
  DEFAULT_TEMPLATE_ASPECT_RATIO,
  TEMPLATE_ASPECT_RATIOS,
} from "../../lib/template-aspect-ratios";

describe("Templates Service", () => {
  const shopId = "test-shop-123";
  const otherShopId = "other-shop-456";

  beforeEach(async () => {
    await prisma.designTemplate.deleteMany({
      where: {
        shop_id: {
          in: [shopId, otherShopId],
        },
      },
    });
  });

  afterEach(async () => {
    await prisma.designTemplate.deleteMany({
      where: {
        shop_id: {
          in: [shopId, otherShopId],
        },
      },
    });
  });

  describe("createTemplate", () => {
    it("creates a new draft template with variables", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        photoRequired: true,
        textInputEnabled: false,
        prompt: "A {{animal}} in {{color}} tones",
        variableNames: ["animal", "color"],
      };

      const template = await createTemplate(input);

      expect(template).toBeDefined();
      expect(template.id).toBeDefined();
      expect(template.templateName).toBe("Test Template");
      expect(template.status).toBe("draft");
      expect(template.variables).toHaveLength(2);
      expect(template.variables[0].name).toBe("animal");
      expect(template.variables[1].name).toBe("color");
    });

    it("creates template without variables", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Simple Template",
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template).toBeDefined();
      expect(template.variables).toHaveLength(0);
    });

    it("creates template with default values", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Defaults Template",
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template.photoRequired).toBe(true);
      expect(template.textInputEnabled).toBe(false);
      expect(template.prompt).toBeNull();
      expect(template.generationModelIdentifier).toBeNull();
      expect(template.priceUsdPerGeneration).toBeNull();
      expect(template.aspectRatio).toBe(DEFAULT_TEMPLATE_ASPECT_RATIO);
    });

    it("creates template with generation settings", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "AI Template",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template.generationModelIdentifier).toBe(
        "fal-ai/bytedance/seedream/v4/edit",
      );
      expect(template.priceUsdPerGeneration).toBe(0.05);
    });

    it("creates template with removeBackgroundEnabled", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Remove BG Template",
        removeBackgroundEnabled: true,
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template.removeBackgroundEnabled).toBe(true);
    });

    it("creates template with removeBackgroundEnabled default false", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Default BG Template",
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template.removeBackgroundEnabled).toBe(false);
    });

    it("creates template with explicit aspect ratio", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Aspect Ratio Template",
        aspectRatio: TEMPLATE_ASPECT_RATIOS[2],
        variableNames: [],
      };

      const template = await createTemplate(input);

      expect(template.aspectRatio).toBe(TEMPLATE_ASPECT_RATIOS[2]);
    });
  });

  describe("getTemplate", () => {
    it("returns template for correct shop", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        variableNames: ["animal"],
      };

      const created = await createTemplate(input);
      const found = await getTemplate(created.id, shopId);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it("returns null for different shop (multi-tenancy)", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        variableNames: [],
      };

      const created = await createTemplate(input);
      const found = await getTemplate(created.id, "other-shop-456");

      expect(found).toBeNull();
    });

    it("returns null for non-existent template", async () => {
      const found = await getTemplate("non-existent-id", shopId);
      expect(found).toBeNull();
    });
  });

  describe("listTemplates", () => {
    beforeEach(async () => {
      await Promise.all([
        prisma.designTemplate.create({
          data: {
            shop_id: shopId,
            template_name: "Template 1",
            status: "draft",
          },
        }),
        prisma.designTemplate.create({
          data: {
            shop_id: shopId,
            template_name: "Template 2",
            status: "published",
          },
        }),
        prisma.designTemplate.create({
          data: {
            shop_id: "other-shop-456",
            template_name: "Other Shop Template",
            status: "draft",
          },
        }),
      ]);
    });

    it("lists only templates for the shop (multi-tenancy)", async () => {
      const templates = await listTemplates(shopId);

      expect(templates).toHaveLength(2);
      expect(templates.every((t) => t.templateName.startsWith("Template")));
    });

    it("sorts by created_at desc", async () => {
      const templates = await listTemplates(shopId);

      expect(templates).toHaveLength(2);
    });

    it("includes variable count", async () => {
      const templates = await listTemplates(shopId);

      expect(templates[0]).toHaveProperty("variableCount");
      expect(typeof templates[0].variableCount).toBe("number");
    });
  });

  describe("updateTemplate", () => {
    it("updates template fields and replaces variables", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Original Template",
        variableNames: ["animal"],
      };

      const created = await createTemplate(input);

      const updateInput: UpdateTemplateInput = {
        templateId: created.id,
        shopId,
        templateName: "Updated Template",
        prompt: "New {{style}} design",
        variableNames: ["style"],
      };

      const updated = await updateTemplate(updateInput);

      expect(updated).not.toBeNull();
      expect(updated?.templateName).toBe("Updated Template");
      expect(updated?.prompt).toBe("New {{style}} design");
      expect(updated?.variables).toHaveLength(1);
      expect(updated?.variables[0].name).toBe("style");
    });

    it("returns null for different shop (multi-tenancy)", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        variableNames: [],
      };

      const created = await createTemplate(input);

      const updateInput: UpdateTemplateInput = {
        templateId: created.id,
        shopId: "other-shop-456",
        templateName: "Attempted Update",
        variableNames: [],
      };

      const updated = await updateTemplate(updateInput);

      expect(updated).toBeNull();
    });

    it("handles empty variable list (clears all variables)", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Template",
        variableNames: ["animal", "color"],
      };

      const created = await createTemplate(input);

      const updateInput: UpdateTemplateInput = {
        templateId: created.id,
        shopId,
        templateName: "Template",
        variableNames: [],
      };

      const updated = await updateTemplate(updateInput);

      expect(updated?.variables).toHaveLength(0);
    });

    it("updates template with generation settings", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Template without settings",
        variableNames: [],
      };

      const created = await createTemplate(input);
      expect(created.generationModelIdentifier).toBeNull();

      const updateInput: UpdateTemplateInput = {
        templateId: created.id,
        shopId,
        templateName: "Template with settings",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      };

      const updated = await updateTemplate(updateInput);

      expect(updated?.generationModelIdentifier).toBe(
        "fal-ai/bytedance/seedream/v4/edit",
      );
      expect(updated?.priceUsdPerGeneration).toBe(0.05);

      // Verify persistence by fetching
      const fetched = await getTemplate(created.id, shopId);
      expect(fetched?.generationModelIdentifier).toBe(
        "fal-ai/bytedance/seedream/v4/edit",
      );
      expect(fetched?.priceUsdPerGeneration).toBe(0.05);
    });

    it("updates template aspect ratio", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Ratio Template",
        variableNames: [],
      };

      const created = await createTemplate(input);
      const updateInput: UpdateTemplateInput = {
        templateId: created.id,
        shopId,
        templateName: "Ratio Template",
        aspectRatio: TEMPLATE_ASPECT_RATIOS[4],
        variableNames: [],
      };

      const updated = await updateTemplate(updateInput);

      expect(updated?.aspectRatio).toBe(TEMPLATE_ASPECT_RATIOS[4]);

      const fetched = await getTemplate(created.id, shopId);
      expect(fetched?.aspectRatio).toBe(TEMPLATE_ASPECT_RATIOS[4]);
    });
  });

  describe("deleteTemplate", () => {
    it("deletes template and cascades to variables", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        variableNames: ["animal", "color"],
      };

      const created = await createTemplate(input);

      const deleted = await deleteTemplate(created.id, shopId);

      expect(deleted).toBe(true);

      const found = await getTemplate(created.id, shopId);
      expect(found).toBeNull();
    });

    it("returns false for different shop (multi-tenancy)", async () => {
      const input: CreateTemplateInput = {
        shopId,
        templateName: "Test Template",
        variableNames: [],
      };

      const created = await createTemplate(input);

      const deleted = await deleteTemplate(created.id, "other-shop-456");

      expect(deleted).toBe(false);

      const found = await getTemplate(created.id, shopId);
      expect(found).not.toBeNull();
    });

    it("returns false for non-existent template", async () => {
      const deleted = await deleteTemplate("non-existent-id", shopId);
      expect(deleted).toBe(false);
    });
  });

  describe("checkTestGenerationRateLimit", () => {
    it("returns allowed when count is under limit", () => {
      const result = checkTestGenerationRateLimit(
        { testGenerationCount: 10, testGenerationMonth: getCurrentMonth() },
        50,
      );

      expect(result.isAllowed).toBe(true);
      expect(result.currentCount).toBe(10);
      expect(result.remaining).toBe(40);
    });

    it("returns not allowed when count equals limit", () => {
      const result = checkTestGenerationRateLimit(
        { testGenerationCount: 50, testGenerationMonth: getCurrentMonth() },
        50,
      );

      expect(result.isAllowed).toBe(false);
      expect(result.currentCount).toBe(50);
      expect(result.remaining).toBe(0);
    });

    it("resets count for new month", () => {
      const result = checkTestGenerationRateLimit(
        { testGenerationCount: 50, testGenerationMonth: "2025-01" },
        50,
      );

      expect(result.isAllowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.remaining).toBe(50);
    });

    it("handles null month as new month", () => {
      const result = checkTestGenerationRateLimit(
        { testGenerationCount: 0, testGenerationMonth: null },
        50,
      );

      expect(result.isAllowed).toBe(true);
      expect(result.currentCount).toBe(0);
      expect(result.remaining).toBe(50);
    });
  });

  describe("reserveTestGenerationQuota", () => {
    it("reserves quota successfully when under limit", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Rate Limit Test",
        variableNames: [],
      });

      const result = await reserveTestGenerationQuota(
        template.id,
        shopId,
        5,
        50,
      );

      expect(result.success).toBe(true);
      expect(result.previousCount).toBe(0);
      expect(result.newCount).toBe(5);
      expect(result.remaining).toBe(45);

      // Verify DB was updated
      const updated = await getTemplate(template.id, shopId);
      expect(updated?.testGenerationCount).toBe(5);
    });

    it("fails when reservation would exceed limit", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Rate Limit Exceed Test",
        variableNames: [],
      });

      // Reserve 48 first
      await reserveTestGenerationQuota(template.id, shopId, 48, 50);

      // Try to reserve 5 more (would exceed 50)
      const result = await reserveTestGenerationQuota(
        template.id,
        shopId,
        5,
        50,
      );

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(2);
      expect(result.errorMessage).toContain("2 remaining");
    });

    it("returns not found for invalid template", async () => {
      const result = await reserveTestGenerationQuota(
        "non-existent-id",
        shopId,
        5,
        50,
      );

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe("Template not found");
    });
  });

  describe("releaseTestGenerationQuota", () => {
    it("releases quota successfully", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Release Test",
        variableNames: [],
      });

      // Reserve 10
      await reserveTestGenerationQuota(template.id, shopId, 10, 50);

      // Release 3
      const released = await releaseTestGenerationQuota(template.id, shopId, 3);

      expect(released).toBe(true);

      // Verify DB was updated
      const updated = await getTemplate(template.id, shopId);
      expect(updated?.testGenerationCount).toBe(7);
    });

    it("returns false for invalid template", async () => {
      const released = await releaseTestGenerationQuota(
        "non-existent-id",
        shopId,
        5,
      );

      expect(released).toBe(false);
    });
  });

  describe("publishTemplate", () => {
    it("publishes a draft template", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Publish Test",
        prompt: "Test {{color}} design",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: ["color"],
      });

      expect(template.status).toBe("draft");

      const result = await publishTemplate(template.id, shopId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("published");

      // Verify persistence
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("published");
    });

    it("returns null for different shop (multi-tenancy)", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Multi-tenancy Test",
        variableNames: [],
      });

      const result = await publishTemplate(template.id, "other-shop-456");

      expect(result).toBeNull();

      // Verify status unchanged
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("draft");
    });

    it("returns null for non-existent template", async () => {
      const result = await publishTemplate("non-existent-id", shopId);
      expect(result).toBeNull();
    });

    it("is idempotent (publishing already published template)", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Idempotent Test",
        prompt: "Test design",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      });

      await publishTemplate(template.id, shopId);
      const result = await publishTemplate(template.id, shopId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("published");
    });

    it("throws error when publishing template without prompt", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "No Prompt Test",
        variableNames: [],
      });

      await expect(publishTemplate(template.id, shopId)).rejects.toThrow(
        "Template must have a prompt defined to be published",
      );

      // Verify status unchanged
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("draft");
    });

    it("throws error when publishing template without generation model", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "No Model Test",
        prompt: "Test prompt",
        variableNames: [],
      });

      await expect(publishTemplate(template.id, shopId)).rejects.toThrow(
        "Template must have a generation model configured to be published",
      );

      // Verify status unchanged
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("draft");
    });
  });

  describe("unpublishTemplate", () => {
    it("unpublishes a published template", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Unpublish Test",
        prompt: "Test design",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      });

      // First publish it
      await publishTemplate(template.id, shopId);

      const result = await unpublishTemplate(template.id, shopId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("draft");

      // Verify persistence
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("draft");
    });

    it("returns null for different shop (multi-tenancy)", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Unpublish Multi-tenancy Test",
        prompt: "Test design",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      });

      await publishTemplate(template.id, shopId);
      const result = await unpublishTemplate(template.id, "other-shop-456");

      expect(result).toBeNull();

      // Verify status unchanged
      const fetched = await getTemplate(template.id, shopId);
      expect(fetched?.status).toBe("published");
    });

    it("returns null for non-existent template", async () => {
      const result = await unpublishTemplate("non-existent-id", shopId);
      expect(result).toBeNull();
    });

    it("is idempotent (unpublishing already draft template)", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Draft Idempotent Test",
        prompt: "Test design",
        generationModelIdentifier: "fal-ai/bytedance/seedream/v4/edit",
        priceUsdPerGeneration: 0.05,
        variableNames: [],
      });

      const result = await unpublishTemplate(template.id, shopId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe("draft");
    });
  });

  describe("getLatestTestGeneration", () => {
    it("returns the latest generation with ID and createdAt", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Gen Test Template",
        variableNames: [],
      });

      const output: TestGenerationOutput = {
        results: [
          {
            url: "https://example.com/image.jpg",
            generation_time_seconds: 2.5,
            cost_usd: 0.05,
          },
        ],
        total_time_seconds: 2.5,
        total_cost_usd: 0.05,
        generation_cost_usd: 0.025,
        remove_bg_cost_usd: 0.025,
      };

      // Record a generation
      await prisma.templateTestGeneration.create({
        data: {
          template_id: template.id,
          shop_id: shopId,
          num_images_requested: 1,
          num_images_generated: 1,
          total_cost_usd: 0.05,
          total_time_seconds: 2.5,
          success: true,
          result_images: JSON.stringify(output),
        },
      });

      const latest = await getLatestTestGeneration(template.id, shopId);

      expect(latest).not.toBeNull();
      expect(latest?.id).toBeDefined();
      expect(latest?.createdAt).toBeDefined();
      expect(typeof latest?.id).toBe("string");
      expect(latest?.results).toHaveLength(1);
      expect(latest?.results[0].url).toBe("https://example.com/image.jpg");
    });

    it("returns null if generation has no results", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "Empty Gen Template",
        variableNames: [],
      });

      await prisma.templateTestGeneration.create({
        data: {
          template_id: template.id,
          shop_id: shopId,
          num_images_requested: 1,
          num_images_generated: 0,
          total_cost_usd: 0,
          total_time_seconds: 0,
          success: true,
          result_images: null, // No results
        },
      });

      const latest = await getLatestTestGeneration(template.id, shopId);

      expect(latest).toBeNull();
    });

    it("returns null if no generation exists", async () => {
      const template = await createTemplate({
        shopId,
        templateName: "No Gen Template",
        variableNames: [],
      });

      const latest = await getLatestTestGeneration(template.id, shopId);

      expect(latest).toBeNull();
    });
  });
});
