import { describe, expect, it } from "vitest";
import { buildEmbeddedRedirectPath, isPaywallPath } from "./routing";

describe("isPaywallPath", () => {
  it("matches /app/paywall", () => {
    expect(isPaywallPath("/app/paywall")).toBe(true);
  });

  it("matches /app/paywall/", () => {
    expect(isPaywallPath("/app/paywall/")).toBe(true);
  });

  it("does not match other paths", () => {
    expect(isPaywallPath("/app")).toBe(false);
  });
});

describe("buildEmbeddedRedirectPath", () => {
  it("preserves embedded query params", () => {
    const request = new Request(
      "https://example.com/app/paywall?host=abc&embedded=1&shop=test.myshopify.com&locale=fr",
    );

    expect(buildEmbeddedRedirectPath(request, "/app")).toBe(
      "/app?host=abc&embedded=1&shop=test.myshopify.com&locale=fr",
    );
  });

  it("omits missing params", () => {
    const request = new Request("https://example.com/app/paywall?host=abc");
    expect(buildEmbeddedRedirectPath(request, "/app")).toBe("/app?host=abc");
  });
});
