"use client";

import type { LoginHistoryRow } from "@/lib/administration/audit-types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type LoginHistoryTableProps = {
  rows: LoginHistoryRow[];
  available?: boolean;
};

export function LoginHistoryTable({ rows, available = true }: LoginHistoryTableProps) {
  if (!available) {
    return (
      <p className="text-sm text-muted-foreground">
        Login history requires the Sprint 11.5 audit migration.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No login history recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Login time</th>
            <th className="px-3 py-2 font-medium">Logout time</th>
            <th className="px-3 py-2 font-medium">Device</th>
            <th className="px-3 py-2 font-medium">IP (masked)</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-medium">{row.user}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(row.loginTime)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(row.logoutTime)}
              </td>
              <td className="px-3 py-2">{row.device ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.ipMasked ?? "—"}</td>
              <td className="px-3 py-2 capitalize">{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
