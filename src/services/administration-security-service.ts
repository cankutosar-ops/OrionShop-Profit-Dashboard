/**
 * Sprint 11.5 — Security & Audit read aggregation (display only).
 * Reuses Auth 7.1.B, AuthZ 7.1.C, RLS 7.1.D, Secrets 7.1.E.
 * Does not redesign security engines or expose secret values.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPlaceholderSecret,
  isProductionRuntime,
  tryResolveInternalApiSecret,
} from "@/lib/security/secrets";
import {
  PLATFORM_ROLES,
  platformRoleLabel,
  type PlatformRole,
} from "@/lib/security/roles";
import { listManagedUsers } from "@/services/administration-user-service";
import { listCompanies } from "@/services/marketplace-account-service";
import {
  countFailedLoginsSince,
  queryAuditEvents,
  type AuditEventRow,
} from "@/services/administration-audit-service";

export type SecurityHealthTone = "healthy" | "warning" | "expired" | "missing";

export type SecurityStatusItem = {
  key: string;
  label: string;
  status: SecurityHealthTone;
  detail: string;
};

export type SecretHealthItem = {
  key: string;
  label: string;
  status: SecurityHealthTone;
  detail: string;
};

export type RlsTableStatus = {
  tableName: string;
  rlsEnabled: boolean;
  policyCount: number;
  policyStatus: "enabled" | "disabled" | "unknown" | "absent";
};

export type AuthStatusPayload = {
  provider: string;
  activeUsers: number;
  invitedUsers: number;
  disabledUsers: number;
  activeSessionsEstimate: number;
  sessionDuration: string;
  lastLoginAt: string | null;
  failedLoginAttempts24h: number;
};

export type AuthzStatusPayload = {
  roles: { id: PlatformRole; label: string; userCount: number }[];
  companyMemberships: number;
  marketplaceAccessGrants: number;
  usersWithMembership: number;
  usersWithoutMembership: number;
};

export type RlsStatusPayload = {
  dataPlaneEnabled: boolean;
  tables: RlsTableStatus[];
  lastValidationAt: string | null;
  validationResult: "pass" | "warn" | "fail" | "unknown";
  validationDetail: string;
};

export type SecurityOverviewPayload = {
  authentication: SecurityStatusItem;
  authorization: SecurityStatusItem;
  rls: SecurityStatusItem;
  secretHealth: SecurityStatusItem;
  activeSessions: number;
  failedLoginAttempts24h: number;
  lastSecurityEvent: AuditEventRow | null;
  generatedAt: string;
};

export type SecurityBundlePayload = {
  overview: SecurityOverviewPayload;
  authentication: AuthStatusPayload;
  authorization: AuthzStatusPayload;
  rls: RlsStatusPayload;
  secrets: SecretHealthItem[];
};

function secretTone(
  present: boolean,
  placeholder: boolean,
  opts?: { warning?: boolean }
): SecurityHealthTone {
  if (!present || placeholder) return "missing";
  if (opts?.warning) return "warning";
  return "healthy";
}

function isMissingRelation(error: { message?: string } | null): boolean {
  if (!error?.message) return false;
  return /could not find the table|does not exist|schema cache|PGRST205|function/i.test(
    error.message
  );
}

async function loadRlsTables(): Promise<RlsTableStatus[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("orion_admin_rls_status");
  if (error || !data) {
    // Fallback catalog (display only) when RPC not yet applied.
    const fallback = [
      "companies",
      "marketplace_accounts",
      "products",
      "wb_orders",
      "wb_sales",
      "wb_stocks",
      "wb_finance",
      "purchases",
      "administration_audit_events",
    ];
    return fallback.map((tableName) => ({
      tableName,
      rlsEnabled: false,
      policyCount: 0,
      policyStatus: "unknown" as const,
    }));
  }

  return (data as Array<Record<string, unknown>>).map((row) => {
    const tableName = String(row.table_name);
    const rlsEnabled = Boolean(row.rls_enabled);
    const policyCount = Number(row.policy_count ?? 0);
    let policyStatus: RlsTableStatus["policyStatus"] = "unknown";
    if (rlsEnabled && policyCount > 0) policyStatus = "enabled";
    else if (rlsEnabled && policyCount === 0) policyStatus = "disabled";
    else if (!rlsEnabled) policyStatus = "disabled";
    return { tableName, rlsEnabled, policyCount, policyStatus };
  });
}

export async function getSecretHealth(): Promise<SecretHealthItem[]> {
  const credKey = process.env.MARKETPLACE_CREDENTIALS_KEY?.trim() ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  const internal = process.env.INTERNAL_API_SECRET?.trim() ?? "";
  const internalResolved = tryResolveInternalApiSecret();

  const companies = await listCompanies(undefined, { includeArchived: true });
  const accounts = companies.flatMap((c) => c.accounts ?? []);
  const withKey = accounts.filter((a) => a.has_api_key).length;
  const withoutKey = accounts.length - withKey;

  let marketplaceStatus: SecurityHealthTone = "healthy";
  let marketplaceDetail = `${withKey}/${accounts.length} accounts have credentials configured`;
  if (accounts.length === 0) {
    marketplaceStatus = "warning";
    marketplaceDetail = "No marketplace accounts";
  } else if (withKey === 0) {
    marketplaceStatus = "missing";
    marketplaceDetail = "No marketplace credentials configured";
  } else if (withoutKey > 0) {
    marketplaceStatus = "warning";
    marketplaceDetail = `${withoutKey} account(s) missing credentials`;
  }

  const encryptionStatus = secretTone(Boolean(credKey), isPlaceholderSecret(credKey));
  const internalStatus = secretTone(
    Boolean(internalResolved),
    isPlaceholderSecret(internal) && isProductionRuntime(),
    {
      warning:
        !internal && Boolean(internalResolved) && !isProductionRuntime(),
    }
  );

  return [
    {
      key: "marketplace_credentials",
      label: "Marketplace Credentials",
      status: marketplaceStatus,
      detail: marketplaceDetail,
    },
    {
      key: "encryption",
      label: "Encryption Status",
      status: encryptionStatus,
      detail:
        encryptionStatus === "healthy"
          ? "MARKETPLACE_CREDENTIALS_KEY configured"
          : "Encryption key missing or placeholder",
    },
    {
      key: "rotation",
      label: "Rotation Status",
      status: "warning",
      detail: "Manual rotation — no automated rotation schedule configured",
    },
    {
      key: "internal_secret",
      label: "Internal Secret Status",
      status: internalStatus,
      detail:
        internalStatus === "healthy"
          ? "INTERNAL_API_SECRET configured"
          : internalStatus === "warning"
            ? "Using non-production fallback for internal API secret"
            : "Internal API secret missing",
    },
    {
      key: "service_role",
      label: "Service Role Key",
      status: secretTone(Boolean(serviceRole), isPlaceholderSecret(serviceRole)),
      detail: isPlaceholderSecret(serviceRole)
        ? "Service role key missing or placeholder"
        : "Present (value never displayed)",
    },
    {
      key: "anon_key",
      label: "Anon Key",
      status: secretTone(Boolean(anon), isPlaceholderSecret(anon)),
      detail: isPlaceholderSecret(anon)
        ? "Anon key missing or placeholder"
        : "Present (value never displayed)",
    },
  ];
}

export async function getAuthenticationStatus(): Promise<AuthStatusPayload> {
  const users = await listManagedUsers();
  const activeUsers = users.filter((u) => u.status === "active").length;
  const invitedUsers = users.filter((u) => u.status === "invited").length;
  const disabledUsers = users.filter((u) => u.status === "disabled").length;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const activeSessionsEstimate = users.filter((u) => {
    if (!u.lastLoginAt || u.status !== "active") return false;
    return Date.parse(u.lastLoginAt) >= dayAgo;
  }).length;
  const lastLoginAt =
    users
      .map((u) => u.lastLoginAt)
      .filter(Boolean)
      .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] ?? null;

  const failedLoginAttempts24h = await countFailedLoginsSince(
    new Date(dayAgo).toISOString()
  );

  return {
    provider: "Supabase Auth",
    activeUsers,
    invitedUsers,
    disabledUsers,
    activeSessionsEstimate,
    sessionDuration: "Managed by Supabase Auth (JWT refresh)",
    lastLoginAt,
    failedLoginAttempts24h,
  };
}

export async function getAuthorizationStatus(): Promise<AuthzStatusPayload> {
  const users = await listManagedUsers();
  const roleCounts = Object.fromEntries(
    PLATFORM_ROLES.map((r) => [r, 0])
  ) as Record<PlatformRole, number>;
  let companyMemberships = 0;
  let marketplaceAccessGrants = 0;
  let usersWithMembership = 0;

  for (const u of users) {
    if (u.role) roleCounts[u.role] = (roleCounts[u.role] ?? 0) + 1;
    companyMemberships += u.companyIds.length;
    if (u.companyIds.length > 0) usersWithMembership += 1;
  }

  // Marketplace access: expand memberships via companies list (public flags only).
  const companies = await listCompanies(undefined, { includeArchived: true });
  const accountByCompany = new Map(
    companies.map((c) => [c.id, c.accounts?.length ?? 0])
  );
  for (const u of users) {
    for (const companyId of u.companyIds) {
      marketplaceAccessGrants += accountByCompany.get(companyId) ?? 0;
    }
  }

  return {
    roles: PLATFORM_ROLES.map((id) => ({
      id,
      label: platformRoleLabel(id),
      userCount: roleCounts[id] ?? 0,
    })),
    companyMemberships,
    marketplaceAccessGrants,
    usersWithMembership,
    usersWithoutMembership: users.length - usersWithMembership,
  };
}

export async function getRlsStatus(): Promise<RlsStatusPayload> {
  const dataPlaneEnabled = process.env.ORION_RLS_DATA_PLANE === "1";
  const tables = await loadRlsTables();
  const known = tables.filter((t) => t.policyStatus !== "unknown");
  const enabled = known.filter((t) => t.policyStatus === "enabled").length;
  const disabled = known.filter((t) => t.policyStatus === "disabled").length;

  let validationResult: RlsStatusPayload["validationResult"] = "unknown";
  let validationDetail = "RLS status reporter not applied yet — run migration 11.5";
  if (known.length > 0) {
    if (disabled === 0 && enabled > 0 && dataPlaneEnabled) {
      validationResult = "pass";
      validationDetail = `${enabled} table(s) with RLS policies; data plane enabled`;
    } else if (enabled > 0 && !dataPlaneEnabled) {
      validationResult = "warn";
      validationDetail = `RLS policies present but ORION_RLS_DATA_PLANE is not enabled`;
    } else if (disabled > 0) {
      validationResult = "warn";
      validationDetail = `${disabled} table(s) without active policies`;
    } else {
      validationResult = "fail";
      validationDetail = "No RLS-enabled tables detected";
    }
  }

  return {
    dataPlaneEnabled,
    tables,
    lastValidationAt: new Date().toISOString(),
    validationResult,
    validationDetail,
  };
}

function overviewItem(
  key: string,
  label: string,
  status: SecurityHealthTone,
  detail: string
): SecurityStatusItem {
  return { key, label, status, detail };
}

function buildOverview(input: {
  authentication: AuthStatusPayload;
  authorization: AuthzStatusPayload;
  rls: RlsStatusPayload;
  secrets: SecretHealthItem[];
  lastSecurityEvent: AuditEventRow | null;
}): SecurityOverviewPayload {
  const { authentication, authorization, rls, secrets, lastSecurityEvent } = input;

  const worstSecret = secrets.some((s) => s.status === "missing")
    ? "missing"
    : secrets.some((s) => s.status === "warning" || s.status === "expired")
      ? "warning"
      : "healthy";

  const authStatus: SecurityHealthTone =
    authentication.activeUsers > 0
      ? "healthy"
      : authentication.invitedUsers > 0
        ? "warning"
        : "missing";

  const authzStatus: SecurityHealthTone =
    authorization.usersWithMembership > 0
      ? "healthy"
      : authorization.usersWithoutMembership > 0
        ? "warning"
        : "missing";

  const rlsTone: SecurityHealthTone =
    rls.validationResult === "pass"
      ? "healthy"
      : rls.validationResult === "warn"
        ? "warning"
        : rls.validationResult === "fail"
          ? "missing"
          : "warning";

  return {
    authentication: overviewItem(
      "authentication",
      "Authentication Status",
      authStatus,
      `${authentication.provider} · ${authentication.activeUsers} active users`
    ),
    authorization: overviewItem(
      "authorization",
      "Authorization Status",
      authzStatus,
      `${authorization.usersWithMembership} users with company membership`
    ),
    rls: overviewItem("rls", "RLS Status", rlsTone, rls.validationDetail),
    secretHealth: overviewItem(
      "secrets",
      "Secret Health",
      worstSecret,
      secrets.find((s) => s.status !== "healthy")?.detail ?? "All secret checks healthy"
    ),
    activeSessions: authentication.activeSessionsEstimate,
    failedLoginAttempts24h: authentication.failedLoginAttempts24h,
    lastSecurityEvent,
    generatedAt: new Date().toISOString(),
  };
}

export async function getSecurityOverview(): Promise<SecurityOverviewPayload> {
  const bundle = await getSecurityBundle();
  return bundle.overview;
}

export async function getSecurityBundle(): Promise<SecurityBundlePayload> {
  const [authentication, authorization, rls, secrets, securityFeed] = await Promise.all([
    getAuthenticationStatus(),
    getAuthorizationStatus(),
    getRlsStatus(),
    getSecretHealth(),
    queryAuditEvents({ eventKind: "security", limit: 1 }),
  ]);

  // Administration never generates security events — display only.
  const overview = buildOverview({
    authentication,
    authorization,
    rls,
    secrets,
    lastSecurityEvent: securityFeed.events[0] ?? null,
  });

  return { overview, authentication, authorization, rls, secrets };
}

/** Ensure payloads never include credential-like keys. */
export function assertSecurityPayloadSafe(payload: unknown): void {
  const text = JSON.stringify(payload);
  if (
    /"password"\s*:|"api_key"\s*:|"api_key_encrypted"|"encrypted_|"secret"\s*:|"access_token"|"refresh_token"/i.test(
      text
    )
  ) {
    throw new Error("Refusing to return credential-bearing security payload");
  }
}

export async function probeDbReachable(): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("companies").select("id").limit(1);
    return !error || isMissingRelation(error);
  } catch {
    return false;
  }
}
