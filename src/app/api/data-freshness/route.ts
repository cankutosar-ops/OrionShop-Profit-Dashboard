import { NextResponse } from "next/server";
import { authorizeRequestScope, isAuthzFailure } from "@/lib/security/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Authorized account only. DB reads only; no sync status helpers or marketplace calls. */
export async function GET(request: Request) {
  const authz = await authorizeRequestScope(request, { requireMarketplaceAccount: true });
  if (isAuthzFailure(authz)) return authz;
  const account = authz.marketplaceAccountId!;
  try {
    // Incremental state is service-only. Expose only sanitized freshness fields,
    // after account authorization, and scope every query to that same account.
    const client = createAdminClient();
    const sources = [ ["sales", "wb_sales", "sale_date"], ["orders", "wb_orders", "order_date"],
      ["finance", "wb_finance", "operation_date"], ["ads", "wb_ads", "campaign_date"],
      ["inventory", "historical_inventory_snapshots", "snapshot_date"] ] as const;
    const dates = Object.fromEntries(await Promise.all(sources.map(async ([name, table, column]) => {
      const result = await client.from(table).select(column).eq("marketplace_account_id", Number(account))
        .order(column, { ascending: false, nullsFirst: false }).limit(1);
      if (result.error) throw result.error;
      const row = result.data[0] as unknown as Record<string, string> | undefined;
      return [name, row?.[column] ?? null];
    })));
    const state = await client.from("finance_incremental_sync_state")
      .select("last_error,active_week_from,active_week_to,week_status").eq("marketplace_account_id", account).maybeSingle();
    if (state.error) throw state.error;
    const sync = await client.from("marketplace_accounts").select("last_successful_sync_at").eq("id", account).maybeSingle();
    if (sync.error) throw sync.error;
    const finance = state.data ? { ...state.data, last_error: state.data.last_error?.startsWith("awaiting_publication") ? "awaiting_publication" : null } : null;
    return NextResponse.json({ dates, finance, lastSuccessfulSync: sync.data?.last_successful_sync_at ?? null },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Freshness could not be verified" }, { status: 503 });
  }
}
