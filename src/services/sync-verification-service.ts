import { createServerClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/wildberries/mappers";
import { attachSummary, buildOverallStatus } from "@/lib/sync-verification/format-summary";
import { VERIFICATION_LAG_WARN_DAYS } from "@/lib/sync-verification/thresholds";
import type {
  SourceVerification,
  SourceVerificationStatus,
  SyncVerificationReport,
  VerificationSourceId,
} from "@/lib/sync-verification/types";
import { getMarketplaceAccountSyncState } from "@/services/marketplace-account-service";

type DateExtent = {
  earliestDate: string | null;
  latestDate: string | null;
  recordCount: number;
};

function toCalendarDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return toDateString(value.includes("T") ? value : `${value}T00:00:00.000Z`);
}

function todayCalendarDate(): string {
  return toDateString(new Date().toISOString());
}

function daysBehind(latestDate: string | null, expectedAsOf: string): number | null {
  if (!latestDate) return null;
  const latest = Date.parse(`${latestDate}T00:00:00.000Z`);
  const expected = Date.parse(`${expectedAsOf}T00:00:00.000Z`);
  if (Number.isNaN(latest) || Number.isNaN(expected)) return null;
  return Math.max(0, Math.round((expected - latest) / 86_400_000));
}

async function readDateExtent(
  table: "wb_orders" | "wb_sales" | "wb_finance" | "wb_stock",
  dateColumn: "order_date" | "sale_date" | "operation_date" | "last_synced_at",
  marketplaceAccountId: string
): Promise<DateExtent> {
  const client = await createServerClient();
  const base = () =>
    client.from(table).select(dateColumn).eq("marketplace_account_id", marketplaceAccountId);

  const [{ data: minRow }, { data: maxRow }, { count }] = await Promise.all([
    base().order(dateColumn, { ascending: true }).limit(1),
    base().order(dateColumn, { ascending: false }).limit(1),
    client
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
  ]);

  const minRaw = (minRow?.[0] as Record<string, string | null> | undefined)?.[dateColumn] ?? null;
  const maxRaw = (maxRow?.[0] as Record<string, string | null> | undefined)?.[dateColumn] ?? null;

  return {
    earliestDate: toCalendarDate(minRaw),
    latestDate: toCalendarDate(maxRaw),
    recordCount: count ?? 0,
  };
}

function evaluateSource(input: {
  source: VerificationSourceId;
  label: string;
  extent: DateExtent;
  lastSyncAt: string | null;
  expectedAsOf: string;
  warnDays: number;
}): SourceVerification {
  const { source, label, extent, lastSyncAt, expectedAsOf, warnDays } = input;
  const behind = daysBehind(extent.latestDate, expectedAsOf);

  let status: SourceVerificationStatus = "healthy";
  let warning: string | null = null;

  if (extent.recordCount === 0 || !extent.latestDate) {
    status = "empty";
    warning = "No records in database.";
  } else if (behind != null && behind > warnDays) {
    status = "warning";
    warning = `Latest data is ${behind} days behind expected.`;
  }

  return {
    source,
    label,
    earliestDate: extent.earliestDate,
    latestDate: extent.latestDate,
    recordCount: extent.recordCount,
    lastSyncAt,
    daysBehindExpected: behind,
    status,
    warning,
  };
}

/**
 * Read-only verification pass over persisted marketplace data.
 * Never writes. Never triggers sync. Never retries.
 */
export async function runSyncVerification(
  marketplaceAccountId: string
): Promise<SyncVerificationReport> {
  const expectedAsOf = todayCalendarDate();
  const verifiedAt = new Date().toISOString();

  const [account, orders, sales, finance, inventory] = await Promise.all([
    getMarketplaceAccountSyncState(marketplaceAccountId),
    readDateExtent("wb_orders", "order_date", marketplaceAccountId),
    readDateExtent("wb_sales", "sale_date", marketplaceAccountId),
    readDateExtent("wb_finance", "operation_date", marketplaceAccountId),
    readDateExtent("wb_stock", "last_synced_at", marketplaceAccountId),
  ]);

  if (!account) {
    throw new Error(`Marketplace account not found: ${marketplaceAccountId}`);
  }

  const lastSyncAt = account.last_sync_at;
  const lastSuccessfulSyncAt = account.last_successful_sync_at;

  const sources: SourceVerification[] = [
    evaluateSource({
      source: "orders",
      label: "Orders",
      extent: orders,
      lastSyncAt,
      expectedAsOf,
      warnDays: VERIFICATION_LAG_WARN_DAYS.orders,
    }),
    evaluateSource({
      source: "sales",
      label: "Sales",
      extent: sales,
      lastSyncAt,
      expectedAsOf,
      warnDays: VERIFICATION_LAG_WARN_DAYS.sales,
    }),
    evaluateSource({
      source: "finance",
      label: "Finance",
      extent: finance,
      lastSyncAt,
      expectedAsOf,
      warnDays: VERIFICATION_LAG_WARN_DAYS.finance,
    }),
    evaluateSource({
      source: "inventory",
      label: "Inventory",
      extent: inventory,
      lastSyncAt,
      expectedAsOf,
      warnDays: VERIFICATION_LAG_WARN_DAYS.inventory,
    }),
  ];

  const overall = buildOverallStatus(sources);

  return attachSummary({
    marketplaceAccountId,
    expectedAsOf,
    verifiedAt,
    lastSyncAt,
    lastSuccessfulSyncAt,
    sources,
    overall,
  });
}
