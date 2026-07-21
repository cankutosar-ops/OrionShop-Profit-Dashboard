import * as XLSX from "xlsx";
import type {
  BusinessReportKpiData,
  ReportPayload,
} from "@/lib/reports/report-engine-types";

/**
 * Minimal Business Report workbook — validates the export pipeline.
 * One sheet with identity/freshness metadata + a few trusted KPIs.
 * Not the final management report (Sprint 7.2).
 */
export function buildBusinessReportWorkbook(payload: ReportPayload): ArrayBuffer {
  const kpis = payload.sections.find((s) => s.id === "business-kpis")?.data as
    | BusinessReportKpiData
    | undefined;

  const identity = payload.identity;
  const rows: Array<Record<string, string | number>> = [
    { Field: "Report Name", Value: identity.reportName },
    { Field: "Company", Value: identity.company },
    { Field: "Marketplace", Value: identity.marketplace },
    { Field: "Account", Value: identity.account },
    {
      Field: "Reporting Period",
      Value: `${identity.reportingPeriod.from} → ${identity.reportingPeriod.to}`,
    },
    {
      Field: "Period Preset",
      Value: identity.reportingPeriod.presetLabel ?? "",
    },
    { Field: "Currency", Value: identity.currency },
    { Field: "Generated At", Value: identity.generatedAt },
    {
      Field: "Last Successful Data Synchronization",
      Value: identity.lastSuccessfulSyncAt ?? "",
    },
    { Field: "Template Version", Value: identity.templateVersion },
    { Field: "", Value: "" },
    { Field: "Metric", Value: "Value" },
    { Field: "Revenue", Value: kpis?.revenue ?? 0 },
    { Field: "Profit", Value: kpis?.profit ?? 0 },
    { Field: "Orders", Value: kpis?.orders ?? 0 },
    { Field: "Purchases", Value: kpis?.purchases ?? 0 },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Field", "Value"],
    skipHeader: false,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Business Report");

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
