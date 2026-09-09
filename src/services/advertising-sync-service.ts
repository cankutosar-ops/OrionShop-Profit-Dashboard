/**
 * Advertising ingestion — Wildberries Promotion API → wb_ads warehouse.
 *
 * The Financial Engine deducts advertising as `Σ wb_ads.spend`; until this
 * existed the table was empty, so Net Profit was overstated by the entire real
 * ad spend. This kernel fills the table. It does not touch the engine.
 *
 * ARCHITECTURE
 * ------------
 * Ingestion only. Nothing here may be reachable from a page render — dashboards
 * and reports read wb_ads through persisted-query-service, never this module.
 * It runs from the sync worker or an explicit operator script, exactly like the
 * commercial/finance/inventory kernels.
 *
 * ACCOUNT ISOLATION
 * -----------------
 * Three independent guarantees, because advertising has historically been the
 * weakest-scoped table in the warehouse:
 *
 *   1. Credentials are resolved per account, so the API only ever returns that
 *      seller's campaigns.
 *   2. nmId is resolved to a product through a map built from THIS account's
 *      products only. An nmId belonging to another account resolves to nothing
 *      and is reported as unmatched, never guessed by supplier_article.
 *   3. Every persisted row carries marketplace_account_id, and batches with a
 *      mixed or missing account are rejected before they reach the database.
 *
 * IDEMPOTENCY
 * -----------
 * WB advertising statistics have no cursor and no document id, so a re-run
 * re-reads the same window. Rows key on `adv:{advertId}:{nmId}:{date}` and upsert
 * onto (marketplace_account_id, source_key), which makes repeated runs converge
 * instead of duplicating. Restating a day (WB does revise recent spend) updates
 * in place.
 *
 * RATE LIMIT
 * ----------
 * /adv/v3/fullstats allows 3 requests per minute. That is the binding cost of a
 * backfill, so the kernel paces explicitly and reports the request count.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { WbApiClient } from "@/lib/wildberries/api-client";
import {
  buildAdsSourceKey,
  chunk,
  flattenAdvertFullStats,
  splitDateWindows,
  type AdvertDailySpend,
} from "@/lib/wildberries/ads-mapper";
import {
  WB_ADVERT_FULLSTATS_INTERVAL_MS,
  WB_ADVERT_FULLSTATS_MAX_DAYS,
  WB_ADVERT_FULLSTATS_MAX_IDS,
} from "@/lib/wildberries/constants";
import { syncLog } from "@/lib/wildberries/sync-log";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";

const ADS_UPSERT_BATCH_SIZE = 500;

export type AdvertisingSyncResult = {
  marketplaceAccountId: string;
  from: string;
  to: string;
  /** Campaigns whose statistics WB will serve (status 7/9/11). */
  campaignsRetrievable: number;
  /** Campaigns WB will not serve statistics for (deleted) — spend unreachable. */
  campaignsUnretrievable: number;
  fullstatsRequests: number;
  rowsMapped: number;
  rowsPersisted: number;
  /** Rows whose nmId is not in this account's catalogue. Not persisted. */
  rowsUnmatched: number;
  spendPersisted: number;
  spendUnmatched: number;
  unmatchedNmIds: number[];
  errors: string[];
  durationMs: number;
};

export type AdvertisingSyncDeps = {
  createClient: () => WbApiClient;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * nmId → products.id for one account.
 *
 * Scoped with .eq("marketplace_account_id") so an nmId owned by another account
 * simply is not in the map. WB nmIds are globally unique per seller card, but
 * the schema does not enforce that, so the account predicate is the guarantee —
 * not the nmId's presumed uniqueness.
 */
type ProductRef = { id: string; supplierArticle: string | null };

async function loadProductIdByNmId(
  marketplaceAccountId: string,
  client: ReturnType<typeof createAdminClient>
): Promise<Map<number, ProductRef>> {
  const map = new Map<number, ProductRef>();
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("products")
      .select("id, nm_id, supplier_article")
      .eq("marketplace_account_id", marketplaceAccountId)
      .order("id", { ascending: true })
      .range(from, from + 999);

    if (error) throw new Error(`Failed to load products for ads mapping: ${error.message}`);
    if (!data?.length) break;

    for (const row of data as Array<{
      id: string | number;
      nm_id: number | null;
      supplier_article: string | null;
    }>) {
      if (row.nm_id != null) {
        map.set(Number(row.nm_id), {
          id: String(row.id),
          supplierArticle: row.supplier_article ?? null,
        });
      }
    }

    if (data.length < 1000) break;
    from += 1000;
  }

  return map;
}

