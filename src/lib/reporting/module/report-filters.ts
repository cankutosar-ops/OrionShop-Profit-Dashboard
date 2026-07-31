/**
 * Reporting-module filter keys (extends global scope with optional category).
 * Global company / account / brand / dates stay in FILTER_PARAMS.
 */

export const REPORT_FILTER_PARAMS = {
  category: "category",
} as const;

export type ReportFilterSearchParams = {
  category?: string | null;
};

export function parseReportCategory(
  params: { category?: string | string[] | undefined } | URLSearchParams
): string | undefined {
  if (params instanceof URLSearchParams) {
    const v = params.get(REPORT_FILTER_PARAMS.category)?.trim();
    return v || undefined;
  }
  const raw = params.category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function withReportCategory(
  scopeQuery: URLSearchParams,
  category: string | undefined
): URLSearchParams {
  const next = new URLSearchParams(scopeQuery);
  if (category) next.set(REPORT_FILTER_PARAMS.category, category);
  else next.delete(REPORT_FILTER_PARAMS.category);
  return next;
}
