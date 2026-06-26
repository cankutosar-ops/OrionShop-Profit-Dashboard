/**
 * Encrypt marketplace API credentials at rest (AES-256-GCM).
 * Key: MARKETPLACE_CREDENTIALS_KEY in .env.local (32+ chars) or derived from service role key.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  const secret =
    process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error(
      "MARKETPLACE_CREDENTIALS_KEY or SUPABASE_SERVICE_ROLE_KEY required for credential encryption"
    );
  }

  return scryptSync(secret, "orionshop-marketplace-credentials", 32);
}

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptCredential(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted credential format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function maskCredential(value: string): string {
  if (!value || value.length < 8) return value ? "••••••••" : "";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
