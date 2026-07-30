import { NextResponse } from "next/server";
import { runFinanceHistoryBackfill } from "@/lib/wildberries/finance-history-backfill";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { syncLog } from "@/lib/wildberries/sync-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import type { WbFinance } from "@/types/database";

export const maxDuration = 300;

/**
 * POST /api/sync/finance-backfill
 * Paginate finance history from year-start (or dateFrom) through dateTo.
 * Body: { marketplaceAccountId?, dateFrom?, dateTo?, strategy?: "monthly" | "rolling30" | "single" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      dateFrom,
      dateTo,
      strategy = "monthly",
    } = body as {
      marketplaceAccountId?: string;
      dateFrom?: string;
      dateTo?: string;
      strategy?: "monthly" | "rolling30" | "single";
    };

    const authz = await authorizeRequestScope(request, {
      body,
      requireMarketplaceAccount: true,
      allowDefaultAccount: true,
    });
    if (isAuthzFailure(authz)) return authz;

    const marketplaceAccountId = authz.marketplaceAccountId!;
    const endDate = dateTo ?? new Date().toISOString().slice(0, 10);
    const year = endDate.slice(0, 4);
    const startDate = dateFrom ?? `${year}-01-01`;

    syncLog("finance-backfill-route", "START", {
      marketplaceAccountId,
      dateFrom: startDate,
      dateTo: endDate,
      strategy,
    });

    const syncService = await createWbSyncService(marketplaceAccountId);
    const supabase = createAdminClient();

    async function fetchFinanceInRange(from: string, to: string): Promise<WbFinance[]> {
      const rows: WbFinance[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from("wb_finance")
          .select("*")
          .eq("marketplace_account_id", marketplaceAccountId)
          .gte("operation_date", from)
          .lte("operation_date", to)
          .range(offset, offset + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as WbFinance[]));
        if ((data ?? []).length < 1000) break;
        offset += 1000;
      }
      return rows;
    }

    const result = await runFinanceHistoryBackfill(syncService, {
      from: startDate,
      to: endDate,
      strategy,
      fetchFinanceInRange,
    });

    syncLog("finance-backfill-route", "END", {
      completed: result.completed,
      totalApiRows: result.totalApiRows,
      totalForPayLinesAdded: result.totalForPayLinesAdded,
    });

    return NextResponse.json({
      success: result.completed,
      marketplaceAccountId,
      dateFrom: startDate,
      dateTo: endDate,
      strategy,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finance backfill failed";
    syncLog("finance-backfill-route", "FAILED", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const authz = await authorize(request);
  if (isAuthzFailure(authz)) return authz;
  return NextResponse.json({
    status: "ready",
    message:
      "POST with optional dateFrom, dateTo, strategy (monthly|rolling30|single) to backfill finance history.",
    defaultFrom: "YYYY-01-01",
    defaultStrategy: "monthly",
  });
}
