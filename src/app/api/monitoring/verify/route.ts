import { NextResponse } from "next/server";
import { runPostSyncVerification } from "@/services/sync-verification-audit-service";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";

export const dynamic = "force-dynamic";

/**
 * Sprint 9.5 — manual verification run (diagnostics).
 * Read-only evaluation + immutable snapshot insert. Does not sync marketplace data.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      marketplaceAccountId?: string;
      syncStatus?: string;
    };
    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const row = await runPostSyncVerification({
      marketplaceAccountId: authz.marketplaceAccountId!,
      syncStatus: body.syncStatus ?? "manual",
      syncRequestId: `manual-${Date.now()}`,
    });

    return NextResponse.json({ ok: true, report: row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
