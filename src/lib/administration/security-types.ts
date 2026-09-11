/**
 * Client-safe Administration security overview types.
 * No server imports — safe for "use client" bundles.
 */

import type { PlatformRole } from "@/lib/security/roles";
import type { AuditEventRow } from "@/lib/administration/audit-types";

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
