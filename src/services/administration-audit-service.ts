/**
 * Sprint 11.5 — Append-only administration audit / security events.
 * Visibility store only. Never persists secret values.
 *
 * Security events (event_kind=security) must be recorded by existing platform
 * services (Auth, AuthZ, marketplace connections, warehouse APIs) — never by
 * Administration UI/aggregation code.
 */

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { redactSecrets } from "@/lib/security/secrets";

export type AuditResult = "success" | "failure" | "denied";
export type AuditEventKind = "audit" | "login" | "security";

export type AuditEventInput = {
  userId?: string | null;
  userEmail?: string | null;
  companyId?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  result: AuditResult;
  eventKind: AuditEventKind;
  /** Operator explanation for sensitive administrative actions. */
  reason?: string | null;
  /** Groups events from the same operation (backfill, incremental sync, …). */
  correlationId?: string | null;
  device?: string | null;
  ipMasked?: string | null;
  metadata?: Record<string, unknown>;
};

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

export type AuditQuery = {
  search?: string;
  module?: string;
  action?: string;
  result?: string;
  eventKind?: AuditEventKind | "all";
  correlationId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  return /could not find the table|does not exist|schema cache|PGRST205/i.test(error.message);
}

export function newCorrelationId(): string {
  return randomUUID();
}

/** Mask IPv4/IPv6 for display — never store full client IP in UI payloads. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.trim();
  if (!v) return null;
  if (v.includes(".")) {
    const parts = v.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (v.includes(":")) {
    const parts = v.split(":");
    return `${parts.slice(0, 2).join(":")}:****`;
  }
  return "****";
}

export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export function deviceFromRequest(request: Request): string | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua) return null;
  if (/mobile|android|iphone/i.test(ua)) return "Mobile";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/windows|macintosh|linux/i.test(ua)) return "Desktop";
  return "Unknown";
}

function sanitizeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const json = redactSecrets(JSON.stringify(meta));
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const blocked = /password|secret|api_key|token|encrypted|credential/i;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (blocked.test(k)) continue;
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Best-effort write — never throws into caller request path. */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("administration_audit_events").insert({
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      company_id: input.companyId ?? null,
      module: input.module,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      result: input.result,
      event_kind: input.eventKind,
      reason: input.reason?.trim() || null,
      correlation_id: input.correlationId?.trim() || null,
      device: input.device ?? null,
      ip_masked: input.ipMasked ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });
    if (error && !isMissingRelation(error)) {
      console.warn("[audit] record failed:", redactSecrets(error.message));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[audit] record failed:", redactSecrets(message));
  }
}

/**
 * Record a security event from an existing platform service.
 * Do not call from Administration aggregation / UI code.
 */
export async function recordPlatformSecurityEvent(
  input: Omit<AuditEventInput, "eventKind">
): Promise<void> {
  await recordAuditEvent({ ...input, eventKind: "security" });
}

function mapRow(
  row: Record<string, unknown>,
  companyNames: Map<string, string>
): AuditEventRow {
  const companyId = row.company_id ? String(row.company_id) : null;
  const entityType = row.entity_type ? String(row.entity_type) : null;
  const entityId = row.entity_id ? String(row.entity_id) : null;
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    userId: row.user_id ? String(row.user_id) : null,
    userEmail: row.user_email ? String(row.user_email) : null,
    companyId,
    companyName: companyId ? companyNames.get(companyId) ?? null : null,
    module: String(row.module),
    action: String(row.action),
    entityType,
    entityId,
    entity: [entityType, entityId].filter(Boolean).join(":") || "—",
    result: String(row.result) as AuditResult,
    eventKind: String(row.event_kind) as AuditEventKind,
    reason: row.reason ? String(row.reason) : null,
    correlationId: row.correlation_id ? String(row.correlation_id) : null,
    device: row.device ? String(row.device) : null,
    ipMasked: row.ip_masked ? String(row.ip_masked) : null,
  };
}

export async function queryAuditEvents(query: AuditQuery = {}): Promise<{
  events: AuditEventRow[];
  available: boolean;
}> {
  const supabase = createAdminClient();
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);

  let q = supabase
    .from("administration_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.eventKind && query.eventKind !== "all") {
    q = q.eq("event_kind", query.eventKind);
  }
  if (query.module) q = q.eq("module", query.module);
  if (query.action) q = q.eq("action", query.action);
  if (query.result) q = q.eq("result", query.result);
  if (query.correlationId) q = q.eq("correlation_id", query.correlationId);
  if (query.dateFrom) q = q.gte("created_at", query.dateFrom);
  if (query.dateTo) q = q.lte("created_at", query.dateTo);

  const { data, error } = await q;
  if (error) {
    if (isMissingRelation(error)) return { events: [], available: false };
    throw new Error(`Failed to query audit events: ${error.message}`);
  }

  const companyIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r.company_id ? String(r.company_id) : ""))
        .filter(Boolean)
    ),
  ];
  const companyNames = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);
    for (const c of companies ?? []) {
      companyNames.set(String(c.id), String(c.name));
    }
  }

  let events = (data ?? []).map((row) => mapRow(row as Record<string, unknown>, companyNames));

  const search = query.search?.trim().toLowerCase();
  if (search) {
    events = events.filter((e) => {
      const hay = [
        e.userEmail,
        e.companyName,
        e.module,
        e.action,
        e.entity,
        e.result,
        e.reason,
        e.correlationId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  return { events, available: true };
}

export type LoginHistoryRow = {
  id: string;
  user: string;
  loginTime: string | null;
  logoutTime: string | null;
  device: string | null;
  ipMasked: string | null;
  result: AuditResult;
};

export async function queryLoginHistory(limit = 100): Promise<{
  rows: LoginHistoryRow[];
  available: boolean;
}> {
  const { events, available } = await queryAuditEvents({
    eventKind: "login",
    limit,
  });

  const rows: LoginHistoryRow[] = events.map((e) => ({
    id: e.id,
    user: e.userEmail ?? e.userId ?? "—",
    loginTime: e.action === "logout" ? null : e.createdAt,
    logoutTime: e.action === "logout" ? e.createdAt : null,
    device: e.device,
    ipMasked: e.ipMasked,
    result: e.result,
  }));

  return { rows, available };
}

export const SECURITY_EVENT_ACTIONS = [
  "login_failure",
  "permission_denied",
  "secret_rotation",
  "credential_update",
  "marketplace_credential_test",
  "security_validation",
] as const;

export type SecurityEventAction = (typeof SECURITY_EVENT_ACTIONS)[number];

export async function querySecurityEvents(limit = 100): Promise<{
  events: AuditEventRow[];
  available: boolean;
}> {
  const { events, available } = await queryAuditEvents({
    eventKind: "security",
    limit,
  });
  return { events, available };
}

export async function countFailedLoginsSince(isoSince: string): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from("administration_audit_events")
      .select("id", { count: "exact", head: true })
      .eq("event_kind", "login")
      .eq("action", "login_failure")
      .gte("created_at", isoSince);
    if (error) {
      if (isMissingRelation(error)) return 0;
      return 0;
    }
    return count ?? 0;
  } catch {
    return 0;
  }
}
