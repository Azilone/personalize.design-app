import crypto from "node:crypto";

type EncryptedToken = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

const ENCRYPTION_KEY_ENV = "PRINTIFY_TOKEN_ENCRYPTION_KEY";
const IV_LENGTH = 12;

const getEncryptionKey = (): Buffer => {
  const rawKey = process.env[ENCRYPTION_KEY_ENV];

  if (!rawKey) {
    throw new Error(`${ENCRYPTION_KEY_ENV} is not configured.`);
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      `${ENCRYPTION_KEY_ENV} must be a base64-encoded 32-byte key.`,
    );
  }

  return key;
};

export const encryptPrintifyToken = (token: string): EncryptedToken => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
};

export const decryptPrintifyToken = (encrypted: EncryptedToken): string => {
  const key = getEncryptionKey();
  const iv = Buffer.from(encrypted.iv, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
};

export type { EncryptedToken };
