import { NextResponse } from "next/server";
import { runSyncVerification } from "@/services/sync-verification-service";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

/**
 * Sprint 9.1 — Sync Verification Layer (read-only).
 * Does not start, stop, retry, or modify sync.
 */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;

  const marketplaceAccountId = authz.marketplaceAccountId!;

  try {
    const report = await runSyncVerification(marketplaceAccountId);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
