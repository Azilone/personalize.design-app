import { describe, expect, it, beforeEach } from "vitest";
import {
  decryptPrintifyToken,
  encryptPrintifyToken,
} from "./token-encryption.server";

const keyFromBytes = (bytes: number) =>
  Buffer.alloc(bytes, 7).toString("base64");

beforeEach(() => {
  process.env.PRINTIFY_TOKEN_ENCRYPTION_KEY = keyFromBytes(32);
});

describe("encryptPrintifyToken", () => {
  it("round-trips the token", () => {
    const encrypted = encryptPrintifyToken("printify-token");
    const decrypted = decryptPrintifyToken(encrypted);

    expect(decrypted).toBe("printify-token");
  });

  it("throws when the encryption key is missing", () => {
    delete process.env.PRINTIFY_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptPrintifyToken("printify-token")).toThrow(
      "PRINTIFY_TOKEN_ENCRYPTION_KEY is not configured.",
    );
  });

  it("throws when the encryption key is the wrong length", () => {
    process.env.PRINTIFY_TOKEN_ENCRYPTION_KEY = keyFromBytes(16);

    expect(() => encryptPrintifyToken("printify-token")).toThrow(
      "PRINTIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  });
});
