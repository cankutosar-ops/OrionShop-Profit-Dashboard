"use client";

import type { AuditEventRow } from "@/lib/administration/audit-types";

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

const ACTION_LABEL: Record<string, string> = {
  login_failure: "Login Failure",
  permission_denied: "Permission Denied",
  secret_rotation: "Secret Rotation",
  credential_update: "Credential Update",
  marketplace_credential_test: "Marketplace Credential Test",
  security_validation: "Security Validation",
};

type SecurityEventTableProps = {
  events: AuditEventRow[];
  available?: boolean;
};

export function SecurityEventTable({ events, available = true }: SecurityEventTableProps) {
  if (!available) {
    return (
      <p className="text-sm text-muted-foreground">
        Security events require the Sprint 11.5 audit migration.
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No security events recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Timestamp</th>
            <th className="px-3 py-2 font-medium">Event</th>
            <th className="px-3 py-2 font-medium">User</th>
            <th className="px-3 py-2 font-medium">Module</th>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-muted-foreground">{formatDate(e.createdAt)}</td>
              <td className="px-3 py-2 font-medium">
                {ACTION_LABEL[e.action] ?? e.action}
              </td>
              <td className="px-3 py-2">{e.userEmail ?? "—"}</td>
              <td className="px-3 py-2">{e.module}</td>
              <td className="px-3 py-2 text-muted-foreground">{e.entity}</td>
              <td className="px-3 py-2 capitalize">{e.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
