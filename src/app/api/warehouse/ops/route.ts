import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  cancelWarehouseQueueJobs,
  enqueueManualWarehouseSync,
  getWarehouseAdminBundle,
  getWarehouseOpsMonitoring,
  runWarehouseOpsTick,
  setWarehouseScheduleEnabled,
  setWarehouseScheduleInterval,
} from "@/services/warehouse-ops-service";
import { getWarehouseControlCenter } from "@/services/warehouse-control-center-service";
import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/warehouse/ops?marketplaceAccountId=&view=monitoring|admin|control
 * POST actions: tick | enqueue | cancel | schedule | schedule_enable
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "admin";
  const simulate = url.searchParams.get("simulate") === "1";

  try {
    if (view === "monitoring") {
      const monitoring = await getWarehouseOpsMonitoring(authz.marketplaceAccountId!, {
        simulate,
      });
      return NextResponse.json({ ok: true, monitoring });
    }

    if (view === "control") {
      const control = await getWarehouseControlCenter(authz.marketplaceAccountId!, {
        simulate,
      });
      return NextResponse.json({ ok: true, ...control });
    }

    const bundle = await getWarehouseAdminBundle(authz.marketplaceAccountId!, { simulate });
    return NextResponse.json({ ok: true, ...bundle });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load warehouse ops" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      action?: "tick" | "enqueue" | "cancel" | "schedule" | "schedule_enable";
      simulate?: boolean;
      processQueue?: boolean;
      forceDue?: boolean;
      jobId?: string;
      entities?: IncrementalSyncEntity[];
      entity?: IncrementalSyncEntity;
      intervalMs?: number;
      enabled?: boolean;
      companyId?: string;
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const action = body.action ?? "tick";

    if (action === "tick") {
      const result = await runWarehouseOpsTick({
        marketplaceAccountId,
        simulate: body.simulate,
        processQueue: body.processQueue,
        forceDue: body.forceDue,
        companyId: body.companyId,
      });
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === "enqueue") {
      const result = await enqueueManualWarehouseSync({
        marketplaceAccountId,
        entities: body.entities,
        simulate: body.simulate,
        companyId: body.companyId,
        processNow: body.processQueue !== false,
      });
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === "cancel") {
      const result = await cancelWarehouseQueueJobs({
        marketplaceAccountId,
        jobId: body.jobId,
        simulate: body.simulate,
        companyId: body.companyId,
      });
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === "schedule") {
      if (!body.entity || !body.intervalMs) {
        return NextResponse.json(
          { error: "entity and intervalMs are required for schedule action" },
          { status: 400 }
        );
      }
      const result = await setWarehouseScheduleInterval({
        marketplaceAccountId,
        entity: body.entity,
        intervalMs: body.intervalMs,
        simulate: body.simulate,
        companyId: body.companyId,
      });
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === "schedule_enable") {
      if (!body.entity || typeof body.enabled !== "boolean") {
        return NextResponse.json(
          { error: "entity and enabled are required for schedule_enable" },
          { status: 400 }
        );
      }
      const result = await setWarehouseScheduleEnabled({
        marketplaceAccountId,
        entity: body.entity,
        enabled: body.enabled,
        simulate: body.simulate,
        companyId: body.companyId,
      });
      return NextResponse.json({ ok: true, action, result });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Warehouse ops failed" },
      { status: 500 }
    );
  }
}
