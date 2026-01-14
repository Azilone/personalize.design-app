import { describe, expect, it } from "vitest";
import { buildEmbeddedSearch } from "./embedded-search";

describe("buildEmbeddedSearch", () => {
  it("returns empty string when no embedded params exist", () => {
    expect(buildEmbeddedSearch("")).toBe("");
    expect(buildEmbeddedSearch("?foo=bar")).toBe("");
  });

  it("preserves embedded params and drops others", () => {
    const result = buildEmbeddedSearch(
      "?host=abc&embedded=1&shop=demo.myshopify.com&locale=en&foo=bar",
    );

    expect(result).toBe(
      "?host=abc&embedded=1&shop=demo.myshopify.com&locale=en",
    );
  });

  it("keeps the embedded param order", () => {
    const result = buildEmbeddedSearch("?shop=demo&host=abc");

    expect(result).toBe("?host=abc&shop=demo");
  });
});
