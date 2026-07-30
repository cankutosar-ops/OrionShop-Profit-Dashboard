/** Sprint 9.1 — Sync Verification Layer (read-only). */

export type VerificationSourceId = "orders" | "sales" | "finance" | "inventory";

export type SourceVerificationStatus = "healthy" | "warning" | "empty";

export type OverallVerificationStatus = "healthy" | "warning";

export type SourceVerification = {
  source: VerificationSourceId;
  label: string;
  /** Earliest business/snapshot date in DB (YYYY-MM-DD), or null. */
  earliestDate: string | null;
  /** Latest business/snapshot date in DB (YYYY-MM-DD), or null. */
  latestDate: string | null;
  recordCount: number;
  /** Account last sync timestamp (ISO), shared across sources. */
  lastSyncAt: string | null;
  /** Calendar days latest is behind expectedAsOf (null when empty / unknown). */
  daysBehindExpected: number | null;
  status: SourceVerificationStatus;
  /** Human-readable note when status is not healthy. */
  warning: string | null;
};

export type SyncVerificationReport = {
  marketplaceAccountId: string;
  /** Expected "up to date" calendar date (YYYY-MM-DD). */
  expectedAsOf: string;
  verifiedAt: string;
  lastSyncAt: string | null;
  lastSuccessfulSyncAt: string | null;
  sources: SourceVerification[];
  overall: OverallVerificationStatus;
  /** Plain-text summary matching the sprint example format. */
  summaryText: string;
};
