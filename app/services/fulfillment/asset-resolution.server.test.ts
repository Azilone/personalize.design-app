/**
 * Tests for asset resolution service.
 *
 * Tests verify:
 * - Asset resolution by personalization_id
 * - Error handling for missing/inaccessible assets
 * - Signed URL generation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveAssetByPersonalizationId,
  generateAssetSignedUrl,
  retrieveAssetForFulfillment,
  AssetResolutionError,
  type ResolvedAsset,
} from "./asset-resolution.server";

// Mock dependencies
vi.mock("../supabase/storage", () => ({
  createSignedReadUrl: vi.fn(),
  fileExists: vi.fn(),
  GENERATED_DESIGNS_BUCKET: "generated-designs",
}));

vi.mock("../previews/preview-jobs.server", () => ({
  getPreviewJobById: vi.fn(),
}));

vi.mock("../../lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createSignedReadUrl, fileExists } from "../supabase/storage";
import { getPreviewJobById } from "../previews/preview-jobs.server";

const mockCreateSignedReadUrl = vi.mocked(createSignedReadUrl);
const mockFileExists = vi.mocked(fileExists);
const mockGetPreviewJobById = vi.mocked(getPreviewJobById);

describe("Asset Resolution Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveAssetByPersonalizationId", () => {
    const shopId = "shop-123";
    const orderLineId = "line-456";
    const personalizationId = "job-789";

    it("should resolve asset when preview job exists with valid design", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "done",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);
      mockFileExists.mockResolvedValue(true);

      const result = await resolveAssetByPersonalizationId(
        shopId,
        orderLineId,
        personalizationId,
      );

      expect(result).toEqual({
        bucket: "generated-designs",
        storageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        jobId: personalizationId,
        templateId: "template-456",
        productId: "product-123",
      });

      expect(mockGetPreviewJobById).toHaveBeenCalledWith(
        shopId,
        personalizationId,
      );
      expect(mockFileExists).toHaveBeenCalledWith(
        "designs/shop-123/job-789.png",
        "generated-designs",
      );
    });

    it("should resolve asset when job status is mockups_failed", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "mockups_failed",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);
      mockFileExists.mockResolvedValue(true);

      const result = await resolveAssetByPersonalizationId(
        shopId,
        orderLineId,
        personalizationId,
      );

      expect(result.storageKey).toBe("designs/shop-123/job-789.png");
    });

    it("should throw AssetResolutionError when preview job not found", async () => {
      mockGetPreviewJobById.mockResolvedValue(null);

      await expect(
        resolveAssetByPersonalizationId(shopId, orderLineId, personalizationId),
      ).rejects.toThrow(AssetResolutionError);

      await expect(
        resolveAssetByPersonalizationId(shopId, orderLineId, personalizationId),
      ).rejects.toThrow("No preview job found for personalization_id");
    });

    it("should throw AssetResolutionError with correct code when job not found", async () => {
      mockGetPreviewJobById.mockResolvedValue(null);

      try {
        await resolveAssetByPersonalizationId(
          shopId,
          orderLineId,
          personalizationId,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AssetResolutionError);
        expect((error as AssetResolutionError).code).toBe("asset_not_found");
        expect((error as AssetResolutionError).retryable).toBe(false);
      }
    });

    it("should throw AssetResolutionError when design storage key is missing", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: null,
        designUrl: null,
        status: "done",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);

      await expect(
        resolveAssetByPersonalizationId(shopId, orderLineId, personalizationId),
      ).rejects.toThrow("design has not been stored");
    });

    it("should throw AssetResolutionError when job status is invalid", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "queued",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);

      try {
        await resolveAssetByPersonalizationId(
          shopId,
          orderLineId,
          personalizationId,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AssetResolutionError);
        expect((error as AssetResolutionError).code).toBe("asset_inaccessible");
        expect((error as AssetResolutionError).message).toContain("queued");
      }
    });

    it("should throw AssetResolutionError when file does not exist in storage", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "done",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);
      mockFileExists.mockResolvedValue(false);

      try {
        await resolveAssetByPersonalizationId(
          shopId,
          orderLineId,
          personalizationId,
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AssetResolutionError);
        expect((error as AssetResolutionError).code).toBe("asset_not_found");
        expect((error as AssetResolutionError).message).toContain(
          "not found in storage",
        );
      }
    });

    it("should propagate storage errors from fileExists", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "done",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);
      const storageError = new Error("Network error");
      mockFileExists.mockRejectedValue(storageError);

      await expect(
        resolveAssetByPersonalizationId(shopId, orderLineId, personalizationId),
      ).rejects.toThrow(storageError);
    });

    it("should throw AssetResolutionError when personalization_id is empty", async () => {
      await expect(
        resolveAssetByPersonalizationId(shopId, orderLineId, ""),
      ).rejects.toThrow("Personalization ID is required");

      try {
        await resolveAssetByPersonalizationId(shopId, orderLineId, "");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AssetResolutionError);
        expect((error as AssetResolutionError).code).toBe(
          "invalid_personalization_id",
        );
      }
    });
  });

  describe("generateAssetSignedUrl", () => {
    const mockAsset: ResolvedAsset = {
      bucket: "generated-designs",
      storageKey: "designs/shop-123/job-789.png",
      designUrl: "https://example.com/design.png",
      jobId: "job-789",
      templateId: "template-456",
      productId: "product-123",
    };

    it("should generate signed URL for asset", async () => {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      mockCreateSignedReadUrl.mockResolvedValue({
        readUrl: "https://signed.example.com/design.png?token=abc123",
        expiresAt,
      });

      const result = await generateAssetSignedUrl(mockAsset);

      expect(result.signedUrl).toBe(
        "https://signed.example.com/design.png?token=abc123",
      );
      expect(result.expiresAt).toBe(expiresAt);
      expect(result.storageKey).toBe(mockAsset.storageKey);
      expect(result.bucket).toBe(mockAsset.bucket);

      expect(mockCreateSignedReadUrl).toHaveBeenCalledWith(
        mockAsset.storageKey,
        mockAsset.bucket,
      );
    });

    it("should throw AssetResolutionError when signed URL generation fails", async () => {
      mockCreateSignedReadUrl.mockRejectedValue(
        new Error("Storage service error"),
      );

      await expect(generateAssetSignedUrl(mockAsset)).rejects.toThrow(
        AssetResolutionError,
      );

      await expect(generateAssetSignedUrl(mockAsset)).rejects.toThrow(
        "Failed to generate signed URL",
      );
    });

    it("should mark storage errors as retryable", async () => {
      mockCreateSignedReadUrl.mockRejectedValue(
        new Error("Storage service error"),
      );

      try {
        await generateAssetSignedUrl(mockAsset);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AssetResolutionError);
        expect((error as AssetResolutionError).code).toBe("storage_error");
        expect((error as AssetResolutionError).retryable).toBe(true);
      }
    });
  });

  describe("retrieveAssetForFulfillment", () => {
    const shopId = "shop-123";
    const orderLineId = "line-456";
    const personalizationId = "job-789";

    it("should resolve asset and generate signed URL", async () => {
      const mockJob = {
        jobId: personalizationId,
        shopId,
        productId: "product-123",
        templateId: "template-456",
        designStorageKey: "designs/shop-123/job-789.png",
        designUrl: "https://example.com/design.png",
        status: "done",
      };

      mockGetPreviewJobById.mockResolvedValue(mockJob as any);
      mockFileExists.mockResolvedValue(true);

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      mockCreateSignedReadUrl.mockResolvedValue({
        readUrl: "https://signed.example.com/design.png?token=abc123",
        expiresAt,
      });

      const result = await retrieveAssetForFulfillment(
        shopId,
        orderLineId,
        personalizationId,
      );

      expect(result.signedUrl).toBe(
        "https://signed.example.com/design.png?token=abc123",
      );
      expect(result.storageKey).toBe("designs/shop-123/job-789.png");
      expect(result.templateId).toBe("template-456");
      expect(result.productId).toBe("product-123");
    });

    it("should propagate resolution errors", async () => {
      mockGetPreviewJobById.mockResolvedValue(null);

      await expect(
        retrieveAssetForFulfillment(shopId, orderLineId, personalizationId),
      ).rejects.toThrow(AssetResolutionError);
    });
  });
});
