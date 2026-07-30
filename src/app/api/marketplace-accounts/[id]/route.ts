import { NextResponse } from "next/server";
import { getDefaultDateRange } from "@/lib/utils";
import { authorize, isAuthzFailure } from "@/lib/security/authorize";
import {
  deleteMarketplaceAccount,
  listCompanies,
  testMarketplaceAccountConnection,
  updateMarketplaceAccount,
} from "@/services/marketplace-account-service";
import {
  runBlockingDashboardSync,
  scheduleBackgroundDashboardSync,
  SyncAlreadyRunningError,
} from "@/services/sync-job-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const authz = await authorize(request, { marketplaceAccountId: id });
    if (isAuthzFailure(authz)) return authz;

    const companies = await listCompanies();
    for (const company of companies) {
      if (!authz.isInternalService && !authz.companyIds.includes(company.id)) {
        continue;
      }
      const account = company.accounts.find((row) => row.id === id);
      if (account) {
        return NextResponse.json({ account, companyId: company.id });
      }
    }
    return NextResponse.json({ error: "Marketplace account not found" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const authz = await authorize(request, { marketplaceAccountId: id });
    if (isAuthzFailure(authz)) return authz;

    const body = await request.json();
    const account = await updateMarketplaceAccount(id, body);
    return NextResponse.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const authz = await authorize(request, { marketplaceAccountId: id });
    if (isAuthzFailure(authz)) return authz;

    await deleteMarketplaceAccount(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const authz = await authorize(request, { marketplaceAccountId: id });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "test") {
      const result = await testMarketplaceAccountConnection(marketplaceAccountId);
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "sync") {
      const body = await request.json().catch(() => ({}));
      const range = getDefaultDateRange();
      const dateFrom = (body as { dateFrom?: string }).dateFrom ?? range.from;
      const dateTo = (body as { dateTo?: string }).dateTo ?? range.to;
      const entities =
        (body as { entities?: string[] }).entities ??
        (["products", "orders", "sales", "finance", "stock"] as const);
      const blocking = (body as { blocking?: boolean }).blocking ?? false;

      const syncRequest = {
        marketplaceAccountId,
        dateFrom,
        dateTo,
        entities: entities as ("products" | "orders" | "sales" | "finance" | "stock")[],
      };

      if (blocking) {
        const result = await runBlockingDashboardSync(syncRequest);
        return NextResponse.json({
          success: result.success,
          lastSyncStatus: result.lastSyncStatus,
          results: result.results,
          timing: result.timing,
          mode: "blocking",
        });
      }

      const scheduled = await scheduleBackgroundDashboardSync(syncRequest);
      return NextResponse.json(
        {
          accepted: true,
          mode: "background",
          requestId: scheduled.requestId,
          marketplaceAccountId,
          lastSyncStatus: "running",
          statusUrl: `/api/sync/status?marketplaceAccountId=${marketplaceAccountId}`,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof SyncAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Marketplace account action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
