/**
 * Encrypt marketplace API credentials at rest (AES-256-GCM).
 *
 * Sprint 7.1.E:
 * - Production requires MARKETPLACE_CREDENTIALS_KEY (dedicated; no service_role fallback).
 * - Non-production may fall back to SUPABASE_SERVICE_ROLE_KEY for local DX only.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { isPlaceholderSecret, isProductionRuntime } from "@/lib/security/secrets";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_SALT = "orionshop-marketplace-credentials";

function deriveKey(): Buffer {
  const dedicated = process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ?? "";
  if (dedicated && !isPlaceholderSecret(dedicated)) {
    return scryptSync(dedicated, KEY_SALT, 32);
  }

  if (isProductionRuntime()) {
    throw new Error(
      "MARKETPLACE_CREDENTIALS_KEY is required in production (generate with: openssl rand -base64 32)"
    );
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!fallback || isPlaceholderSecret(fallback)) {
    throw new Error(
      "MARKETPLACE_CREDENTIALS_KEY or SUPABASE_SERVICE_ROLE_KEY required for credential encryption"
    );
  }

  return scryptSync(fallback, KEY_SALT, 32);
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

  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Mask a secret for display (never log full credentials). */
export function maskCredential(value: string): string {
  if (!value || value.length < 8) return value ? "••••••••" : "";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
