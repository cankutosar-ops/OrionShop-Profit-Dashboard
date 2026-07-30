"use client";

import type { SettlementReconciliationData } from "@/lib/reporting/sections/settlement-reconciliation";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { reportMoney, reportText } from "@/components/reports/preview/report-format";

export function SettlementReconciliationSection({
  section,
  currency,
}: {
  section: ReportSection<SettlementReconciliationData>;
  currency: string;
}) {
  const d = section.data;
  const trustHint = d.settlement.available
    ? `Trusted · ${d.settlement.source}${
        d.settlement.reportCount != null
          ? ` · ${d.settlement.reportCount} report(s)`
          : ""
      }`
    : "Settlement unavailable for this scope";

  return (
    <ReportSectionFrame
      sectionId="settlement-reconciliation"
      title="Settlement Reconciliation"
      description="Bridge Orion Commercial Performance to WB settlement for the same Report Scope."
    >
      <ReportKpiGrid
        columns={3}
        items={[
          { label: "Revenue", value: reportMoney(d.revenue, currency) },
          {
            label: "Settlement Amount",
            value: reportMoney(d.settlementAmount, currency),
            hint: trustHint,
            emphasis: d.settlement.available ? "primary" : "default",
          },
          {
            label: "Difference",
            value: reportMoney(d.difference, currency),
            hint: "Revenue − Settlement",
          },
        ]}
      />

      <ReportSubsection title="Settlement bridge detail">
        <ReportKpiGrid
          columns={3}
          items={[
            {
              label: "Seller Payout (FE)",
              value: reportMoney(d.sellerPayout, currency),
              hint:
                d.sellerPayoutDifference == null
                  ? undefined
                  : `vs settlement ${reportMoney(d.sellerPayoutDifference, currency)}`,
            },
            { label: "Logistics", value: reportMoney(d.logistics, currency) },
            { label: "Storage", value: reportMoney(d.storage, currency) },
            { label: "Acceptance", value: reportMoney(d.acceptance, currency) },
            { label: "Penalties", value: reportMoney(d.penalties, currency) },
            {
              label: "Other deductions",
              value: reportMoney(d.otherDeductions, currency),
            },
          ]}
        />
      </ReportSubsection>

      <ReportCallout
        title="Trust indicator"
        tone={d.settlement.available ? "info" : "warning"}
      >
        {d.settlement.available ? (
          <p>
            Settlement data is available for the selected scope ({trustHint}). Differences
            between Revenue and Settlement are expected when timing, deductions, or coverage
            diverge — review notes before treating either figure in isolation.
          </p>
        ) : (
          <p>
            Settlement is not available for this Report Scope. Commercial Performance KPIs remain
            valid; payout reconciliation cannot be completed until settlement coverage exists.
          </p>
        )}
      </ReportCallout>

      {d.notes.length > 0 ? (
        <ReportCallout title="Difference explanations">
          <ul className="list-disc space-y-1 pl-4">
            {d.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}

      {!d.settlement.available && d.settlement.unavailableReason ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {reportText(d.settlement.unavailableReason)}
        </p>
      ) : null}
    </ReportSectionFrame>
  );
}
