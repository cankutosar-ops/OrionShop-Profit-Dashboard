/**
 * Classify sync/API errors for commercial continuity without exposing secrets.
 */

import type { CommercialEntityStatus, CommercialFailureClass } from "./types";

export function classifyCommercialError(message: string | null | undefined): {
  status: CommercialEntityStatus;
  failureClass: CommercialFailureClass;
} {
  const text = (message ?? "").toLowerCase();
  if (!text) {
    return { status: "failed", failureClass: "unknown" };
  }
  if (/\b429\b|too many requests|rate.?limit/.test(text)) {
    return { status: "rate_limited", failureClass: "rate_limited" };
  }
  if (/\b403\b|forbidden|permission|unauthorized|api key/.test(text)) {
    return { status: "permission_denied", failureClass: "permission_denied" };
  }
  if (/\b404\b|not found/.test(text)) {
    return { status: "external_unavailable", failureClass: "external_unavailable" };
  }
  if (/timeout|etimedout|abort/.test(text)) {
    return { status: "failed", failureClass: "timeout" };
  }
  if (/network|econnreset|econnrefused|fetch failed|socket/.test(text)) {
    return { status: "failed", failureClass: "network" };
  }
  return { status: "failed", failureClass: "unknown" };
}

/** Redact credential-like fragments from error strings for persistence. */
export function sanitizeCommercialError(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]")
    .slice(0, 500);
}

export function computeNextRetryAt(
  retryCount: number,
  baseDelaySeconds: number,
  maxDelaySeconds: number,
  now = new Date()
): string {
  const exp = Math.min(
    maxDelaySeconds,
    baseDelaySeconds * Math.pow(2, Math.max(0, retryCount))
  );
  return new Date(now.getTime() + exp * 1000).toISOString();
}

/**
 * Prefer Wildberries server retry hint when present; never schedule shorter than server wait.
 */
export function computeNextRetryAtPreferServer(input: {
  retryCount: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
  serverRetryAfterMs?: number | null;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const backoff = computeNextRetryAt(
    input.retryCount,
    input.baseDelaySeconds,
    input.maxDelaySeconds,
    now
  );
  const backoffMs = Date.parse(backoff) - now.getTime();
  const serverMs = input.serverRetryAfterMs ?? 0;
  if (serverMs > backoffMs) {
    return new Date(now.getTime() + serverMs).toISOString();
  }
  return backoff;
}
