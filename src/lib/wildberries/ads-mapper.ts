/**
 * Wildberries advertising → wb_ads row mapping.
 *
 * GET /adv/v3/fullstats returns spend as a four-level tree:
 *
 *   campaign (advertId)
 *     └── days[]      one calendar day
 *           └── apps[]    platform split (1 site / 32 Android / 64 iOS)
 *                 └── nms[]   per-SKU leaf, `sum` = spend in RUBLES
 *
 * The warehouse stores one row per (account, campaign, product, day), so the
 * platform level is summed away. Platform is not modelled because nothing in the
 * Financial Engine distinguishes it — advertising enters P&L as a single scalar.
 *
 * Spend is rubles throughout. WB sends decimal rubles in `sum` and `wb_ads.spend`
 * is NUMERIC(12,2) in rubles, so there is no unit conversion anywhere. Do not add
 * one: the engine adds this straight to logistics/storage ruble amounts.
 */

import type { WbApiAdvertFullStatsItem } from "./types";

/** One warehouse-shaped advertising fact, before product resolution. */
export type AdvertDailySpend = {
  advertId: number;
  nmId: number;
  /** YYYY-MM-DD */
  campaignDate: string;
  /** Rubles. */
  spend: number;
  clicks: number;
  impressions: number;
  sourceKey: string;
};

/**
 * Idempotency key for an advertising fact.
 *
 * WB has no cursor or document id for statistics, so the key is the natural
 * composite: one campaign, one product, one day. Re-running any window produces
 * byte-identical keys, which is what makes the upsert safe to repeat.
 */
export function buildAdsSourceKey(advertId: number, nmId: number, campaignDate: string): string {
  return `adv:${advertId}:${nmId}:${campaignDate}`;
}

/**
 * WB sends `"2026-01-14T00:00:00Z"` and sometimes an offset form
 * `"2026-01-14T00:00:00+03:00"`. Both already express the campaign day in WB's
 * own calendar, so take the leading date and never re-project through a
 * timezone — doing so would shift spend into the neighbouring day.
 */
function toCampaignDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const date = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Flatten fullstats into deduplicated per-(campaign, product, day) rows.
 *
 * Rows with no nmId are dropped: they cannot be attributed to a product, and
 * `fetchAdsInRange` plus the wb_ads RLS policy both exclude unattributed rows,
 * so persisting them would create spend that is invisible to P&L. The caller
 * reports what was dropped rather than letting it disappear silently.
 */
export function flattenAdvertFullStats(items: WbApiAdvertFullStatsItem[]): {
  rows: AdvertDailySpend[];
  skippedNoNmId: number;
  skippedNoDate: number;
} {
  const byKey = new Map<string, AdvertDailySpend>();
  let skippedNoNmId = 0;
  let skippedNoDate = 0;

  for (const campaign of items) {
    const advertId = campaign.advertId;
    if (typeof advertId !== "number") continue;

    for (const day of campaign.days ?? []) {
      const campaignDate = toCampaignDate(day.date);
      if (!campaignDate) {
        skippedNoDate += 1;
        continue;
      }

      for (const app of day.apps ?? []) {
        for (const nm of app.nms ?? []) {
          if (typeof nm.nmId !== "number") {
            skippedNoNmId += 1;
            continue;
          }

          const sourceKey = buildAdsSourceKey(advertId, nm.nmId, campaignDate);
          const existing = byKey.get(sourceKey);

          if (existing) {
            // Same campaign/product/day seen on another platform — sum it in.
            existing.spend += nm.sum ?? 0;
            existing.clicks += nm.clicks ?? 0;
            existing.impressions += nm.views ?? 0;
          } else {
            byKey.set(sourceKey, {
              advertId,
              nmId: nm.nmId,
              campaignDate,
              spend: nm.sum ?? 0,
              clicks: nm.clicks ?? 0,
              impressions: nm.views ?? 0,
              sourceKey,
            });
          }
        }
      }
    }
  }

  // Round once at the end: wb_ads.spend is NUMERIC(12,2) and summing platform
  // floats first avoids compounding rounding across three or four platforms.
  const rows = [...byKey.values()].map((row) => ({
    ...row,
    spend: Math.round(row.spend * 100) / 100,
  }));

  return { rows, skippedNoNmId, skippedNoDate };
}

/** Inclusive [from, to] windows of at most `maxDays`, ascending. */
export function splitDateWindows(from: string, to: string, maxDays: number): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  let cursor = Date.parse(`${from}T00:00:00Z`);

  if (!Number.isFinite(cursor) || !Number.isFinite(end) || cursor > end) return windows;

  while (cursor <= end) {
    const windowEnd = Math.min(cursor + (maxDays - 1) * 86_400_000, end);
    windows.push({
      from: new Date(cursor).toISOString().slice(0, 10),
      to: new Date(windowEnd).toISOString().slice(0, 10),
    });
    cursor = windowEnd + 86_400_000;
  }

  return windows;
}

/** Fixed-size batches, preserving order. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
