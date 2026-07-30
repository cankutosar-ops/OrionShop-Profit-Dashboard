/** Sprint 9.4 — Production monitoring types (read-only diagnostics). */

export type HealthLevel = "healthy" | "warning" | "critical";

export type OverallHealthLabel = "Healthy" | "Needs Attention" | "Critical";

export type MonitoredEntity = "orders" | "sales" | "finance" | "inventory";

export type FreshnessRow = {
  entity: MonitoredEntity;
  label: string;
  latestDbDate: string | null;
  expectedAsOf: string;
  daysBehind: number | null;
  recordCount: number;
  status: HealthLevel;
};

export type CoverageRow = {
  entity: MonitoredEntity;
  label: string;
  databaseLatestDate: string | null;
  expectedLatestApiDate: string;
  gapDays: number | null;
  status: HealthLevel;
  behindApi: boolean;
};

export type SyncExecutionRow = {
  entity: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  rowsInserted: number | null;
  rowsUpdated: number | null;
  rowsSkipped: number | null;
  errors: string[];
  warnings: string[];
  result: "success" | "partial" | "failed" | "unknown";
};

export type SchemaHealthView = {
  status: "PASS" | "FAIL" | "UNKNOWN";
  checkedAt: string | null;
  missing: Array<{
    table: string;
    column: string;
    expectedMigration: string;
  }>;
};

export type OperationalAlert = {
  id: string;
  severity: HealthLevel;
  title: string;
  detail: string;
  entity?: MonitoredEntity | "schema" | "sync";
};

export type ProductionHealthReport = {
  marketplaceAccountId: string;
  generatedAt: string;
  expectedAsOf: string;
  lastAccountSyncAt: string | null;
  lastAccountSyncStatus: string | null;
  freshness: FreshnessRow[];
  coverage: CoverageRow[];
  syncExecution: {
    overallStatus: string;
    startedAt: string | null;
    finishedAt: string | null;
    requestId: string | null;
    error: string | null;
    entities: SyncExecutionRow[];
  };
  schema: SchemaHealthView;
  alerts: OperationalAlert[];
  score: {
    value: number;
    label: OverallHealthLabel;
  };
};
