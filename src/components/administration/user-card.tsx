"use client";

import { RoleBadge } from "@/components/administration/role-badge";
import { UserStatusBadge } from "@/components/administration/user-status-badge";
import type { ManagedUserSummary } from "@/lib/administration/user-types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type UserCardProps = {
  user: ManagedUserSummary;
  selected?: boolean;
  onSelect?: (userId: string) => void;
  onEdit?: (userId: string) => void;
  onDisable?: (user: ManagedUserSummary) => void;
  onRemoveMembership?: (user: ManagedUserSummary) => void;
};

export function UserCard({
  user,
  selected,
  onSelect,
  onEdit,
  onDisable,
  onRemoveMembership,
}: UserCardProps) {
  return (
    <article
      className={`rounded-2xl border p-4 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onSelect?.(user.id)}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{user.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <UserStatusBadge status={user.status} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <RoleBadge role={user.role} />
          <span className="text-xs text-muted-foreground">
            {user.companyNames.length > 0 ? user.companyNames.join(", ") : "No company"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div>
            <dt>Last login</dt>
            <dd className="text-foreground">{formatDate(user.lastLoginAt)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd className="text-foreground">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </button>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        <button
          type="button"
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium"
          onClick={() => onEdit?.(user.id)}
        >
          Edit
        </button>
        <button
          type="button"
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium"
          onClick={() => onDisable?.(user)}
          disabled={user.status === "disabled"}
        >
          Disable
        </button>
        <button
          type="button"
          className="rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-[11px] font-medium"
          onClick={() => onRemoveMembership?.(user)}
          disabled={user.companyIds.length === 0}
        >
          Remove Membership
        </button>
      </div>
    </article>
  );
}
