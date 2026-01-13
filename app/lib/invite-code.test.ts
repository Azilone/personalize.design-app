import { describe, expect, it } from "vitest";
import { isInviteCodeValid, inviteCodeErrorMessage } from "./invite-code";

describe("isInviteCodeValid", () => {
  it("accepts the exact invite code", () => {
    expect(isInviteCodeValid("EARLYACCESS")).toBe(true);
  });

  it("rejects other values (case-sensitive)", () => {
    expect(isInviteCodeValid("earlyaccess")).toBe(false);
    expect(isInviteCodeValid("EARLYACCESS ")).toBe(false);
  });
});

describe("inviteCodeErrorMessage", () => {
  it("returns a generic error message", () => {
    expect(inviteCodeErrorMessage()).toBe(
      "Unable to unlock Early Access. Please try again.",
    );
  });
});
