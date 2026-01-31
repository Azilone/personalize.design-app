import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateFile,
  MAX_SIZE,
  MAX_IMAGE_DIMENSION,
  ALLOWED_TYPES,
  getImageDimensions,
} from "./validation";

import { isFileTypeSupported, validateBrowserSupport } from "./browser-support";

vi.mock("./browser-support", async () => ({
  isFileTypeSupported: vi.fn(),
  validateBrowserSupport: vi.fn(),
}));

// Store original Image constructor
const OriginalImage = global.Image;

describe("validateFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFileTypeSupported).mockResolvedValue(true);
    vi.mocked(validateBrowserSupport).mockResolvedValue(null);
    // Restore original Image before each test
    global.Image = OriginalImage;
  });

  afterEach(() => {
    // Restore original Image after each test
    global.Image = OriginalImage;
  });

  it("accepts valid files", async () => {
    const file = new File(["test"], "test.png", { type: "image/png" });
    const result = await validateFile(file);
    expect(result).toBeNull();
  });

  it("accepts all allowed MIME types", async () => {
    for (const type of ALLOWED_TYPES) {
      const file = new File(["test"], `test.${type.split("/")[1]}`, { type });
      const result = await validateFile(file);
      expect(result).toBeNull();
    }
  });

  it("rejects invalid types", async () => {
    const file = new File(["test"], "test.pdf", { type: "application/pdf" });
    const result = await validateFile(file);
    expect(result).toContain("Unsupported file type");
  });

  it("rejects large files", async () => {
    const file = {
      name: "large.png",
      type: "image/png",
      size: MAX_SIZE + 1,
    } as File;

    const result = await validateFile(file);
    expect(result).toContain("File size exceeds");
  });

  it("rejects HEIC when browser doesn't support it", async () => {
    vi.mocked(validateBrowserSupport).mockResolvedValue(
      "Your browser does not support HEIC files",
    );
    const file = new File(["test"], "test.heic", { type: "image/heic" });

    const result = await validateFile(file);
    expect(result).toContain("Your browser does not support HEIC files");
  });

  it("rejects AVIF when browser doesn't support it", async () => {
    vi.mocked(validateBrowserSupport).mockResolvedValue(
      "Your browser does not support AVIF files",
    );
    const file = new File(["test"], "test.avif", { type: "image/avif" });

    const result = await validateFile(file);
    expect(result).toContain("Your browser does not support AVIF files");
  });

  it("accepts HEIC when browser supports it", async () => {
    vi.mocked(validateBrowserSupport).mockResolvedValue(null);
    const file = new File(["test"], "test.heic", { type: "image/heic" });

    const result = await validateFile(file);
    expect(result).toBeNull();
  });

  it("rejects images with width exceeding MAX_IMAGE_DIMENSION", async () => {
    const mockImage = {
      width: MAX_IMAGE_DIMENSION + 100,
      height: 1000,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
    };

    global.Image = vi.fn(function Image(this: typeof mockImage) {
      setTimeout(() => this.onload?.(), 0);
      return Object.assign(this, mockImage);
    }) as unknown as typeof OriginalImage;

    const file = new File(["test"], "test.png", { type: "image/png" });
    const result = await validateFile(file);
    expect(result).toContain("dimensions are too large");
    expect(result).toContain(`${MAX_IMAGE_DIMENSION}x${MAX_IMAGE_DIMENSION}`);
  });

  it("rejects images with height exceeding MAX_IMAGE_DIMENSION", async () => {
    const mockImage = {
      width: 1000,
      height: MAX_IMAGE_DIMENSION + 100,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
    };

    global.Image = vi.fn(function Image(this: typeof mockImage) {
      setTimeout(() => this.onload?.(), 0);
      return Object.assign(this, mockImage);
    }) as unknown as typeof OriginalImage;

    const file = new File(["test"], "test.png", { type: "image/png" });
    const result = await validateFile(file);
    expect(result).toContain("dimensions are too large");
  });

  it("accepts images within dimension limits", async () => {
    const mockImage = {
      width: 1024,
      height: 1024,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
    };

    global.Image = vi.fn(function Image(this: typeof mockImage) {
      setTimeout(() => this.onload?.(), 0);
      return Object.assign(this, mockImage);
    }) as unknown as typeof OriginalImage;

    const file = new File(["test"], "test.png", { type: "image/png" });
    const result = await validateFile(file);
    expect(result).toBeNull();
  });
});

describe("getImageDimensions", () => {
  beforeEach(() => {
    global.Image = OriginalImage;
  });

  afterEach(() => {
    global.Image = OriginalImage;
  });

  it("returns image dimensions on successful load", async () => {
    const mockImage = {
      width: 1920,
      height: 1080,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
    };

    global.Image = vi.fn(function Image(this: typeof mockImage) {
      setTimeout(() => this.onload?.(), 0);
      return Object.assign(this, mockImage);
    }) as unknown as typeof OriginalImage;

    const file = new File(["test"], "test.png", { type: "image/png" });
    const dimensions = await getImageDimensions(file);
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects on image load error", async () => {
    const mockImage = {
      width: 0,
      height: 0,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: "",
    };

    global.Image = vi.fn(function Image(this: typeof mockImage) {
      setTimeout(() => this.onerror?.(), 0);
      return Object.assign(this, mockImage);
    }) as unknown as typeof OriginalImage;

    const file = new File(["test"], "test.png", { type: "image/png" });
    await expect(getImageDimensions(file)).rejects.toThrow(
      "Failed to load image",
    );
  });
});

describe("isFileTypeSupported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for standard formats", async () => {
    const result = await isFileTypeSupported("image/jpeg");
    expect(result).toBe(true);
  });
});
