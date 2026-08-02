"use client";

import { RoleBadge } from "@/components/administration/role-badge";
import { UserStatusBadge } from "@/components/administration/user-status-badge";
import type { ManagedUserSummary } from "@/services/administration-user-service";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type UserTableProps = {
  users: ManagedUserSummary[];
  selectedUserId?: string | null;
  onSelect?: (userId: string) => void;
  onEdit?: (userId: string) => void;
  onDisable?: (user: ManagedUserSummary) => void;
  onRemoveMembership?: (user: ManagedUserSummary) => void;
};

export function UserTable({
  users,
  selectedUserId,
  onSelect,
  onEdit,
  onDisable,
  onRemoveMembership,
}: UserTableProps) {
  if (users.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No users yet. Invite someone to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Role</th>
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Last Login</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className={`border-b border-border last:border-0 ${
                selectedUserId === user.id ? "bg-primary/5" : "bg-card"
              }`}
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="font-medium text-foreground hover:underline"
                  onClick={() => onSelect?.(user.id)}
                >
                  {user.name}
                </button>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{user.email}</td>
              <td className="px-3 py-2">
                <RoleBadge role={user.role} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {user.companyNames.length > 0 ? user.companyNames.join(", ") : "—"}
              </td>
              <td className="px-3 py-2">
                <UserStatusBadge status={user.status} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(user.lastLoginAt)}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {formatDate(user.createdAt)}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 text-[11px]"
                    onClick={() => onEdit?.(user.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 text-[11px]"
                    onClick={() => onDisable?.(user)}
                    disabled={user.status === "disabled"}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--radius-control)] border border-border px-2 py-0.5 text-[11px]"
                    onClick={() => onRemoveMembership?.(user)}
                    disabled={user.companyIds.length === 0}
                  >
                    Remove Membership
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
