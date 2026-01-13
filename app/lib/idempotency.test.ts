import { describe, expect, it } from "vitest";
import {
  buildGiftGrantIdempotencyKey,
  buildSubscriptionIdempotencyKey,
} from "./idempotency";

describe("idempotency key builders", () => {
  it("builds stable subscription keys", () => {
    expect(
      buildSubscriptionIdempotencyKey({
        shopId: "shop-1",
        plan: "standard",
      }),
    ).toBe("subscription:shop-1:standard");
  });

  it("builds stable gift grant keys", () => {
    expect(
      buildGiftGrantIdempotencyKey({
        shopId: "shop-1",
        plan: "early_access",
      }),
    ).toBe("gift_grant:shop-1:early_access");
  });
});