/**
 * Ingest advertising spend for one account over [from, to].
 *
 * Used for both historical backfill and incremental sync — they differ only in
 * the window. There is no separate "recovery" engine because WB exposes no
 * cursor to recover against; re-reading a window is the recovery.
 */
export async function runAdvertisingSyncForAccount(
  marketplaceAccountId: string,
  options: {
    from: string;
    to: string;
    deps?: Partial<AdvertisingSyncDeps>;
    /** Stop starting new requests past this epoch ms (worker budget). */
    deadlineAt?: number;
  }
): Promise<AdvertisingSyncResult> {
  const startedAt = Date.now();
  const now = options.deps?.now ?? (() => Date.now());
  const sleep = options.deps?.sleep ?? defaultSleep;

  const result: AdvertisingSyncResult = {
    marketplaceAccountId,
    from: options.from,
    to: options.to,
    campaignsRetrievable: 0,
    campaignsUnretrievable: 0,
    fullstatsRequests: 0,
    rowsMapped: 0,
    rowsPersisted: 0,
    rowsUnmatched: 0,
    spendPersisted: 0,
    spendUnmatched: 0,
    unmatchedNmIds: [],
    errors: [],
    durationMs: 0,
  };

  const finish = () => {
    result.durationMs = Date.now() - startedAt;
    return result;
  };

  let client: WbApiClient;
  if (options.deps?.createClient) {
    client = options.deps.createClient();
  } else {
    const account = await getMarketplaceAccountForSync(marketplaceAccountId);
    if (account.marketplace !== "wildberries") {
      result.errors.push(`Advertising sync not implemented for marketplace: ${account.marketplace}`);
      return finish();
    }
    client = new WbApiClient(account.apiKey);
  }

  const supabase = createAdminClient();

  const productIdByNm = await loadProductIdByNmId(marketplaceAccountId, supabase);
  syncLog("wb-ads", "product map loaded", {
    marketplaceAccountId,
    products: productIdByNm.size,
  });

  const { retrievable, unretrievableCount } = await client.fetchAdvertCampaignIds();
  result.campaignsRetrievable = retrievable.length;
  result.campaignsUnretrievable = unretrievableCount;

  if (retrievable.length === 0) {
    syncLog("wb-ads", "no retrievable campaigns", { marketplaceAccountId });
    return finish();
  }

  const windows = splitDateWindows(options.from, options.to, WB_ADVERT_FULLSTATS_MAX_DAYS);
  const idBatches = chunk(retrievable, WB_ADVERT_FULLSTATS_MAX_IDS);
  const unmatched = new Set<number>();

  let lastRequestAt = 0;

  for (const window of windows) {
    for (const ids of idBatches) {
      if (options.deadlineAt != null && now() >= options.deadlineAt) {
        result.errors.push(
          `deadline reached before window ${window.from}..${window.to}; run again to continue`
        );
        return finish();
      }

      // /adv/v3/fullstats: 3 req/min. Pace before every call after the first.
      const sinceLast = now() - lastRequestAt;
      if (lastRequestAt !== 0 && sinceLast < WB_ADVERT_FULLSTATS_INTERVAL_MS) {
        await sleep(WB_ADVERT_FULLSTATS_INTERVAL_MS - sinceLast);
      }

      let items;
      try {
        items = await client.fetchAdvertFullStats(ids, window.from, window.to);
        result.fullstatsRequests += 1;
        lastRequestAt = now();
      } catch (err) {
        lastRequestAt = now();
        const message = err instanceof Error ? err.message : String(err);
        // Fail the window, not the run: other windows are independent, and the
        // upsert key makes a later retry of this window free of duplicates.
        result.errors.push(`fullstats ${window.from}..${window.to}: ${message}`);
        continue;
      }

      const { rows, skippedNoNmId } = flattenAdvertFullStats(items);
      if (skippedNoNmId > 0) {
        result.errors.push(
          `fullstats ${window.from}..${window.to}: ${skippedNoNmId} stat leaf/leaves had no nmId`
        );
      }
      result.rowsMapped += rows.length;

      const persistable = [];
      for (const row of rows) {
        const product = productIdByNm.get(row.nmId);
        if (!product) {
          // Not this account's product. Never fall back to supplier_article —
          // article strings can collide across accounts.
          result.rowsUnmatched += 1;
          result.spendUnmatched += row.spend;
          unmatched.add(row.nmId);
          continue;
        }
        persistable.push(toAdsUpsertRow(marketplaceAccountId, product, row));
      }

      const persisted = await batchUpsertAds(supabase, persistable, result.errors);
      result.rowsPersisted += persisted;
      result.spendPersisted += persistable
        .slice(0, persisted)
        .reduce((sum, r) => sum + r.spend, 0);
    }
  }

  result.unmatchedNmIds = [...unmatched];
  result.spendPersisted = Math.round(result.spendPersisted * 100) / 100;
  result.spendUnmatched = Math.round(result.spendUnmatched * 100) / 100;

  syncLog("wb-ads", "sync complete", {
    marketplaceAccountId,
    from: options.from,
    to: options.to,
    fullstatsRequests: result.fullstatsRequests,
    rowsPersisted: result.rowsPersisted,
    rowsUnmatched: result.rowsUnmatched,
    spendPersisted: result.spendPersisted,
    errors: result.errors.length,
  });

  return finish();
}

