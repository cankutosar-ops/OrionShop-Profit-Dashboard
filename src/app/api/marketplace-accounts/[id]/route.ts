import { NextResponse } from "next/server";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { getDefaultDateRange } from "@/lib/utils";
import {
  deleteMarketplaceAccount,
  listCompanies,
  markAccountSyncFinished,
  markAccountSyncStarted,
  testMarketplaceAccountConnection,
  updateMarketplaceAccount,
} from "@/services/marketplace-account-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const companies = await listCompanies();
    for (const company of companies) {
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
    const body = await request.json();
    const account = await updateMarketplaceAccount(id, body);
    return NextResponse.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update marketplace account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
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
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "test") {
      const result = await testMarketplaceAccountConnection(id);
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

      await markAccountSyncStarted(id);

      try {
        const syncService = await createWbSyncService(id);
        const results = await syncService.syncAll({
          marketplaceAccountId: id,
          dateFrom,
          dateTo,
          entities: entities as ("products" | "orders" | "sales" | "finance" | "stock")[],
        });

        const hasErrors = results.some((r) => r.errors.length > 0);
        const status = hasErrors ? "partial" : "success";
        await markAccountSyncFinished(id, status);

        return NextResponse.json({ success: !hasErrors, lastSyncStatus: status, results });
      } catch (syncError) {
        await markAccountSyncFinished(id, "failed").catch(() => undefined);
        throw syncError;
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marketplace account action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
