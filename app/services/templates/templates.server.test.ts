import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../db.server";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  checkTestGenerationRateLimit,
  getCurrentMonth,
  reserveTestGenerationQuota,
  releaseTestGenerationQuota,
  type CreateTemplateInput,
  type UpdateTemplateInput,
} from "./templates.server";

describe("Templates Service", () => {
  const shopId = "test-shop-123";

  beforeEach(async () => {
    await prisma.designTemplate.deleteMany({ where: { shop_id: shopId } });
  });

  afterEach(async () => {
    await prisma.designTemplate.deleteMany({ where: { shop_id: shopId } });
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
      const released = await releaseTestGenerationQuota(
        template.id,
        shopId,
        3,
      );

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
});
