/**
 * e2e/config/e2e-env.ts
 *
 * Single source of truth for all E2E environment values.
 * Values are read from process.env; sensible defaults are provided for
 * local development.  CI/CD pipelines set these via secrets.
 */

export const E2E_ENV = {
  /** Base URL of the running application */
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",

  /**
   * URL query params that scope every request to a specific company/account.
   * When set, the auth helper appends them to every navigation URL so RSC
   * resolves the correct tenant without an explicit login step.
   *
   * Example: "company=acme&account=wb-main"
   */
  scopeParams: process.env.E2E_SCOPE_PARAMS ?? "",

  /**
   * Whether to reuse an existing dev server instead of spawning one.
   * playwright.config.ts also reads E2E_SKIP_WEBSERVER; this mirror is for
   * helper code that needs to know the intent at runtime.
   */
  skipWebServer: Boolean(process.env.E2E_SKIP_WEBSERVER),
} as const;

/** Build a full URL with scope params appended. */
export function buildUrl(path: string, extraParams?: Record<string, string>): string {
  const base = E2E_ENV.baseUrl.replace(/\/$/, "");
  const url = new URL(`${base}${path}`);

  // Apply global scope params first
  if (E2E_ENV.scopeParams) {
    for (const [k, v] of new URLSearchParams(E2E_ENV.scopeParams)) {
      url.searchParams.set(k, v);
    }
  }

  // Then apply test-specific params (may override scope params)
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v);
    }
  }

  return url.toString();
}
