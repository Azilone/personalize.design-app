import { describe, expect, it } from "vitest";
import { calculateFalImageSize } from "./image-size.server";

describe("calculateFalImageSize", () => {
  it("returns print area dimensions when cover is enabled", () => {
    const result = calculateFalImageSize({
      coverPrintArea: true,
      templateAspectRatio: "ratio_4_3",
      printAreaDimensions: { position: "front", width: 1500, height: 1800 },
    });

    expect(result).toEqual({ width: 1500, height: 1800 });
  });

  it("falls back to template aspect ratio when cover is disabled", () => {
    const result = calculateFalImageSize({
      coverPrintArea: false,
      templateAspectRatio: "ratio_16_9",
    });

    expect(result).toEqual({ width: 1024, height: 576 });
  });
});
