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

describe("decryptPrintifyToken", () => {
  it("throws when decrypting with the wrong key", () => {
    process.env.PRINTIFY_TOKEN_ENCRYPTION_KEY = keyFromBytes(32);
    const encrypted = encryptPrintifyToken("printify-token");

    process.env.PRINTIFY_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );

    expect(() => decryptPrintifyToken(encrypted)).toThrow();
  });

  it("throws when the auth tag is tampered", () => {
    const encrypted = encryptPrintifyToken("printify-token");
    const authTag = Buffer.from(encrypted.authTag, "base64");

    authTag[0] = authTag[0] ^ 1;

    expect(() =>
      decryptPrintifyToken({
        ...encrypted,
        authTag: authTag.toString("base64"),
      }),
    ).toThrow();
  });

  it("throws when the IV is invalid", () => {
    const encrypted = encryptPrintifyToken("printify-token");

    expect(() =>
      decryptPrintifyToken({
        ...encrypted,
        iv: Buffer.alloc(4, 1).toString("base64"),
      }),
    ).toThrow();
  });
});
