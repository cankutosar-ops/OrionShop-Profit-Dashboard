/**
 * Sprint 6.35.2 — Performance audit types (instrumentation only).
 */

export type PerfCategory =
  | "url"
  | "server"
  | "sql"
  | "wb_api"
  | "model_b"
  | "react"
  | "navigation"
  | "page"
  | "duplicate";

export type PerfEvent = {
  id: string;
  ts: number;
  category: PerfCategory;
  name: string;
  durationMs: number;
  requestId?: string;
  route?: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type PerfReportSummary = {
  generatedAt: string;
  eventCount: number;
  averagePageLoadMs: number | null;
  averageAccountSwitchMs: number | null;
  averageSmartPricingLoadMs: number | null;
  averageDashboardRefreshMs: number | null;
  top10Longest: Array<{ name: string; category: PerfCategory; durationMs: number; meta?: PerfEvent["meta"] }>;
  sql: Array<{ name: string; durationMs: number; rows: number; count: number }>;
  wbApi: Array<{
    endpoint: string;
    durationMs: number;
    retries: number;
    count429: number;
    cache: string;
    count: number;
  }>;
  duplicates: Array<{ fingerprint: string; count: number; name: string; category: PerfCategory }>;
  slowestOperations: Array<{ name: string; category: PerfCategory; durationMs: number }>;
};
