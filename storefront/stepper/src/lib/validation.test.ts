import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFile, MAX_SIZE, ALLOWED_TYPES } from "./validation";

import { isFileTypeSupported, validateBrowserSupport } from "./browser-support";

vi.mock("./browser-support", async () => ({
  isFileTypeSupported: vi.fn(),
  validateBrowserSupport: vi.fn(),
}));

describe("validateFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFileTypeSupported).mockResolvedValue(true);
    vi.mocked(validateBrowserSupport).mockResolvedValue(null);
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
});

describe("isFileTypeSupported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true for standard formats", async () => {
    const result = await isFileTypeSupported("image/jpeg");
    expect(result).toBe(true);
  });

  it("returns false when toDataURL throws error", async () => {
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue({ createImageData: vi.fn() }),
      toDataURL: vi.fn().mockImplementation(() => {
        throw new Error("Not supported");
      }),
    };

    // Mock document.createElement to return our mock canvas
    const createElementSpy = vi.spyOn(document, "createElement");
    createElementSpy.mockReturnValue(mockCanvas as any);

    const result = await isFileTypeSupported("image/heic");
    expect(result).toBe(false);

    createElementSpy.mockRestore();
  });
});
