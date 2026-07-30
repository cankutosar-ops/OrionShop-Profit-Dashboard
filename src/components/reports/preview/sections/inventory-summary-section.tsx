"use client";

import { useMemo } from "react";
import type { InventorySectionData } from "@/lib/reporting/sections/inventory";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import {
  reportMoney,
  reportNumber,
  reportText,
} from "@/components/reports/preview/report-format";

export function InventorySummarySection({
  section,
  currency,
}: {
  section: ReportSection<InventorySectionData>;
  currency: string;
}) {
  const d = section.data;

  const overstock = useMemo(
    () =>
      [...d.models]
        .filter(
          (m) =>
            m.status === "Healthy" || (m.daysLeft != null && m.daysLeft > 60)
        )
        .sort((a, b) => b.currentStock - a.currentStock)
        .slice(0, 10),
    [d.models]
  );

  const lowStock = useMemo(
    () =>
      [...d.models]
        .filter((m) => m.status === "Low Stock" || m.status === "Out of Stock")
        .sort((a, b) => a.currentStock - b.currentStock)
        .slice(0, 10),
    [d.models]
  );

  return (
    <ReportSectionFrame
      sectionId="inventory-intelligence"
      title="Inventory Intelligence"
      description="Current stock health (Live State) from the inventory module — no forecasting."
    >
      <ReportKpiGrid
        columns={3}
        items={[
          {
            label: "Inventory Value",
            value:
              d.inventoryValue == null
                ? "Not available"
                : reportMoney(d.inventoryValue, currency),
            hint:
              d.inventoryValue == null
                ? "Not exposed by current inventory services"
                : undefined,
          },
          { label: "Active Products", value: reportNumber(d.activeProducts) },
          { label: "Healthy", value: reportNumber(d.healthy) },
          { label: "Low Stock", value: reportNumber(d.lowStock) },
          { label: "Out of Stock", value: reportNumber(d.outOfStock) },
          { label: "Models", value: reportNumber(d.modelCount) },
        ]}
      />

      {d.notes.length > 0 ? (
        <ReportCallout title="Coverage notes">
          <ul className="list-disc space-y-1 pl-4">
            {d.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}

      {d.available && d.models.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <ReportSubsection title="Top overstock / high stock" className="mt-0">
            <ReportTable
              compact
              stickyHeader
              emptyMessage="No high-stock models in current inventory."
              rowKey={(r) => `over-${r.productId}`}
              minWidthClassName="min-w-[360px]"
              columns={[
                {
                  key: "sku",
                  header: "SKU",
                  cell: (r) => reportText(r.supplierArticle),
                },
                {
                  key: "stock",
                  header: "Stock",
                  align: "right",
                  cell: (r) => reportNumber(r.currentStock),
                },
                {
                  key: "status",
                  header: "Status",
                  cell: (r) => r.status,
                },
              ]}
              rows={overstock}
            />
          </ReportSubsection>
          <ReportSubsection title="Top low / out of stock" className="mt-0">
            {lowStock.length === 0 ? (
              <ReportEmptyState
                variant="no-data"
                hint="No low-stock or out-of-stock models in current inventory."
              />
            ) : (
              <ReportTable
                compact
                stickyHeader
                rowKey={(r) => `low-${r.productId}`}
                minWidthClassName="min-w-[360px]"
                columns={[
                  {
                    key: "sku",
                    header: "SKU",
                    cell: (r) => reportText(r.supplierArticle),
                  },
                  {
                    key: "stock",
                    header: "Stock",
                    align: "right",
                    cell: (r) => reportNumber(r.currentStock),
                  },
                  {
                    key: "status",
                    header: "Status",
                    cell: (r) => r.status,
                  },
                ]}
                rows={lowStock}
              />
            )}
          </ReportSubsection>
        </div>
      ) : null}

      {d.available && d.models.length > 0 ? (
        <ReportSubsection title="Stock summary">
          <ReportTable
            defaultSortKey="stock"
            stickyHeader
            minWidthClassName="min-w-[640px]"
            rowKey={(r) => r.productId}
            columns={[
              {
                key: "sku",
                header: "SKU",
                cell: (r) => reportText(r.supplierArticle),
              },
              {
                key: "name",
                header: "Product",
                cell: (r) => reportText(r.productName),
              },
              {
                key: "stock",
                header: "Stock",
                align: "right",
                sortable: true,
                sortValue: (r) => r.currentStock,
                cell: (r) => reportNumber(r.currentStock),
              },
              {
                key: "days",
                header: "Days left",
                align: "right",
                sortable: true,
                sortValue: (r) => r.daysLeft,
                cell: (r) =>
                  r.daysLeft == null ? "—" : reportNumber(r.daysLeft),
              },
              {
                key: "status",
                header: "Status",
                sortable: true,
                sortValue: (r) => r.status,
                cell: (r) => r.status,
              },
            ]}
            rows={d.models}
          />
        </ReportSubsection>
      ) : !d.available ? (
        <ReportEmptyState
          variant="unavailable"
          hint="Inventory report unavailable for this account context."
        />
      ) : (
        <ReportEmptyState
          variant="no-data"
          hint="No inventory models in current Live State."
        />
      )}
    </ReportSectionFrame>
  );
}
