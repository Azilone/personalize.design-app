import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateFile, MAX_SIZE, ALLOWED_TYPES } from "./validation";

vi.mock("./browser-support", () => ({
  isFileTypeSupported: vi.fn(),
  validateBrowserSupport: vi.fn(),
}));

import { isFileTypeSupported, validateBrowserSupport } from "./browser-support";

describe("validateFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isFileTypeSupported).mockReturnValue(true);
    vi.mocked(validateBrowserSupport).mockReturnValue(null);
  });

  it("accepts valid files", () => {
    const file = new File(["test"], "test.png", { type: "image/png" });
    expect(validateFile(file)).toBeNull();
  });

  it("accepts all allowed MIME types", () => {
    ALLOWED_TYPES.forEach((type) => {
      const file = new File(["test"], `test.${type.split("/")[1]}`, { type });
      expect(validateFile(file)).toBeNull();
    });
  });

  it("rejects invalid types", () => {
    const file = new File(["test"], "test.pdf", { type: "application/pdf" });
    expect(validateFile(file)).toContain("Unsupported file type");
  });

  it("rejects large files", () => {
    const file = {
      name: "large.png",
      type: "image/png",
      size: MAX_SIZE + 1,
    } as File;

    expect(validateFile(file)).toContain("File size exceeds");
  });

  it("rejects HEIC when browser doesn't support it", () => {
    vi.mocked(validateBrowserSupport).mockReturnValue(
      "Your browser does not support HEIC files",
    );
    const file = new File(["test"], "test.heic", { type: "image/heic" });

    const result = validateFile(file);
    expect(result).toContain("Your browser does not support HEIC files");
  });

  it("rejects AVIF when browser doesn't support it", () => {
    vi.mocked(validateBrowserSupport).mockReturnValue(
      "Your browser does not support AVIF files",
    );
    const file = new File(["test"], "test.avif", { type: "image/avif" });

    const result = validateFile(file);
    expect(result).toContain("Your browser does not support AVIF files");
  });

  it("accepts HEIC when browser supports it", () => {
    vi.mocked(validateBrowserSupport).mockReturnValue(null);
    const file = new File(["test"], "test.heic", { type: "image/heic" });

    expect(validateFile(file)).toBeNull();
  });
});
