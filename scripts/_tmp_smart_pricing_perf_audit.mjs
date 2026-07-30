/**
 * Read-only Smart Pricing stage timing audit (not a fix).
 * Run: npx tsx scripts/_tmp_smart_pricing_perf_audit.mjs
 */
import { readFileSync } from "fs";
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

const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
const { createServerClient } = await import("../src/lib/supabase/server.ts");
const {
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} = await import("../src/services/persisted-query-service.ts");
const { getInventoryForAccount } = await import("../src/services/inventory-service.ts");
const { getMarketplaceAccountForSync } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { getSmartPricingInputs } = await import("../src/services/smart-pricing-service.ts");
const {
  applySmartPricingCommissionSettings,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
} = await import("../src/lib/smart-pricing-settings.ts");
const {
  buildSmartPricingRow,
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} = await import("../src/lib/smart-pricing.ts");
const { computeSmartPricingSimulation } = await import(
  "../src/lib/smart-pricing-simulator.ts"
);
const { computeSmartPricingRisk } = await import("../src/lib/smart-pricing-risk.ts");

const mark = () => Date.now();

async function run(label, from, to) {
  console.log(`\n==== ${label} ${from} -> ${to} ====`);
  const t0 = mark();
  const scope = await resolveScopedDateRange({ company: "1", account: "1", from, to });
  const tScope = mark();

  const client = createServerClient();
  const tProducts0 = mark();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
  });
  const productIds = products.map((p) => String(p.id));
  const tProducts1 = mark();

  const timings = {};
  const tFetch0 = mark();
  const [costHistory, sales, finance, orders, account, inventoryRows] = await Promise.all([
    (async () => {
      const s = mark();
      const r = await fetchCostHistory(scope.marketplaceAccountId, client, { productIds });
      timings.costHistory = mark() - s;
      return r;
    })(),
    (async () => {
      const s = mark();
      const r = await fetchSalesInRange(scope, client, { productIds });
      timings.sales = mark() - s;
      return r;
    })(),
    (async () => {
      const s = mark();
      const r = await fetchFinanceInRange(scope, client, { productIds });
      timings.finance = mark() - s;
      return r;
    })(),
    (async () => {
      const s = mark();
      const r = await fetchOrdersInRange(scope, client, { productIds });
      timings.orders = mark() - s;
      return r;
    })(),
    (async () => {
      const s = mark();
      const r = await getMarketplaceAccountForSync(scope.marketplaceAccountId);
      timings.account = mark() - s;
      return r;
    })(),
    (async () => {
      const s = mark();
      const r = await getInventoryForAccount(scope.marketplaceAccountId, client);
      timings.inventory = mark() - s;
      return r;
    })(),
  ]);
  const tFetch1 = mark();

  console.log(
    JSON.stringify(
      {
        phase: "db",
        label,
        scopeMs: tScope - t0,
        productsMs: tProducts1 - tProducts0,
        products: products.length,
        parallelFetchMs: tFetch1 - tFetch0,
        fetchBreakdown: timings,
        volumes: {
          sales: sales.length,
          finance: finance.length,
          orders: orders.length,
          costs: costHistory.length,
          inventory: inventoryRows.length,
        },
      },
      null,
      2
    )
  );

  const tFull0 = mark();
  const inputs = await getSmartPricingInputs(scope);
  const tFull1 = mark();
  const tFull2 = mark();
  const inputs2 = await getSmartPricingInputs(scope);
  const tFull3 = mark();

  const withReplay = (inputs ?? []).filter((i) => i?.historicalReplay?.byWindow);
  const clientTiming = { error: null };
  try {
    const tClient0 = mark();
    const withSettings = applySmartPricingCommissionSettings(
      withReplay,
      DEFAULT_SMART_PRICING_COMMISSION_SETTINGS
    );
    const tSettings = mark();
    const rows = withSettings.map((inp) =>
      buildSmartPricingRow(inp, DEFAULT_TARGET_MARGIN_PERCENT, DEFAULT_MARKETING_PERCENT, 6)
    );
    const tRows = mark();
    let riskMs = 0;
    for (const r of rows) {
      const s = mark();
      computeSmartPricingRisk(r);
      riskMs += mark() - s;
    }
    const tRisk = mark();
    const sims = rows.map((r) =>
      computeSmartPricingSimulation(
        r,
        undefined,
        DEFAULT_TARGET_MARGIN_PERCENT,
        DEFAULT_MARKETING_PERCENT,
        6
      )
    );
    const tSims = mark();
    Object.assign(clientTiming, {
      applySettingsMs: tSettings - tClient0,
      buildRowsMs: tRows - tSettings,
      riskLoopMs: riskMs,
      riskWallMs: tRisk - tRows,
      simulationsMs: tSims - tRisk,
      rowCount: rows.length,
      simCount: sims.length,
      skippedMissingReplay: (inputs?.length ?? 0) - withReplay.length,
    });
  } catch (err) {
    clientTiming.error = err instanceof Error ? err.message : String(err);
  }

  console.log(
    JSON.stringify(
      {
        phase: "loader+client",
        label,
        getSmartPricingInputsPass1Ms: tFull1 - tFull0,
        getSmartPricingInputsPass2Ms: tFull3 - tFull2,
        estimatedCpuInsideLoaderMs: Math.max(
          0,
          tFull1 - tFull0 - (tFetch1 - tFetch0) - (tProducts1 - tProducts0)
        ),
        client: clientTiming,
        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        inputCount: inputs?.length ?? 0,
        inputCount2: inputs2?.length ?? 0,
        sampleKeys: inputs?.[0] ? Object.keys(inputs[0]) : [],
      },
      null,
      2
    )
  );
}

await run("30d", "2026-06-29", "2026-07-28");
await run("90d", "2026-04-30", "2026-07-28");
