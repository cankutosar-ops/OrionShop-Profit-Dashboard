/**
 * Sprint 11.5 — Audit logs / login history / security events (read-only).
 */

import { NextResponse } from "next/server";
import { requireAuth, isAuthFailure } from "@/lib/security/require-auth";
import {
  queryAuditEvents,
  queryLoginHistory,
  querySecurityEvents,
  type AuditEventKind,
} from "@/services/administration-audit-service";
import { assertSecurityPayloadSafe } from "@/services/administration-security-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (isAuthFailure(auth)) return auth;

    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "audit";

    if (view === "login") {
      const { rows, available } = await queryLoginHistory(
        Number(url.searchParams.get("limit") ?? 100)
      );
      const payload = { view, rows, available };
      assertSecurityPayloadSafe(payload);
      return NextResponse.json(payload);
    }

    if (view === "security") {
      const { events, available } = await querySecurityEvents(
        Number(url.searchParams.get("limit") ?? 100)
      );
      const payload = { view, events, available };
      assertSecurityPayloadSafe(payload);
      return NextResponse.json(payload);
    }

    const eventKind = (url.searchParams.get("eventKind") ?? "all") as
      | AuditEventKind
      | "all";
    const { events, available } = await queryAuditEvents({
      search: url.searchParams.get("search") ?? undefined,
      module: url.searchParams.get("module") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      result: url.searchParams.get("result") ?? undefined,
      eventKind,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 200),
    });

    const payload = { view: "audit", events, available };
    assertSecurityPayloadSafe(payload);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load audit logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
