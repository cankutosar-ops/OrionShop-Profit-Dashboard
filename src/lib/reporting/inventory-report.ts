/**
 * Inventory Report skeleton — wired to Reporting Engine; sections TBD.
 */
import {
  loadReportContext,
  type LoadReportContextOptions,
} from "@/lib/reporting/report-context";
import { buildReportDocument } from "@/lib/reporting/report-builder";
import {
  buildAppendixSection,
  buildInventorySection,
} from "@/lib/reporting/sections";
import type { ReportDocument } from "@/lib/reporting/types";
import type { ScopedDateRange } from "@/types/database";

export async function buildInventoryReportDocument(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportDocument> {
  const ctx = await loadReportContext(scope, options);
  const inv = buildInventorySection(ctx);

  return buildReportDocument({
    kind: "inventory",
    context: ctx,
    version: 1,
    summary: {
      headline: "Inventory report (skeleton)",
      metrics: [
        {
          id: "model-count",
          label: "Models",
          value: inv.data.modelCount,
          format: "number",
        },
        {
          id: "low-stock",
          label: "Low Stock",
          value: inv.data.lowStock,
          format: "number",
        },
        {
          id: "out-of-stock",
          label: "Out of Stock",
          value: inv.data.outOfStock,
          format: "number",
        },
      ],
    },
    sections: [inv, buildAppendixSection(ctx)],
  });
}
