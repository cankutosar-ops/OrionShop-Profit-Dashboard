import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

export const AUTH_CHECK_TIMEOUT_MS = 8_000;

export class AuthServiceUnavailable extends Error {
  constructor() {
    super("Session verification is temporarily unavailable");
    this.name = "AuthServiceUnavailable";
  }
}

export function isAuthServiceFailure(error: unknown): boolean {
  return isAuthRetryableFetchError(error) ||
    (isAuthError(error) && (error.status === 429 || (error.status ?? 0) >= 500));
}
