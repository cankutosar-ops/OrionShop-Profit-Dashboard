export const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
export const WB_CONTENT_API = "https://content-api.wildberries.ru";
export const WB_FINANCE_API = "https://finance-api.wildberries.ru";
/** FBW inbound supplies (warehouse shipments) — Requires Supplies token category. */
export const WB_SUPPLIES_API = "https://supplies-api.wildberries.ru";
/** Seller Analytics — stocks report, STOCK_HISTORY_DAILY_CSV, etc. Requires Analytics token. */
export const WB_SELLER_ANALYTICS_API = "https://seller-analytics-api.wildberries.ru";
/** Advertising campaigns and spend statistics — Requires Promotion token category. */
export const WB_ADVERT_API = "https://advert-api.wildberries.ru";

export const WB_RATE_LIMIT_MS = 2000;
/** Extra pause between finance report pagination pages (429-prone). */
export const WB_FINANCE_PAGE_DELAY_MS = 5000;
/** Max retries on HTTP 429 before failing. */
export const WB_RATE_LIMIT_MAX_RETRIES = 20;

// --- Advertising (Promotion) documented limits -------------------------------
// Source: dev.wildberries.ru/api/swagger/yaml/ru/08-promotion.yaml
//
// GET /adv/v3/fullstats  — 3 requests/min, 20s interval, burst 1.
// GET /adv/v1/promotion/count — 300 requests/min.
//
// The generic WB_RATE_LIMIT_MS (2s) pacing is an order of magnitude too fast for
// fullstats, so ads ingestion paces that endpoint explicitly.
/** Minimum gap between /adv/v3/fullstats calls (20s documented + 1s safety). */
export const WB_ADVERT_FULLSTATS_INTERVAL_MS = 21_000;
/** Max campaign ids accepted by /adv/v3/fullstats in one request. */
export const WB_ADVERT_FULLSTATS_MAX_IDS = 50;
/** Max days spanned by a single /adv/v3/fullstats request. */
export const WB_ADVERT_FULLSTATS_MAX_DAYS = 31;
/**
 * Campaign statuses /adv/v3/fullstats will serve: 7 finished, 9 active, 11 paused.
 * Deleted campaigns (-1) return no statistics and are unrecoverable.
 */
export const WB_ADVERT_FULLSTATS_STATUSES = [7, 9, 11] as const;
