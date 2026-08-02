"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminSection } from "@/components/administration/admin-section";
import { SecurityStatusCard } from "@/components/administration/security-status-card";
import { SecretHealthCard } from "@/components/administration/secret-health-card";
import { RlsStatusTable } from "@/components/administration/rls-status-table";
import { LoginHistoryTable } from "@/components/administration/login-history-table";
import { SecurityEventTable } from "@/components/administration/security-event-table";
import { RoleBadge } from "@/components/administration/role-badge";
import type { SecurityBundlePayload } from "@/services/administration-security-service";
import type {
  AuditEventRow,
  LoginHistoryRow,
} from "@/services/administration-audit-service";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function SecurityPanel() {
  const [bundle, setBundle] = useState<SecurityBundlePayload | null>(null);
  const [loginRows, setLoginRows] = useState<LoginHistoryRow[]>([]);
  const [loginAvailable, setLoginAvailable] = useState(true);
  const [securityEvents, setSecurityEvents] = useState<AuditEventRow[]>([]);
  const [securityAvailable, setSecurityAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [secRes, loginRes, eventsRes] = await Promise.all([
        fetch("/api/administration/security"),
        fetch("/api/administration/audit-logs?view=login"),
        fetch("/api/administration/audit-logs?view=security"),
      ]);
      const secData = await secRes.json();
      const loginData = await loginRes.json();
      const eventsData = await eventsRes.json();
      if (!secRes.ok) throw new Error(secData.error ?? "Failed to load security status");
      if (!loginRes.ok) throw new Error(loginData.error ?? "Failed to load login history");
      if (!eventsRes.ok) throw new Error(eventsData.error ?? "Failed to load security events");
      setBundle(secData);
      setLoginRows(loginData.rows ?? []);
      setLoginAvailable(loginData.available !== false);
      setSecurityEvents(eventsData.events ?? []);
      setSecurityAvailable(eventsData.available !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading security status…</p>;
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
        {error}
      </p>
    );
  }

  if (!bundle) return null;

  const { overview, authentication, authorization, rls, secrets } = bundle;

  return (
    <div className="space-y-8">
      <AdminSection
        title="Security Overview"
        description="Operational visibility over Authentication, Authorization, RLS, and Secrets. Display only — no security redesign."
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs font-medium"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SecurityStatusCard
            label={overview.authentication.label}
            status={overview.authentication.status}
            detail={overview.authentication.detail}
          />
          <SecurityStatusCard
            label={overview.authorization.label}
            status={overview.authorization.status}
            detail={overview.authorization.detail}
          />
          <SecurityStatusCard
            label={overview.rls.label}
            status={overview.rls.status}
            detail={overview.rls.detail}
          />
          <SecurityStatusCard
            label={overview.secretHealth.label}
            status={overview.secretHealth.status}
            detail={overview.secretHealth.detail}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SecurityStatusCard
            label="Active Sessions"
            status="healthy"
            value={overview.activeSessions}
            detail="Users with login activity in the last 24h"
          />
          <SecurityStatusCard
            label="Failed Login Attempts (24h)"
            status={overview.failedLoginAttempts24h > 0 ? "warning" : "healthy"}
            value={overview.failedLoginAttempts24h}
          />
          <SecurityStatusCard
            label="Last Security Event"
            status={overview.lastSecurityEvent ? "healthy" : "warning"}
            detail={
              overview.lastSecurityEvent
                ? `${overview.lastSecurityEvent.action} · ${formatDate(overview.lastSecurityEvent.createdAt)}`
                : "No security events yet"
            }
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Authentication"
        description="Reuses Supabase Auth (Sprint 7.1.B). No password or MFA management here."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SecurityStatusCard
            label="Auth Provider"
            status="healthy"
            detail={authentication.provider}
          />
          <SecurityStatusCard
            label="Active Users"
            status="healthy"
            value={authentication.activeUsers}
            detail={`${authentication.invitedUsers} invited · ${authentication.disabledUsers} disabled`}
          />
          <SecurityStatusCard
            label="Active Sessions"
            status="healthy"
            value={authentication.activeSessionsEstimate}
          />
          <SecurityStatusCard
            label="Session Duration"
            status="healthy"
            detail={authentication.sessionDuration}
          />
          <SecurityStatusCard
            label="Last Login"
            status="healthy"
            detail={formatDate(authentication.lastLoginAt)}
          />
          <SecurityStatusCard
            label="Failed Login Attempts"
            status={authentication.failedLoginAttempts24h > 0 ? "warning" : "healthy"}
            value={authentication.failedLoginAttempts24h}
            detail="Last 24 hours"
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Authorization"
        description="Read-only view of roles and memberships (Sprint 7.1.C). No permission editing."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {authorization.roles.map((role) => (
            <div
              key={role.id}
              className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <RoleBadge role={role.id} />
              <span className="text-muted-foreground">{role.userCount} users</span>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SecurityStatusCard
            label="Company Memberships"
            status="healthy"
            value={authorization.companyMemberships}
          />
          <SecurityStatusCard
            label="Marketplace Access"
            status="healthy"
            value={authorization.marketplaceAccessGrants}
            detail="Account slots under member companies"
          />
          <SecurityStatusCard
            label="Users without membership"
            status={authorization.usersWithoutMembership > 0 ? "warning" : "healthy"}
            value={authorization.usersWithoutMembership}
          />
        </div>
      </AdminSection>

      <AdminSection title="RLS Status" description="Reuses Sprint 7.1.D verification — no policy editing.">
        <RlsStatusTable
          tables={rls.tables}
          dataPlaneEnabled={rls.dataPlaneEnabled}
          lastValidationAt={rls.lastValidationAt}
          validationResult={rls.validationResult}
          validationDetail={rls.validationDetail}
        />
      </AdminSection>

      <AdminSection title="Secret Health" description="Status only — values are never exposed.">
        <SecretHealthCard items={secrets} />
      </AdminSection>

      <AdminSection title="Login History" description="Read-only authentication activity.">
        <LoginHistoryTable rows={loginRows} available={loginAvailable} />
      </AdminSection>

      <AdminSection
        title="Security Events"
        description="Read-only feed. Events originate from existing platform services (Auth, connections, etc.) — Administration never generates them."
      >
        <SecurityEventTable events={securityEvents} available={securityAvailable} />
      </AdminSection>
    </div>
  );
}
