"use client";

import type { AuditEventRow } from "@/services/administration-audit-service";

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type AuditLogTableProps = {
  events: AuditEventRow[];
  available?: boolean;
};

export function AuditLogTable({ events, available = true }: AuditLogTableProps) {
  if (!available) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Audit store not applied yet. Run migration{" "}
        <code className="text-xs">20260801120000_administration_security_audit_11_5.sql</code>.
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No audit events yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Timestamp</th>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Module</th>
            <th className="px-3 py-2 font-medium">Action</th>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Result</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Correlation ID</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{formatDate(e.createdAt)}</td>
              <td className="px-3 py-2">{e.userEmail ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{e.companyName ?? "—"}</td>
              <td className="px-3 py-2">{e.module}</td>
              <td className="px-3 py-2">{e.action}</td>
              <td className="px-3 py-2 text-muted-foreground">{e.entity}</td>
              <td className="px-3 py-2 capitalize">{e.result}</td>
              <td className="px-3 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {e.correlationId ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
