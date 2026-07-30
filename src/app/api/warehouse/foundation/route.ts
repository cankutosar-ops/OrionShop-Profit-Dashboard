import { NextResponse } from "next/server";
import { isWarehouseEntity } from "@/lib/historical-warehouse/types";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getWarehouseFoundationStatus,
  initializeWarehouseFoundationForAccount,
  runWarehouseEntityHistoricalBackfill,
} from "@/services/historical-warehouse-orchestrator";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/warehouse/foundation?marketplaceAccountId=
 * Warehouse foundation status (entity matrix + recent import audits).
 *
 * POST { marketplaceAccountId, entity?, action: "init" | "backfill" }
 * Run historical backfill for an entity (default inventory) or init rows.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;

  try {
    const status = await getWarehouseFoundationStatus(marketplaceAccountId);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load warehouse status" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      entity?: string;
      action?: "init" | "backfill";
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const action = body.action ?? "backfill";

    if (action === "init") {
      await initializeWarehouseFoundationForAccount(marketplaceAccountId);
      const status = await getWarehouseFoundationStatus(marketplaceAccountId);
      return NextResponse.json({ ok: true, action: "init", status });
    }

    const entityRaw = body.entity ?? "inventory";
    if (!isWarehouseEntity(entityRaw)) {
      return NextResponse.json({ error: `Invalid entity: ${entityRaw}` }, { status: 400 });
    }

    const result = await runWarehouseEntityHistoricalBackfill({
      marketplaceAccountId,
      entity: entityRaw,
      trigger: "manual",
    });

    const status = await getWarehouseFoundationStatus(marketplaceAccountId);
    return NextResponse.json({ ok: result.status !== "failed", result, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Warehouse backfill failed" },
      { status: 500 }
    );
  }
}
