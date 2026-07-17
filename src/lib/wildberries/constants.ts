export const WB_STATISTICS_API = "https://statistics-api.wildberries.ru";
export const WB_CONTENT_API = "https://content-api.wildberries.ru";
export const WB_FINANCE_API = "https://finance-api.wildberries.ru";

export const WB_RATE_LIMIT_MS = 2000;
/** Extra pause between finance report pagination pages (429-prone). */
export const WB_FINANCE_PAGE_DELAY_MS = 5000;
/** Max retries on HTTP 429 before failing. */
export const WB_RATE_LIMIT_MAX_RETRIES = 20;
