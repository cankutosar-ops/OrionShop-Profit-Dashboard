/** Shown when an external API is rate-limited or otherwise unreachable. */
export const TEMPORARILY_UNAVAILABLE = "Temporarily unavailable";

const API_ERROR_PATTERN =
  /HTTP\s+\d{3}|Too many requests|\b429\b|\b5\d{2}\b|ECONNREFUSED|ETIMEDOUT|timeout|fetch failed|network error/i;

function looksLikeStructuredPayload(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * Maps internal/API errors to safe user-facing copy.
 * Preserves intentional business messages (e.g. "Wildberries accounts only").
 */
export function sanitizeUserFacingError(
  error: unknown,
  fallback: string = TEMPORARILY_UNAVAILABLE
): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.trim();
  if (!message) return fallback;

  if (API_ERROR_PATTERN.test(message) || looksLikeStructuredPayload(message)) {
    return TEMPORARILY_UNAVAILABLE;
  }

  return message;
}

/** Sanitize a stored unavailableReason before rendering in the UI. */
export function sanitizeUnavailableReason(
  reason: string | undefined,
  fallback: string
): string {
  if (!reason) return fallback;
  if (API_ERROR_PATTERN.test(reason) || looksLikeStructuredPayload(reason)) {
    return TEMPORARILY_UNAVAILABLE;
  }
  return reason;
}
