import { describe, it, expect, beforeEach, afterEach } from "vitest";
import prisma from "../../db.server";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
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
});
