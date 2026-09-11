/**
 * Client-safe Administration audit / login history types.
 * No server imports — safe for "use client" bundles.
 */

export type AuditResult = "success" | "failure" | "denied";
export type AuditEventKind = "audit" | "login" | "security";

export type AuditEventRow = {
  id: string;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  companyId: string | null;
  companyName: string | null;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entity: string;
  result: AuditResult;
  eventKind: AuditEventKind;
  reason: string | null;
  correlationId: string | null;
  device: string | null;
  ipMasked: string | null;
};

export type LoginHistoryRow = {
  id: string;
  user: string;
  loginTime: string | null;
  logoutTime: string | null;
  device: string | null;
  ipMasked: string | null;
  result: AuditResult;
};
