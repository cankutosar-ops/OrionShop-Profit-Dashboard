import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getAccountCommercialFreshness,
  listEligibleCommercialAccounts,
  resolveCommercialSyncIntervalMinutes,
} from "@/services/commercial-continuity-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/commercial-continuity/status?marketplaceAccountId=
 * Read-only commercial freshness / execution state for Monitoring & Administration.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, {
    requireMarketplaceAccount: false,
    allowDefaultAccount: true,
  });
  if (isAuthzFailure(authz)) return authz;

  const url = new URL(request.url);
  const accountId =
    url.searchParams.get("marketplaceAccountId") ?? authz.marketplaceAccountId ?? null;

  const intervalMinutes = await resolveCommercialSyncIntervalMinutes();
  const eligible = await listEligibleCommercialAccounts();

  const sb = createAdminClient();
  const { data: lastTick } = await sb
    .from("commercial_sync_ticks")
    .select("id,trigger,started_at,finished_at,accounts_considered,accounts_synced,accounts_failed,error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!accountId) {
    return NextResponse.json({
      intervalMinutes,
      eligibleAccounts: eligible.map((a) => ({ id: a.id, name: a.account_name })),
      lastTick: lastTick ?? null,
      entities: null,
    });
  }

  const entities = await getAccountCommercialFreshness(accountId);
  return NextResponse.json({
    marketplaceAccountId: accountId,
    intervalMinutes,
    eligibleAccounts: eligible.map((a) => ({ id: a.id, name: a.account_name })),
    lastTick: lastTick ?? null,
    entities,
  });
}
