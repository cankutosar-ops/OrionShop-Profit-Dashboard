export const SMART_PRICING_MARGIN_PRESETS = [15, 20] as const;

export const DEFAULT_TARGET_MARGIN_PERCENT = 15;
export const DEFAULT_MARKETING_PERCENT = 5;
/** Tax on seller payout (forPay). Display/solver lever — not part of core Model B engine. */
export const DEFAULT_TAX_PERCENT = 6;

/** Display-only default USD/RUB rate — never used in pricing math. */
export const DEFAULT_USD_EXCHANGE_RATE = 90;

export const SMART_PRICING_UI_SETTINGS_STORAGE_KEY =
  "orionshop.smart-pricing.ui-settings";

/** @deprecated Use SMART_PRICING_UI_SETTINGS_STORAGE_KEY */
export const SMART_PRICING_USD_RATE_STORAGE_KEY =
  "orionshop.smart-pricing.usd-exchange-rate";
