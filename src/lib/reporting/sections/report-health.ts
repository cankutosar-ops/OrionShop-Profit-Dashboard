/**
 * Report Health — transparency / confidence metadata for the selected period.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  CALCULATION_MODEL,
  FINANCIAL_ENGINE_VERSION,
} from "@/lib/reporting/section-utils";

export type ReportHealthData = {
  reportingPeriod: {
    from: string;
    to: string;
    presetLabel?: string;
    /** Inclusive day count for the selected scope (period-agnostic). */
    dayCount: number;
  };
  lastFinanceSync: {
    lastSuccessfulSyncAt: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    financeLatestOperationDate: string | null;
    financeGapDays: number | null;
    financeRecoveryNeeded: boolean;
  };
  settlementCoverage: {
    available: boolean;
    source: string;
    reportCount: number | null;
    note: string | null;
  };
  inventoryCoverage: {
    available: boolean;
    modelCount: number;
    note: string | null;
  };
  verificationStatus: {
    lifecycleStatus: string | null;
    isSampleData: boolean;
    warnings: string[];
  };
  calculationModel: string;
  financialEngineVersion: string;
};

function inclusiveDayCount(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function buildReportHealthSection(
  ctx: ReportContext
): ReportSection<ReportHealthData> {
  const expected = ctx.overview.expectedWbPayout;
  const wb = ctx.overview.wbSettlement;

  const settlementAvailable =
    expected.amount != null || wb.availability?.available !== false;
  const settlementSource =
    expected.amount != null
      ? "expectedWbPayout"
      : wb.availability?.available !== false
        ? "wbSettlement"
        : "unavailable";

  const inv = ctx.inventory;

  return {
    id: "report-health",
    kind: "report-health",
    title: "Report Health",
    description: "Data quality and confidence for the selected reporting period",
    data: {
      reportingPeriod: {
        from: ctx.scope.from,
        to: ctx.scope.to,
        presetLabel: ctx.periodPresetLabel,
        dayCount: inclusiveDayCount(ctx.scope.from, ctx.scope.to),
      },
      lastFinanceSync: {
        lastSuccessfulSyncAt: ctx.sync.lastSuccessfulSyncAt,
        lastSyncAt: ctx.sync.lastSyncAt,
        lastSyncStatus: ctx.sync.lastSyncStatus,
        financeLatestOperationDate: ctx.sync.financeLatestOperationDate,
        financeGapDays: ctx.sync.financeGapDays,
        financeRecoveryNeeded: ctx.sync.financeRecoveryNeeded,
      },
      settlementCoverage: {
        available: settlementAvailable,
        source: settlementSource,
        reportCount:
          expected.amount != null
            ? expected.reportCount
            : (wb.weeklyReportCount ?? null),
        note:
          expected.unavailableReason ??
          (wb.availability?.available === false
            ? (wb.dataSourceNote ?? "Settlement unavailable")
            : null),
      },
      inventoryCoverage: {
        available: inv != null,
        modelCount: inv?.models.length ?? 0,
        note: inv == null ? "Inventory report unavailable for this context" : null,
      },
      verificationStatus: {
        lifecycleStatus: ctx.sync.lifecycleStatus,
        isSampleData: ctx.meta.isSampleData,
        warnings: ctx.meta.warnings,
      },
      calculationModel: CALCULATION_MODEL,
      financialEngineVersion: FINANCIAL_ENGINE_VERSION,
    },
  };
}
