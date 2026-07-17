import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  DEFAULT_TAX_PERCENT,
  DEFAULT_USD_EXCHANGE_RATE,
  SMART_PRICING_UI_SETTINGS_STORAGE_KEY,
  SMART_PRICING_USD_RATE_STORAGE_KEY,
} from "@/lib/smart-pricing-constants";

export type SmartPricingUiSettings = {
  targetMarginPercent: number;
  marketingPercent: number;
  taxPercent: number;
  usdExchangeRate: number;
};

export const DEFAULT_SMART_PRICING_UI_SETTINGS: SmartPricingUiSettings = {
  targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
  marketingPercent: DEFAULT_MARKETING_PERCENT,
  taxPercent: DEFAULT_TAX_PERCENT,
  usdExchangeRate: DEFAULT_USD_EXCHANGE_RATE,
};

function clampPositive(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function clampPositiveNonZero(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Load persisted Smart Pricing UI settings (restored automatically). */
export function loadSmartPricingUiSettings(): SmartPricingUiSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SMART_PRICING_UI_SETTINGS };

  try {
    const raw = window.localStorage.getItem(SMART_PRICING_UI_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SmartPricingUiSettings>;
      return {
        targetMarginPercent: clampPositiveNonZero(
          parsed.targetMarginPercent,
          DEFAULT_TARGET_MARGIN_PERCENT
        ),
        marketingPercent: clampPositive(parsed.marketingPercent, DEFAULT_MARKETING_PERCENT),
        taxPercent: clampPositive(parsed.taxPercent, DEFAULT_TAX_PERCENT),
        usdExchangeRate: clampPositiveNonZero(
          parsed.usdExchangeRate,
          DEFAULT_USD_EXCHANGE_RATE
        ),
      };
    }

    // Migrate legacy USD-only key if present.
    const legacyUsd = window.localStorage.getItem(SMART_PRICING_USD_RATE_STORAGE_KEY);
    if (legacyUsd) {
      return {
        ...DEFAULT_SMART_PRICING_UI_SETTINGS,
        usdExchangeRate: clampPositiveNonZero(legacyUsd, DEFAULT_USD_EXCHANGE_RATE),
      };
    }
  } catch {
    // ignore
  }

  return { ...DEFAULT_SMART_PRICING_UI_SETTINGS };
}

/** Persist Smart Pricing UI settings for automatic restore. */
export function saveSmartPricingUiSettings(settings: SmartPricingUiSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SMART_PRICING_UI_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        targetMarginPercent: settings.targetMarginPercent,
        marketingPercent: settings.marketingPercent,
        taxPercent: settings.taxPercent,
        usdExchangeRate: settings.usdExchangeRate,
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Use loadSmartPricingUiSettings */
export function loadSmartPricingUsdExchangeRate(): number {
  return loadSmartPricingUiSettings().usdExchangeRate;
}

/** @deprecated Use saveSmartPricingUiSettings */
export function saveSmartPricingUsdExchangeRate(rate: number): void {
  const current = loadSmartPricingUiSettings();
  saveSmartPricingUiSettings({ ...current, usdExchangeRate: rate });
}
