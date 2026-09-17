import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import {
  getAccountCommercialFreshness,
  listEligibleCommercialAccounts,
  resolveCommercialSyncIntervalMinutes,
} from "@/services/commercial-continuity-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdministrationRole } from "@/lib/security/admin-authorization";
import { authForbiddenResponse } from "@/lib/security/authorize";
import {
  isAuthFailure,
  isInternalServiceRequest,
  requireAuth,
} from "@/lib/security/require-auth";
import { lookupMarketplaceAccount } from "@/lib/security/tenant-membership";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync/commercial-continuity/status?marketplaceAccountId=
 * Read-only commercial freshness / execution state for Monitoring & Administration.
 */
export async function GET(request: Request) {
  const user = await requireAuth(request);
  if (isAuthFailure(user)) return user;
  const privileged = isInternalServiceRequest(request) || hasAdministrationRole(user);
  let accountId: string | null;
  let allowedAccountIds: string[] | undefined;
  if (privileged) {
    const claimed = new URL(request.url).searchParams.get("marketplaceAccountId");
    if (claimed !== null && !claimed.trim()) {
      return NextResponse.json({ error: "Invalid marketplaceAccountId" }, { status: 400 });
    }
    accountId = claimed?.trim() ?? null;
    if (accountId && !(await lookupMarketplaceAccount(accountId))) {
      return authForbiddenResponse("Marketplace account not found or not permitted.", "AUTHZ_ACCOUNT_FORBIDDEN");
    }
  } else {
    const authz = await authorizeRequestScope(request, {
      requireMarketplaceAccount: false,
      allowDefaultAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;
    accountId = authz.marketplaceAccountId;
    allowedAccountIds = authz.marketplaceAccountIds;
  }

  const intervalMinutes = await resolveCommercialSyncIntervalMinutes();
  const eligible = await listEligibleCommercialAccounts(allowedAccountIds);

  let lastTick = null;
  if (privileged) {
    const sb = createAdminClient();
    const { data } = await sb
      .from("commercial_sync_ticks")
      .select("id,trigger,started_at,finished_at,accounts_considered,accounts_synced,accounts_failed,error")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastTick = data;
  }

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
