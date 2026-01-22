import { afterEach, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../db.server";
import {
  createMerchantPreview,
  getMerchantPreviewByJobId,
  updateMerchantPreview,
} from "./merchant-previews.server";

describe("merchant previews", () => {
  const shopId = "shop-1";
  const jobId = "job-123";

  beforeEach(async () => {
    await prisma.merchantPreview.deleteMany({ where: { shop_id: shopId } });
  });

  afterEach(async () => {
    await prisma.merchantPreview.deleteMany({ where: { shop_id: shopId } });
  });

  it("creates and fetches a preview", async () => {
    const created = await createMerchantPreview({
      jobId,
      shopId,
      productId: "product-1",
      templateId: "template-1",
      coverPrintArea: true,
      testImageUrl: "https://example.com/input.png",
      testText: "hello",
      variableValues: { name: "value" },
    });

    expect(created.status).toBe("queued");

    const fetched = await getMerchantPreviewByJobId(shopId, jobId);
    expect(fetched?.jobId).toBe(jobId);
    expect(fetched?.variableValues).toEqual({ name: "value" });
  });

  it("updates preview status and assets", async () => {
    await createMerchantPreview({
      jobId,
      shopId,
      productId: "product-1",
      templateId: "template-1",
      coverPrintArea: false,
      testImageUrl: "https://example.com/input.png",
      variableValues: {},
    });

    const updated = await updateMerchantPreview({
      jobId,
      shopId,
      status: "done",
      designUrl: "https://example.com/design.png",
      mockupUrls: ["https://example.com/mockup.png"],
    });

    expect(updated?.status).toBe("done");
    expect(updated?.mockupUrls).toEqual([
      "https://example.com/mockup.png",
    ]);
  });
});
