/**
 * Research-only: Smart Pricing fixed vs adaptive dual-window validation.
 * Does not modify production Smart Pricing. Run:
 *   npx tsx scripts/_tmp_smart_pricing_dual_window_validation.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        process.env[trimmed.slice(0, idx).trim()] ??= trimmed.slice(idx + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

const PERIODS = [14, 30, 60, 90, 180];
const TARGET_MARGIN = 15;
const MARKETING = 5;
const TAX = 6;
const COST_WINDOW = 90; // stable cost basis for adaptive sim
const PERF_WINDOW = 14; // recent ASP / live margin
const SIGNIFICANT_PCT = 3;

const { buildInclusiveDateRange } = await import("../src/lib/utils.ts");
const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const {
  buildSmartPricingRow,
  solveRecommendedPrice,
  buildModelBUnitMetrics,
} = await import("../src/lib/smart-pricing.ts");
const {
  applySmartPricingCommissionSettings,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
} = await import("../src/lib/smart-pricing-settings.ts");

function round(n, d = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  const f = 10 ** d;
  return Math.round(Number(n) * f) / f;
}

function pctChange(a, b) {
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

function confidence(sampleSize, source) {
  if (source === "PRODUCT_HISTORY") {
    if (sampleSize >= 100) return "high";
    if (sampleSize >= 20) return "medium";
    return "low";
  }
  if (source === "CATEGORY_HISTORY") {
    if (sampleSize >= 200) return "medium-high";
    if (sampleSize >= 50) return "medium";
    return "low";
  }
  return "low";
}

function volumeTier(units90) {
  if (units90 >= 100) return "high";
  if (units90 >= 20) return "medium";
  return "low";
}

function detectRegime(weeklyAsps) {
  if (!weeklyAsps || weeklyAsps.length < 3) return null;
  const vals = weeklyAsps.filter((x) => x != null && x > 0);
  if (vals.length < 3) return null;
  const first = vals.slice(0, Math.ceil(vals.length / 3));
  const last = vals.slice(-Math.ceil(vals.length / 3));
  const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const a0 = avg(first);
  const a1 = avg(last);
  const ch = pctChange(a0, a1);
  if (ch == null) return null;
  if (ch >= 15) return { type: "price_increase", changePct: round(ch, 1), from: round(a0), to: round(a1) };
  if (ch <= -15) return { type: "price_decrease", changePct: round(ch, 1), from: round(a0), to: round(a1) };
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (max > 0 && (max - min) / max >= 0.25) {
    return { type: "trend_shift", changePct: round(((max - min) / max) * 100, 1), from: round(min), to: round(max) };
  }
  return null;
}

function rowMetrics(raw) {
  if (!raw) return null;
  const configured = applySmartPricingCommissionSettings(
    raw,
    DEFAULT_SMART_PRICING_COMMISSION_SETTINGS
  );
  const row = buildSmartPricingRow(configured, TARGET_MARGIN, MARKETING, TAX);
  return {
    article: row.supplierArticle,
    productId: row.productId,
    brand: row.brandName,
    category: row.categoryName,
    purchaseCost: row.purchaseCost,
    resolutionSource: row.resolutionSource,
    feePct: round(row.marketplaceFeesPercent, 3),
    logistics: round(row.historicalLogistics),
    storage: round(row.storagePerUnit),
    returnRate: round(row.returnRatePercent, 2),
    asp: round(row.currentAvgPrice),
    margin: round(row.currentMarginPercent, 2),
    netProfit: round(row.currentNetProfit),
    recommended: round(row.targetPrice),
    sampleSize: row.historicalCompletedUnits ?? row.completedSales,
    productUnits: row.completedSales,
    status: row.status,
    confidence: confidence(
      row.historicalCompletedUnits ?? row.completedSales ?? 0,
      row.resolutionSource
    ),
    productFeePct: round(row.productHistoricalMarketplaceFeesPercent, 3),
    categoryFeePct: round(row.categoryHistoricalMarketplaceFeesPercent, 3),
    productLogistics: round(row.productHistoricalLogistics),
    categoryLogistics: round(row.categoryHistoricalLogistics),
  };
}

function solveFromCostBasis(costBasis, aspForEval) {
  if (!costBasis || costBasis.purchaseCost == null || costBasis.recommended == null) {
    return null;
  }
  if (costBasis.feePct == null || costBasis.logistics == null) return null;
  const solver = {
    purchaseCost: costBasis.purchaseCost,
    historicalLogistics: costBasis.logistics,
    effectiveLogistics: costBasis.logistics,
    storagePerUnit: costBasis.storage ?? 0,
    marketplaceFeesPercent: costBasis.feePct,
    commissionPercent: costBasis.feePct,
  };
  const recommended = solveRecommendedPrice(solver, TARGET_MARGIN, MARKETING, TAX);
  let live = null;
  if (aspForEval != null && aspForEval > 0 && recommended != null) {
    const m = buildModelBUnitMetrics(solver, MARKETING, aspForEval, TAX);
    live = {
      asp: aspForEval,
      netProfit: round(m.netProfit),
      margin: round(m.marginPercent, 2),
    };
  }
  return {
    recommended: round(recommended),
    costWindow: COST_WINDOW,
    perfWindow: PERF_WINDOW,
    feePct: costBasis.feePct,
    logistics: costBasis.logistics,
    storage: costBasis.storage,
    resolutionSource: costBasis.resolutionSource,
    sampleSize: costBasis.sampleSize,
    live,
  };
}

function explainSignificantChange(a, b) {
  if (!a || !b || a.recommended == null || b.recommended == null) return null;
  const ch = pctChange(a.recommended, b.recommended);
  if (ch == null || Math.abs(ch) < SIGNIFICANT_PCT) return null;
  const drivers = [];
  const feeDelta = (b.feePct ?? 0) - (a.feePct ?? 0);
  const logDelta = (b.logistics ?? 0) - (a.logistics ?? 0);
  const storageDelta = (b.storage ?? 0) - (a.storage ?? 0);
  const costDelta = (b.purchaseCost ?? 0) - (a.purchaseCost ?? 0);
  const aspCh = pctChange(a.asp, b.asp);
  if (Math.abs(feeDelta) >= 0.5) drivers.push(`fee ${a.feePct}→${b.feePct}% (Δ${round(feeDelta, 2)}pt)`);
  if (Math.abs(logDelta) >= 20) drivers.push(`logistics ${a.logistics}→${b.logistics}`);
  if (Math.abs(storageDelta) >= 5) drivers.push(`storage ${a.storage}→${b.storage}`);
  if (Math.abs(costDelta) >= 1) drivers.push(`productCost ${a.purchaseCost}→${b.purchaseCost}`);
  if (aspCh != null && Math.abs(aspCh) >= 10) drivers.push(`ASP regime ${a.asp}→${b.asp} (${round(aspCh, 1)}%)`);
  if (a.resolutionSource !== b.resolutionSource) {
    drivers.push(`source ${a.resolutionSource}→${b.resolutionSource}`);
  }
  if ((a.productUnits ?? 0) < 20 && (b.productUnits ?? 0) < 20) {
    drivers.push("low product sample → category/account history");
  }
  if (drivers.length === 0) drivers.push("mixed small input shifts");
  return {
    fromDays: a.days,
    toDays: b.days,
    fromRec: a.recommended,
    toRec: b.recommended,
    changePct: round(ch, 2),
    drivers,
  };
}

function scoreDecision(fixedRec, adaptiveRec, liveAsp, costForNp) {
  // Prefer recommendation closer to a "healthy" band: live margin near target when priced at rec,
  // and not wildly above/below recent ASP without cause.
  // Proxy score (higher better):
  // - If adaptive and fixed equal → tie
  // - Prefer method whose rec, when used as price, yields margin closer to TARGET_MARGIN under cost basis
  // - Penalize if |rec - recentAsp|/asp > 40% without low recent margin
  if (fixedRec == null && adaptiveRec == null) return "none";
  if (fixedRec == null) return "adaptive";
  if (adaptiveRec == null) return "fixed";
  if (Math.abs(fixedRec - adaptiveRec) / Math.max(fixedRec, 1) < 0.01) return "tie";

  const solver = costForNp
    ? {
        purchaseCost: costForNp.purchaseCost,
        historicalLogistics: costForNp.logistics,
        effectiveLogistics: costForNp.logistics,
        storagePerUnit: costForNp.storage ?? 0,
        marketplaceFeesPercent: costForNp.feePct,
        commissionPercent: costForNp.feePct,
      }
    : null;

  function quality(rec) {
    if (!solver || rec == null) return 0;
    const atRec = buildModelBUnitMetrics(solver, MARKETING, rec, TAX);
    const marginGap = Math.abs((atRec.marginPercent ?? 0) - TARGET_MARGIN);
    let score = 100 - marginGap * 2;
    if (liveAsp != null && liveAsp > 0) {
      const lift = (rec - liveAsp) / liveAsp;
      // Prefer not demanding >35% lift unless recent margin is poor
      const live = buildModelBUnitMetrics(solver, MARKETING, liveAsp, TAX);
      if (lift > 0.35 && (live.marginPercent ?? 0) > 5) score -= 25;
      if (lift < -0.1) score -= 15; // underpricing vs recent ASP
      // If recent margin negative/low, higher lift is justified
      if ((live.marginPercent ?? 0) < 0 && lift > 0) score += 10;
    }
    return score;
  }

  const qF = quality(fixedRec);
  const qA = quality(adaptiveRec);
  if (Math.abs(qF - qA) < 3) return "tie";
  return qA > qF ? "adaptive" : "fixed";
}

console.error("Loading windows…");
const byPeriod = {};
for (const days of PERIODS) {
  const { from, to } = buildInclusiveDateRange(days);
  console.error(`  ${days}d ${from}→${to}`);
  const scope = await resolveScopedDateRange({ company: "1", account: "1", from, to });
  const inputs = await getSmartPricingInputs(scope);
  const map = new Map();
  for (const raw of inputs ?? []) {
    const m = rowMetrics(raw);
    if (!m) continue;
    m.days = days;
    m.from = from;
    m.to = to;
    map.set(String(m.productId), m);
  }
  byPeriod[days] = map;
  console.error(`    products with stock: ${map.size}`);
}

// Universe = products present in 90d stock-filtered set
const baseIds = [...byPeriod[90].keys()];
const classified = baseIds.map((id) => {
  const m90 = byPeriod[90].get(id);
  const units90 = m90.productUnits ?? 0;
  const tier = volumeTier(units90);
  const series = PERIODS.map((d) => byPeriod[d].get(id)).filter(Boolean);
  const asps = series.map((s) => s.asp).filter((x) => x != null);
  // crude weekly proxy: ASP across expanding windows as regime signal
  const regime = detectRegime(asps);
  return { id, article: m90.article, tier, units90, regime, m90 };
});

function pick(tier, n) {
  return classified
    .filter((c) => c.tier === tier)
    .sort((a, b) => b.units90 - a.units90)
    .slice(0, n);
}

const high = pick("high", 10);
const medium = pick("medium", 10);
const low = pick("low", 10);
const seasonal = classified
  .filter((c) => c.regime)
  .sort((a, b) => Math.abs(b.regime.changePct) - Math.abs(a.regime.changePct))
  .slice(0, 8);

const sampleMap = new Map();
for (const c of [...high, ...medium, ...low, ...seasonal]) {
  sampleMap.set(c.id, c);
}
const sample = [...sampleMap.values()];

console.error(
  `Sample: high=${high.length} med=${medium.length} low=${low.length} seasonal=${seasonal.length} unique=${sample.length}`
);

const productReports = [];
for (const c of sample) {
  const windows = {};
  for (const d of PERIODS) {
    windows[d] = byPeriod[d].get(c.id) ?? null;
  }
  const changes = [];
  for (let i = 0; i < PERIODS.length - 1; i++) {
    const a = windows[PERIODS[i]];
    const b = windows[PERIODS[i + 1]];
    if (a && b) {
      const ex = explainSignificantChange(a, b);
      if (ex) changes.push(ex);
    }
  }
  // also 30 vs 90
  if (windows[30] && windows[90]) {
    const ex = explainSignificantChange(
      { ...windows[30], days: 30 },
      { ...windows[90], days: 90 }
    );
    if (ex && !changes.some((x) => x.fromDays === 30 && x.toDays === 90)) changes.push(ex);
  }

  const costBasis = windows[COST_WINDOW];
  const perf = windows[PERF_WINDOW];
  const adaptive = solveFromCostBasis(costBasis, perf?.asp ?? null);
  const fixed90 = windows[90];
  const fixed30 = windows[30];

  // Rec spread across windows
  const recs = PERIODS.map((d) => windows[d]?.recommended).filter((x) => x != null);
  const recMin = recs.length ? Math.min(...recs) : null;
  const recMax = recs.length ? Math.max(...recs) : null;
  const recSpreadPct =
    recMin != null && recMax != null && recMin > 0 ? round(((recMax - recMin) / recMin) * 100, 2) : null;

  const fixedBestWindow = (() => {
    // Among fixed windows, pick 90 as "current default-ish long" comparison baseline;
    // also score which single window would be "best" by quality vs adaptive cost basis
    let best = null;
    let bestScore = -Infinity;
    for (const d of PERIODS) {
      const w = windows[d];
      if (!w?.recommended || !costBasis) continue;
      const verdict = scoreDecision(w.recommended, w.recommended, perf?.asp, costBasis);
      // use distance of live margin at ASP under this window's own costs toward target
      const solver = {
        purchaseCost: w.purchaseCost,
        historicalLogistics: w.logistics,
        effectiveLogistics: w.logistics,
        storagePerUnit: w.storage ?? 0,
        marketplaceFeesPercent: w.feePct,
        commissionPercent: w.feePct,
      };
      if (w.asp == null) continue;
      const live = buildModelBUnitMetrics(solver, MARKETING, w.asp, TAX);
      const score = 100 - Math.abs((live.marginPercent ?? 0) - TARGET_MARGIN);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    return best;
  })();

  const oneFixedBest = recSpreadPct != null && recSpreadPct < 3;
  const winnerVs90 = scoreDecision(
    fixed90?.recommended ?? null,
    adaptive?.recommended ?? null,
    perf?.asp ?? null,
    costBasis
  );
  const winnerVs30 = scoreDecision(
    fixed30?.recommended ?? null,
    adaptive?.recommended ?? null,
    perf?.asp ?? null,
    costBasis
  );

  productReports.push({
    article: c.article,
    productId: c.id,
    tier: c.tier,
    units90: c.units90,
    regime: c.regime,
    brand: c.m90.brand,
    category: c.m90.category,
    windows,
    significantChanges: changes,
    recSpreadPct,
    oneFixedBest: oneFixedBest ? "YES" : "NO",
    oneFixedReason: oneFixedBest
      ? `Recommended price varies <${SIGNIFICANT_PCT}% across windows`
      : `Recommended price spread ${recSpreadPct}% across windows; drivers vary by period`,
    adaptive,
    fixed90Rec: fixed90?.recommended ?? null,
    fixed30Rec: fixed30?.recommended ?? null,
    adaptiveRec: adaptive?.recommended ?? null,
    adaptiveVsFixed90: winnerVs90,
    adaptiveVsFixed30: winnerVs30,
    fixedBestWindow,
    deltaAdaptiveVs90:
      adaptive?.recommended != null && fixed90?.recommended != null
        ? round(adaptive.recommended - fixed90.recommended)
        : null,
  });
}

function tally(rows, key) {
  const out = { adaptive: 0, fixed: 0, tie: 0, none: 0 };
  for (const r of rows) {
    const v = r[key] ?? "none";
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

const byTier = {
  high: productReports.filter((p) => p.tier === "high"),
  medium: productReports.filter((p) => p.tier === "medium"),
  low: productReports.filter((p) => p.tier === "low"),
};

const summary = {
  sampleSize: productReports.length,
  tierCounts: {
    high: byTier.high.length,
    medium: byTier.medium.length,
    low: byTier.low.length,
    seasonalFlagged: productReports.filter((p) => p.regime).length,
  },
  oneFixedYes: productReports.filter((p) => p.oneFixedBest === "YES").length,
  oneFixedNo: productReports.filter((p) => p.oneFixedBest === "NO").length,
  adaptiveVs90: tally(productReports, "adaptiveVsFixed90"),
  adaptiveVs30: tally(productReports, "adaptiveVsFixed30"),
  byTier: {
    high: {
      n: byTier.high.length,
      vs90: tally(byTier.high, "adaptiveVsFixed90"),
      fixedNo: byTier.high.filter((p) => p.oneFixedBest === "NO").length,
    },
    medium: {
      n: byTier.medium.length,
      vs90: tally(byTier.medium, "adaptiveVsFixed90"),
      fixedNo: byTier.medium.filter((p) => p.oneFixedBest === "NO").length,
    },
    low: {
      n: byTier.low.length,
      vs90: tally(byTier.low, "adaptiveVsFixed90"),
      fixedNo: byTier.low.filter((p) => p.oneFixedBest === "NO").length,
    },
  },
  avgRecSpreadPct: round(
    productReports.reduce((s, p) => s + (p.recSpreadPct ?? 0), 0) /
      Math.max(1, productReports.filter((p) => p.recSpreadPct != null).length),
    2
  ),
  significantChangeCount: productReports.reduce((s, p) => s + p.significantChanges.length, 0),
};

const outDir = resolve(process.cwd(), ".perf");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "smart-pricing-dual-window-validation.json");

// Compact windows for JSON size
const compact = productReports.map((p) => ({
  ...p,
  windows: Object.fromEntries(
    Object.entries(p.windows).map(([k, v]) => [
      k,
      v
        ? {
            recommended: v.recommended,
            feePct: v.feePct,
            logistics: v.logistics,
            storage: v.storage,
            returnRate: v.returnRate,
            asp: v.asp,
            margin: v.margin,
            netProfit: v.netProfit,
            sampleSize: v.sampleSize,
            productUnits: v.productUnits,
            confidence: v.confidence,
            resolutionSource: v.resolutionSource,
          }
        : null,
    ])
  ),
}));

writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      settings: { TARGET_MARGIN, MARKETING, TAX, COST_WINDOW, PERF_WINDOW, SIGNIFICANT_PCT },
      summary,
      products: compact,
    },
    null,
    2
  )
);

console.log(JSON.stringify({ outPath, summary }, null, 2));
