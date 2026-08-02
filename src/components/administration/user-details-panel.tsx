"use client";

import { MembershipTable } from "@/components/administration/membership-table";
import { MarketplaceAccessTable } from "@/components/administration/marketplace-access-table";
import { RoleBadge } from "@/components/administration/role-badge";
import { UserStatusBadge } from "@/components/administration/user-status-badge";
import { PLATFORM_ROLES, type PlatformRole } from "@/lib/security/roles";
import { platformRoleLabel } from "@/lib/security/roles";
import type { ManagedUserDetails } from "@/services/administration-user-service";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

type UserDetailsPanelProps = {
  user: ManagedUserDetails | null;
  loading?: boolean;
  busy?: boolean;
  companies: { id: string; name: string }[];
  onSaveProfile: (input: { name: string; role: PlatformRole }) => Promise<void>;
  onDisable: () => Promise<void>;
  onEnable: () => Promise<void>;
  onAddMembership: (companyId: string) => Promise<void>;
  onRemoveMembership: (companyId: string) => Promise<void>;
  onToggleMarketplace: (marketplaceAccountId: string, granted: boolean) => Promise<void>;
};

export function UserDetailsPanel({
  user,
  loading,
  busy,
  companies,
  onSaveProfile,
  onDisable,
  onEnable,
  onAddMembership,
  onRemoveMembership,
  onToggleMarketplace,
}: UserDetailsPanelProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading user…</p>;
  }
  if (!user) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Select a user to view profile, memberships, marketplace access, and activity.
      </p>
    );
  }

  const availableCompanies = companies.filter((c) => !user.companyIds.includes(c.id));

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{user.name}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <UserStatusBadge status={user.status} />
        </div>

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            const role = String(fd.get("role") ?? "") as PlatformRole;
            void onSaveProfile({ name, role });
          }}
        >
          <label className="text-xs">
            <span className="text-muted-foreground">Display name</span>
            <input
              name="name"
              defaultValue={user.name}
              required
              className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="text-muted-foreground">Role</span>
            <select
              name="role"
              defaultValue={user.role ?? "viewer"}
              className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
            >
              {PLATFORM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {platformRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Save profile
            </button>
            {user.status === "disabled" ? (
              <button
                type="button"
                disabled={busy}
                className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
                onClick={() => void onEnable()}
              >
                Enable
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
                onClick={() => void onDisable()}
              >
                Disable
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              Email and credentials are managed by Supabase Auth — passwords are never shown.
            </span>
          </div>
        </form>
      </section>

      <div className="space-y-3">
        <MembershipTable
          memberships={user.memberships}
          busy={busy}
          onRemove={(companyId) => void onRemoveMembership(companyId)}
        />
        {availableCompanies.length > 0 ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const fd = new FormData(event.currentTarget);
              const companyId = String(fd.get("companyId") ?? "").trim();
              if (companyId) void onAddMembership(companyId);
              event.currentTarget.reset();
            }}
          >
            <label className="min-w-[12rem] flex-1 text-xs">
              <span className="text-muted-foreground">Add membership</span>
              <select
                name="companyId"
                required
                defaultValue=""
                className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select company
                </option>
                {availableCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[var(--radius-control)] border border-border px-3 py-2 text-xs font-medium"
            >
              Add Membership
            </button>
          </form>
        ) : null}
      </div>

      <MarketplaceAccessTable
        rows={user.marketplaceAccess}
        busy={busy}
        onToggle={(id, granted) => void onToggleMarketplace(id, granted)}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Role</h3>
        <RoleBadge role={user.role} />
        <p className="text-xs text-muted-foreground">
          Display metadata only. Tenant authorization continues to use company / marketplace
          membership claims.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Recent Activity</h3>
        {user.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {user.recentActivity.map((item) => (
              <li
                key={`${item.label}-${item.at}`}
                className="flex flex-wrap justify-between gap-2 border-b border-border py-1.5 last:border-0"
              >
                <span className="text-muted-foreground">{item.label}</span>
                <span>{formatDate(item.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
