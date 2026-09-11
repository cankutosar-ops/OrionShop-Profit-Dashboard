"use client";

import type { RlsTableStatus } from "@/lib/administration/security-types";

type RlsStatusTableProps = {
  tables: RlsTableStatus[];
  dataPlaneEnabled: boolean;
  lastValidationAt: string | null;
  validationResult: string;
  validationDetail: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function RlsStatusTable({
  tables,
  dataPlaneEnabled,
  lastValidationAt,
  validationResult,
  validationDetail,
}: RlsStatusTableProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Data plane
          </div>
          <div className="font-medium">
            {dataPlaneEnabled ? "ORION_RLS_DATA_PLANE=1" : "Disabled"}
          </div>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Last validation
          </div>
          <div className="font-medium">{formatDate(lastValidationAt)}</div>
        </div>
        <div className="rounded-xl border border-border px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Validation result
          </div>
          <div className="font-medium capitalize">{validationResult}</div>
          <div className="text-xs text-muted-foreground">{validationDetail}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Enabled tables</th>
              <th className="px-3 py-2 font-medium">RLS</th>
              <th className="px-3 py-2 font-medium">Policy status</th>
              <th className="px-3 py-2 font-medium">Policies</th>
            </tr>
          </thead>
          <tbody>
            {tables.map((row) => (
              <tr key={row.tableName} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{row.tableName}</td>
                <td className="px-3 py-2">{row.rlsEnabled ? "On" : "Off"}</td>
                <td className="px-3 py-2 capitalize text-muted-foreground">
                  {row.policyStatus}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.policyCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Read-only. Policy editing is out of scope — reuse existing 7.1.D RLS.
      </p>
    </div>
  );
}
