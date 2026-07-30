/**
 * Product Report skeleton — wired to Reporting Engine; sections TBD.
 */
import {
  loadReportContext,
  type LoadReportContextOptions,
} from "@/lib/reporting/report-context";
import { buildReportDocument } from "@/lib/reporting/report-builder";
import {
  buildAppendixSection,
  buildProfitabilitySection,
} from "@/lib/reporting/sections";
import type { ReportDocument } from "@/lib/reporting/types";
import type { ScopedDateRange } from "@/types/database";

export async function buildProductReport(
  scope: ScopedDateRange,
  options: LoadReportContextOptions = {}
): Promise<ReportDocument> {
  const ctx = await loadReportContext(scope, {
    ...options,
    skipInventory: true,
  });

  return buildReportDocument({
    kind: "product",
    context: ctx,
    version: 1,
    summary: {
      headline: "Product performance (skeleton)",
      metrics: [
        {
          id: "product-count",
          label: "Products",
          value: ctx.products.length,
          format: "number",
        },
      ],
    },
    sections: [buildProfitabilitySection(ctx), buildAppendixSection(ctx)],
  });
}
