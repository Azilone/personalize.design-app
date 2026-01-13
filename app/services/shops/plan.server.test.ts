import { describe, expect, it } from "vitest";
import { PlanStatus } from "@prisma/client";
import { isPlanActive } from "./plan.server";

describe("isPlanActive", () => {
  it("returns true for standard", () => {
    expect(isPlanActive(PlanStatus.standard)).toBe(true);
  });

  it("returns true for early_access", () => {
    expect(isPlanActive(PlanStatus.early_access)).toBe(true);
  });

  it("returns false for none", () => {
    expect(isPlanActive(PlanStatus.none)).toBe(false);
  });

  it("returns false for standard_pending", () => {
    expect(isPlanActive(PlanStatus.standard_pending)).toBe(false);
  });

  it("returns false for early_access_pending", () => {
    expect(isPlanActive(PlanStatus.early_access_pending)).toBe(false);
  });
});