type AdsUpsertRow = {
  marketplace_account_id: string;
  product_id: string;
  supplier_article: string | null;
  nm_id: number;
  campaign_id: number;
  campaign_date: string;
  spend: number;
  clicks: number;
  impressions: number;
  source_key: string;
  updated_at: string;
};

function toAdsUpsertRow(
  marketplaceAccountId: string,
  product: ProductRef,
  row: AdvertDailySpend
): AdsUpsertRow {
  return {
    marketplace_account_id: marketplaceAccountId,
    product_id: product.id,
    // Denormalized for legacy readers that index ads by article. It is written
    // from the resolved product, so it can never carry another account's value.
    supplier_article: product.supplierArticle,
    nm_id: row.nmId,
    campaign_id: row.advertId,
    campaign_date: row.campaignDate,
    spend: row.spend,
    clicks: row.clicks,
    impressions: row.impressions,
    source_key: buildAdsSourceKey(row.advertId, row.nmId, row.campaignDate),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Idempotent batch upsert. Mirrors batchUpsertFinance: a batch that is missing a
 * source_key or mixes accounts is refused outright rather than written and
 * cleaned up afterwards.
 */
async function batchUpsertAds(
  supabase: ReturnType<typeof createAdminClient>,
  rows: AdsUpsertRow[],
  errors: string[]
): Promise<number> {
  let persisted = 0;

  for (let i = 0; i < rows.length; i += ADS_UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + ADS_UPSERT_BATCH_SIZE);
    const batchNum = Math.floor(i / ADS_UPSERT_BATCH_SIZE) + 1;

    const accountIds = new Set(batch.map((r) => String(r.marketplace_account_id)));
    if (accountIds.size !== 1 || accountIds.has("")) {
      errors.push(`wb_ads batch ${batchNum}: mixed or missing marketplace account id`);
      continue;
    }
    if (batch.some((r) => !r.source_key)) {
      errors.push(`wb_ads batch ${batchNum}: source_key is required for atomic persistence`);
      continue;
    }

    const { error } = await supabase.from("wb_ads").upsert(batch, {
      onConflict: "marketplace_account_id,source_key",
    });

    if (error) {
      errors.push(`wb_ads batch ${batchNum}: atomic upsert failed: ${error.message}`);
    } else {
      persisted += batch.length;
    }
  }

  return persisted;
}
