import { describe, expect, it } from "vitest";
import { isPaywallPath } from "./routing";

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
