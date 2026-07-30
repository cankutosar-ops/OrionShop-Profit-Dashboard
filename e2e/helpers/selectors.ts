/**
 * e2e/helpers/selectors.ts
 *
 * Canonical UI selectors for the OrionShop Profit Dashboard.
 *
 * Centralise every selector string here so that a markup change only requires
 * a single edit to fix multiple tests.
 *
 * Prefer:
 *  - role / aria-label (most resilient)
 *  - data-testid (zero-cost attribute, add when aria is ambiguous)
 *  - Text content (last resort, language-dependent)
 */

// -------------------------------------------------------------------------
// Layout
// -------------------------------------------------------------------------
/** Primary nav sidebar */
export const SIDEBAR = "nav";

// -------------------------------------------------------------------------
// Dashboard header controls
// -------------------------------------------------------------------------

/** "Sync Wildberries" button — text-matched because it carries no aria-label */
export const SYNC_BUTTON_TEXT = "Sync Wildberries";

/** Verification panel trigger button */
export const VERIFICATION_BUTTON_TEXT = "Verification";

/** Verification dialog — matches role="dialog" aria-label */
export const VERIFICATION_DIALOG_LABEL = "Sync verification";

/** Close button inside any header popup */
export const POPUP_CLOSE_ARIA = '[aria-label="Close"]';

// -------------------------------------------------------------------------
// Dashboard KPI cards
// -------------------------------------------------------------------------

/**
 * MetricCard title for Orders Value (Wildberries KPIs section).
 * The card renders its title in an <h3> (or similar heading).
 * We match by visible text.
 */
export const ORDERS_VALUE_CARD_TITLE = "Orders Value";

// -------------------------------------------------------------------------
// Sidebar nav labels (exact text)
// -------------------------------------------------------------------------
export const NAV = {
  dashboard: "Dashboard",
  productAnalytics: "Product Analytics",
  inventory: "Inventory",
  warehouseSales: "Warehouse Sales",
} as const;
