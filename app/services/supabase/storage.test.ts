/**
 * Tests for Supabase Storage service.
 *
 * Tests verify file validation, storage key generation,
 * and signed URL generation.
 */

import { describe, it, expect } from "vitest";
import {
  getFileExtension,
  validateFileType,
  validateFileSize,
  generateStorageKey,
  generateSignedUrls,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  StorageError,
} from "./storage";

describe("Supabase storage", () => {
  describe("ALLOWED_FILE_TYPES", () => {
    it("should include all expected file types", () => {
      expect(ALLOWED_FILE_TYPES).toEqual(
        expect.arrayContaining(["jpeg", "jpg", "png", "heic", "avif", "webp"]),
      );
    });
  });

  describe("MAX_FILE_SIZE_BYTES", () => {
    it("should be 10MB", () => {
      expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });
  });

  describe("getFileExtension", () => {
    it("should extract extension from filename with dot", () => {
      expect(getFileExtension("photo.jpg")).toBe("jpg");
      expect(getFileExtension("image.PNG")).toBe("png");
      expect(getFileExtension("test.heic")).toBe("heic");
    });

    it("should handle multiple dots correctly", () => {
      expect(getFileExtension("my.photo.jpg")).toBe("jpg");
      expect(getFileExtension("test.image.avif")).toBe("avif");
    });

    it("should convert extension to lowercase", () => {
      expect(getFileExtension("photo.JPG")).toBe("jpg");
      expect(getFileExtension("image.PNG")).toBe("png");
      expect(getFileExtension("test.HEIC")).toBe("heic");
    });

    it("should throw StorageError if no extension", () => {
      expect(() => getFileExtension("noextension")).toThrow(StorageError);
      expect(() => getFileExtension("")).toThrow(StorageError);
      expect(() => getFileExtension("filename.")).toThrow(StorageError);
    });

    it("should throw StorageError with appropriate message for no extension", () => {
      expect(() => getFileExtension("noextension")).toThrow(
        "File must have an extension",
      );
    });
  });

  describe("validateFileType", () => {
    it("should not throw for allowed file types", () => {
      expect(() => validateFileType("jpeg")).not.toThrow();
      expect(() => validateFileType("jpg")).not.toThrow();
      expect(() => validateFileType("png")).not.toThrow();
      expect(() => validateFileType("heic")).not.toThrow();
      expect(() => validateFileType("avif")).not.toThrow();
      expect(() => validateFileType("webp")).not.toThrow();
    });

    it("should throw StorageError for disallowed file types", () => {
      expect(() => validateFileType("gif")).toThrow(StorageError);
      expect(() => validateFileType("pdf")).toThrow(StorageError);
      expect(() => validateFileType("doc")).toThrow(StorageError);
      expect(() => validateFileType("bmp")).toThrow(StorageError);
    });

    it("should include allowed types in error message", () => {
      expect(() => validateFileType("gif")).toThrow(
        /File type \.gif is not allowed/,
      );
      expect(() => validateFileType("gif")).toThrow(
        /jpeg, jpg, png, heic, avif, webp/,
      );
    });

    it("should be non-retryable", () => {
      try {
        validateFileType("gif");
        expect.fail("Should have thrown");
      } catch (error) {
        if (error instanceof StorageError) {
          expect(error.retryable).toBe(false);
        }
      }
    });
  });

  describe("validateFileSize", () => {
    it("should not throw for files under 10MB", () => {
      expect(() => validateFileSize(1024)).not.toThrow();
      expect(() => validateFileSize(5 * 1024 * 1024)).not.toThrow();
      expect(() => validateFileSize(9.9 * 1024 * 1024)).not.toThrow();
    });

    it("should not throw for file exactly 10MB", () => {
      expect(() => validateFileSize(MAX_FILE_SIZE_BYTES)).not.toThrow();
    });

    it("should throw StorageError for files over 10MB", () => {
      expect(() => validateFileSize(MAX_FILE_SIZE_BYTES + 1)).toThrow(
        StorageError,
      );
      expect(() => validateFileSize(11 * 1024 * 1024)).toThrow(StorageError);
    });

    it("should include max size in error message", () => {
      expect(() => validateFileSize(11 * 1024 * 1024)).toThrow(
        /Maximum size is 10MB/,
      );
    });

    it("should be non-retryable", () => {
      try {
        validateFileSize(MAX_FILE_SIZE_BYTES + 1);
        expect.fail("Should have thrown");
      } catch (error) {
        if (error instanceof StorageError) {
          expect(error.retryable).toBe(false);
        }
      }
    });
  });

  describe("generateStorageKey", () => {
    it("should generate unique key with shop ID", () => {
      const key = generateStorageKey("shop-123", "jpg");

      expect(key).toMatch(/^test\/shop-123\//);
      expect(key).toMatch(/\.jpg$/);
    });

    it("should include timestamp in key", () => {
      const key = generateStorageKey("shop-123", "png");

      // Verify structure includes ISO-like timestamp pattern
      // Format: test/shop-123/YYYY-MM-DDTHH-MM-SS-MS-Z-RANDOM.EXT
      expect(key).toMatch(
        /^test\/shop-123\/\d{4}-\d{2}-\d{2}T[\d\-\d]{4,}Z-[a-z0-9]+\.png$/,
      );
    });

    it("should include random suffix in key", () => {
      const key1 = generateStorageKey("shop-123", "jpg");
      const key2 = generateStorageKey("shop-123", "jpg");

      expect(key1).not.toBe(key2);
    });

    it("should preserve file extension", () => {
      expect(generateStorageKey("shop-123", "heic")).toMatch(/\.heic$/);
      expect(generateStorageKey("shop-123", "webp")).toMatch(/\.webp$/);
      expect(generateStorageKey("shop-123", "avif")).toMatch(/\.avif$/);
    });
  });

  describe("generateSignedUrls", () => {
    it("should generate signed URLs for valid file", async () => {
      const result = await generateSignedUrls("shop-123", "photo.jpg", 1024);

      expect(result).toHaveProperty("storageKey");
      expect(result).toHaveProperty("uploadUrl");
      expect(result).toHaveProperty("readUrl");
      expect(result).toHaveProperty("expiresAt");

      expect(result.storageKey).toMatch(/^test\/shop-123\//);
      expect(result.uploadUrl).toMatch(/\/upload\//);
      expect(result.readUrl).toMatch(/\/read\//);
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should validate file type before generating URLs", async () => {
      await expect(
        generateSignedUrls("shop-123", "photo.gif", 1024),
      ).rejects.toThrow(StorageError);

      await expect(
        generateSignedUrls("shop-123", "photo.gif", 1024),
      ).rejects.toThrow(/File type \.gif is not allowed/);
    });

    it("should validate file size before generating URLs", async () => {
      await expect(
        generateSignedUrls("shop-123", "photo.jpg", MAX_FILE_SIZE_BYTES + 1),
      ).rejects.toThrow(StorageError);

      await expect(
        generateSignedUrls("shop-123", "photo.jpg", MAX_FILE_SIZE_BYTES + 1),
      ).rejects.toThrow(/File is too large/);
    });

    it("should set expiry date to 30 minutes from now", async () => {
      const now = Date.now();
      const expectedExpiry = now + 30 * 60 * 1000;
      const result = await generateSignedUrls("shop-123", "photo.jpg", 1024);

      expect(result.expiresAt).toBeInstanceOf(Date);
      // Allow 1ms tolerance for timing differences between generation and assertion
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        expectedExpiry - 1,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        expectedExpiry + 1000,
      );
    });
  });
});
