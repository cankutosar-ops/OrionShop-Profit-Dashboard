"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/administration/admin-section";
import { UserCard } from "@/components/administration/user-card";
import { UserDetailsPanel } from "@/components/administration/user-details-panel";
import { UserTable } from "@/components/administration/user-table";
import { PLATFORM_ROLES, type PlatformRole } from "@/lib/security/roles";
import { platformRoleLabel } from "@/lib/security/roles";
import type {
  ManagedUserDetails,
  ManagedUserSummary,
} from "@/lib/administration/user-types";

type CompanyOption = { id: string; name: string };

type InviteForm = {
  email: string;
  name: string;
  companyId: string;
  role: PlatformRole;
  reason: string;
};

const emptyInvite: InviteForm = {
  email: "",
  name: "",
  companyId: "",
  role: "viewer",
  reason: "",
};

export function UsersPanel() {
  const [users, setUsers] = useState<ManagedUserSummary[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<ManagedUserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState<InviteForm>(emptyInvite);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, companiesRes] = await Promise.all([
        fetch("/api/administration/users"),
        fetch("/api/companies"),
      ]);
      const usersData = await usersRes.json();
      const companiesData = await companiesRes.json();
      if (!usersRes.ok) throw new Error(usersData.error ?? "Failed to load users");
      if (!companiesRes.ok) throw new Error(companiesData.error ?? "Failed to load companies");
      setUsers(usersData.users ?? []);
      setCompanies(
        (companiesData.companies ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (userId: string) => {
    setDetailsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/administration/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load user");
      setDetails(data.user ?? null);
      setSelectedId(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function inviteUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/administration/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invite),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setShowInvite(false);
      setInvite(emptyInvite);
      await loadUsers();
      if (data.user?.id) await loadDetails(data.user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function disableUser(user: ManagedUserSummary) {
    if (!window.confirm(`Disable ${user.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/administration/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Disable failed");
      await loadUsers();
      if (selectedId === user.id) await loadDetails(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disable failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeMembershipQuick(user: ManagedUserSummary) {
    if (user.companyIds.length === 0) return;
    const companyId =
      user.companyIds.length === 1
        ? user.companyIds[0]
        : window.prompt(
            `Company ID to remove:\n${user.companyNames
              .map((n, i) => `${n} (${user.companyIds[i]})`)
              .join("\n")}`
          );
    if (!companyId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/administration/users/${user.id}/memberships?companyId=${encodeURIComponent(companyId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove membership failed");
      await loadUsers();
      if (selectedId === user.id) await loadDetails(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove membership failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSection
        title="Users"
        description="Invite and manage platform users. Authentication remains Supabase Auth; tenancy uses existing orion claims."
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            onClick={() => {
              setInvite((f) => ({
                ...emptyInvite,
                companyId: companies[0]?.id ?? "",
              }));
              setShowInvite(true);
            }}
          >
            Invite
          </button>
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
            onClick={() => void loadUsers()}
          >
            Refresh
          </button>
        </div>

        {showInvite ? (
          <form
            onSubmit={inviteUser}
            className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5"
          >
            <h3 className="text-sm font-semibold">Invite User</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sends an email invitation via Supabase Auth. No password is set or displayed.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Email</span>
                <input
                  required
                  type="email"
                  value={invite.email}
                  onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Name</span>
                <input
                  value={invite.name}
                  onChange={(e) => setInvite((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Company</span>
                <select
                  required
                  value={invite.companyId}
                  onChange={(e) => setInvite((f) => ({ ...f, companyId: e.target.value }))}
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select company</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Initial role</span>
                <select
                  value={invite.role}
                  onChange={(e) =>
                    setInvite((f) => ({ ...f, role: e.target.value as PlatformRole }))
                  }
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                >
                  {PLATFORM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {platformRoleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="text-muted-foreground">Reason (optional)</span>
                <input
                  value={invite.reason}
                  onChange={(e) => setInvite((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Operator explanation for this invite"
                  className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Send invite
              </button>
              <button
                type="button"
                className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
                onClick={() => setShowInvite(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading users…</p>
        ) : (
          <>
            <div className="hidden lg:block">
              <UserTable
                users={users}
                selectedUserId={selectedId}
                onSelect={(id) => void loadDetails(id)}
                onEdit={(id) => void loadDetails(id)}
                onDisable={(u) => void disableUser(u)}
                onRemoveMembership={(u) => void removeMembershipQuick(u)}
              />
            </div>
            <div className="grid gap-3 lg:hidden">
              {users.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  selected={selectedId === user.id}
                  onSelect={(id) => void loadDetails(id)}
                  onEdit={(id) => void loadDetails(id)}
                  onDisable={(u) => void disableUser(u)}
                  onRemoveMembership={(u) => void removeMembershipQuick(u)}
                />
              ))}
            </div>
          </>
        )}
      </AdminSection>

      <AdminSection title="User Details">
        <UserDetailsPanel
          user={details}
          loading={detailsLoading}
          busy={busy}
          companies={companies}
          onSaveProfile={async ({ name, role }) => {
            if (!selectedId) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(`/api/administration/users/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, role }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Save failed");
              await loadUsers();
              await loadDetails(selectedId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Save failed");
            } finally {
              setBusy(false);
            }
          }}
          onDisable={async () => {
            if (!details) return;
            await disableUser(details);
          }}
          onEnable={async () => {
            if (!selectedId) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(`/api/administration/users/${selectedId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ disabled: false }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Enable failed");
              await loadUsers();
              await loadDetails(selectedId);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Enable failed");
            } finally {
              setBusy(false);
            }
          }}
          onAddMembership={async (companyId) => {
            if (!selectedId) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(
                `/api/administration/users/${selectedId}/memberships`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyId }),
                }
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Add membership failed");
              setDetails(data.user);
              await loadUsers();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Add membership failed");
            } finally {
              setBusy(false);
            }
          }}
          onRemoveMembership={async (companyId) => {
            if (!selectedId) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(
                `/api/administration/users/${selectedId}/memberships?companyId=${encodeURIComponent(companyId)}`,
                { method: "DELETE" }
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Remove membership failed");
              setDetails(data.user);
              await loadUsers();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Remove membership failed");
            } finally {
              setBusy(false);
            }
          }}
          onToggleMarketplace={async (marketplaceAccountId, granted) => {
            if (!selectedId) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(
                `/api/administration/users/${selectedId}/marketplace-access`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ marketplaceAccountId, granted }),
                }
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Access update failed");
              setDetails(data.user);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Access update failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </AdminSection>
    </div>
  );
}
