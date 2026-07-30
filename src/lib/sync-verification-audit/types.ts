import type { HealthLevel } from "@/lib/production-health/types";
import type { ProductionHealthReport } from "@/lib/production-health/types";
import type { WbSyncResult } from "@/lib/wildberries/api-client";
import type { SyncTimingReport } from "@/lib/wildberries/sync-timer";

export type VerificationOverallResult = "PASS" | "WARNING" | "FAIL";

export type FailureCategory =
  | "schema_mismatch"
  | "orders_behind_api"
  | "sales_behind_api"
  | "finance_behind_api"
  | "inventory_stale"
  | "partial_sync"
  | "sync_failed"
  | "coverage_mismatch"
  | "other";

export type VerificationFailure = {
  category: FailureCategory;
  affectedEntity: string;
  reason: string;
  detectedAt: string;
  recommendedAction: string;
};

export type EntityVerificationBlock = {
  entity: "orders" | "sales" | "finance" | "inventory";
  label: string;
  latestApiDate: string | null;
  latestDbDate: string | null;
  gapDays: number | null;
  coverageStatus: HealthLevel;
  status: HealthLevel;
  recordCount: number;
};

export type SyncVerificationBlock = {
  durationMs: number | null;
  rowsInserted: number;
  rowsUpdated: number;
  errors: string[];
  warnings: string[];
  finalStatus: string;
};

export type VerificationSnapshot = {
  version: 1;
  verifiedAt: string;
  marketplaceAccountId: string;
  healthScore: number;
  schemaStatus: "PASS" | "FAIL" | "UNKNOWN";
  overallResult: VerificationOverallResult;
  orders: EntityVerificationBlock;
  sales: EntityVerificationBlock;
  finance: EntityVerificationBlock;
  inventory: EntityVerificationBlock;
  synchronization: SyncVerificationBlock;
  operationalAlerts: ProductionHealthReport["alerts"];
  failures: VerificationFailure[];
  productionHealth: ProductionHealthReport;
};

export type SyncVerificationReportRow = {
  id: string;
  marketplace_account_id: string;
  verified_at: string;
  expected_as_of: string;
  health_score: number;
  overall_result: VerificationOverallResult;
  schema_status: "PASS" | "FAIL" | "UNKNOWN";
  orders_status: string;
  sales_status: string;
  finance_status: string;
  inventory_status: string;
  sync_status: string | null;
  sync_request_id: string | null;
  sync_duration_ms: number | null;
  snapshot: VerificationSnapshot;
  failures: VerificationFailure[];
  created_at: string;
};

export type PostSyncVerificationInput = {
  marketplaceAccountId: string;
  syncStatus: string;
  syncRequestId?: string | null;
  syncResults?: WbSyncResult[] | null;
  syncTiming?: SyncTimingReport | null;
  syncError?: string | null;
};
