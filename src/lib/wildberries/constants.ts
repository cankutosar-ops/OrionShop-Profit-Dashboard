export const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
export const WB_CONTENT_API = "https://content-api.wildberries.ru";
export const WB_FINANCE_API = "https://finance-api.wildberries.ru";
/** FBW inbound supplies (warehouse shipments) — Requires Supplies token category. */
export const WB_SUPPLIES_API = "https://supplies-api.wildberries.ru";
/** Seller Analytics — stocks report, STOCK_HISTORY_DAILY_CSV, etc. Requires Analytics token. */
export const WB_SELLER_ANALYTICS_API = "https://seller-analytics-api.wildberries.ru";

export const WB_RATE_LIMIT_MS = 2000;
/** Extra pause between finance report pagination pages (429-prone). */
export const WB_FINANCE_PAGE_DELAY_MS = 5000;
/** Max retries on HTTP 429 before failing. */
export const WB_RATE_LIMIT_MAX_RETRIES = 20;
