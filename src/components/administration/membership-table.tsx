"use client";

import type { MembershipRow } from "@/services/administration-user-service";

type MembershipTableProps = {
  memberships: MembershipRow[];
  busy?: boolean;
  onRemove?: (companyId: string) => void;
  onAdd?: () => void;
};

export function MembershipTable({
  memberships,
  busy,
  onRemove,
  onAdd,
}: MembershipTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Company Memberships</h3>
        {onAdd ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium"
            onClick={onAdd}
          >
            Add Membership
          </button>
        ) : null}
      </div>
      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">No company memberships.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Company</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((row) => (
                <tr key={row.companyId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{row.companyName}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{row.status}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 text-[11px]"
                      onClick={() => onRemove?.(row.companyId)}
                    >
                      Remove Membership
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
