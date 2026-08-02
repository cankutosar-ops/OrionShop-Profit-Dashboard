"use client";

import { useEffect, useState } from "react";
import { AdminSection } from "@/components/administration/admin-section";
import { RoleBadge } from "@/components/administration/role-badge";
import type { PlatformRole } from "@/lib/security/roles";

type RoleRow = { id: PlatformRole; label: string };

const ROLE_BLURBS: Record<PlatformRole, string> = {
  administrator: "Full operational administration of companies, users, and warehouse controls.",
  manager: "Manage company workspace and day-to-day operations.",
  operator: "Operate sync and operational workflows within assigned companies.",
  viewer: "Read-only visibility within assigned companies.",
};

export function RolesPanel() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/administration/roles");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load roles");
        setRoles(data.roles ?? []);
        setNote(data.note ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load roles");
      }
    })();
  }, []);

  return (
    <AdminSection
      title="Roles"
      description="Platform roles reused from existing claim metadata. No new permission engine."
    >
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {(roles.length > 0
          ? roles
          : (["administrator", "manager", "operator", "viewer"] as PlatformRole[]).map(
              (id) => ({ id, label: id })
            )
        ).map((role) => (
          <article key={role.id} className="rounded-2xl border border-border bg-card p-4">
            <RoleBadge role={role.id} />
            <h3 className="mt-2 text-sm font-semibold">{role.label}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_BLURBS[role.id]}</p>
          </article>
        ))}
      </div>
    </AdminSection>
  );
}
