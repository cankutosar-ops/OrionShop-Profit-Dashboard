#!/usr/bin/env node
/**
 * Product logistics attribution + Unit Logistics Cost + V4 account NP gate.
 *
 *   npx tsx scripts/verify-product-logistics-attribution.mjs [accountId] [from] [to]
 *
 * Default: Orion shop account 2, 2026-07-27 → 2026-09-06
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, i).trim()] ??= v;
    }
  }
}

loadEnv();

const accountId = process.argv[2] ?? "2";
const from = process.argv[3] ?? "2026-07-27";
const to = process.argv[4] ?? "2026-09-06";

const EXPECTED = {
  revenue: 469926,
  logistics: 173043,
  storage: 11575,
  acceptance: 1140,
  penalties: 1110,
  adjustments: 36002,
  advertising: 33894,
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const near = (a, b, eps = 1) => Math.abs(round2(a) - round2(b)) <= eps;

let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- Pure unit checks (no DB) ---
{
  const {
    stampLogisticsProductIds,
    calculateUnitLogisticsCost,
    calculateNetUnits,
    buildUnambiguousNmIdToProductIdMap,
    buildProductLogisticsReconciliation,
  } = await import("../src/lib/product-logistics-attribution.ts");

  check("Net Units = sold − returned", calculateNetUnits(100, 20) === 80);
  check("Unit Logistics = 8000/80", calculateUnitLogisticsCost(8000, 80) === 100);
  check("Unit Logistics N/A when netUnits=0", calculateUnitLogisticsCost(8000, 0) === null);
  check("Unit Logistics N/A when netUnits<0", calculateUnitLogisticsCost(8000, -1) === null);

  const nmMap = buildUnambiguousNmIdToProductIdMap([
    { id: "p1", nm_id: 10 },
    { id: "p2", nm_id: 10 },
    { id: "p3", nm_id: 20 },
  ]);
  check("Ambiguous nm_id omitted", !nmMap.has(10) && nmMap.get(20) === "p3");

  const sales = [
    {
      srid: "S1",
      product_id: "pA",
      is_return: false,
      marketplace_account_id: "2",
    },
  ];
  const products = [
    { id: "pA", nm_id: 111 },
    { id: "pB", nm_id: 222 },
  ];
  const finance = [
    {
      id: "1",
      product_id: null,
      srid: "S1",
      nm_id: 111,
      amount: -500,
      finance_category: "LOGISTICS",
      operation_type: "logistics",
      source_key: "rrd:1:delivery_rub",
      marketplace_account_id: "2",
      operation_date: from,
      description: null,
    },
    {
      id: "2",
      product_id: null,
      srid: null,
      nm_id: 222,
      amount: -200,
      finance_category: "LOGISTICS",
      operation_type: "logistics",
      source_key: "rrd:2:delivery_rub",
      marketplace_account_id: "2",
      operation_date: from,
      description: null,
    },
    {
      id: "3",
      product_id: null,
      srid: "UNKNOWN",
      nm_id: 999,
      amount: -100,
      finance_category: "LOGISTICS",
      operation_type: "logistics",
      source_key: "rrd:3:delivery_rub",
      marketplace_account_id: "2",
      operation_date: from,
      description: null,
    },
  ];
  const stamped = stampLogisticsProductIds(finance, sales, products);
  check(
    "SRID stamp sets product_id",
    stamped.finance.find((r) => r.id === "1")?.product_id === "pA",
    `viaSridAbs=${stamped.resolvedViaSridAbs}`
  );
  check(
    "nm_id stamp when unambiguous",
    stamped.finance.find((r) => r.id === "2")?.product_id === "pB",
    `viaNmAbs=${stamped.resolvedViaNmIdAbs}`
  );
  check(
    "Unresolved stays null",
    stamped.finance.find((r) => r.id === "3")?.product_id == null,
    `unresolvedAbs=${stamped.unresolvedAbs}`
  );
  check("Account logistics total abs", stamped.accountLogisticsTotal === 800);

  const recon = buildProductLogisticsReconciliation({
    accountLogisticsTotal: 800,
    attributedProductLogistics: 500,
    resolvedViaSridAbs: 500,
    resolvedViaNmIdAbs: 200,
    unresolvedAbs: 100,
    resolvedViaSridRows: 1,
    resolvedViaNmIdRows: 1,
    unresolvedRows: 1,
  });
  check(
    "Attributed + Unallocated = Account",
    near(recon.attributedProductLogistics + recon.unallocatedLogistics, recon.accountLogisticsTotal, 0.01)
  );
}

// --- Live Orion shop period ---
{
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { enterServiceDbContext } = await import("../src/lib/supabase/request-db-context.ts");
  const {
    getOverviewMetrics,
    getProductProfitabilityBuild,
  } = await import("../src/services/dashboard-service.ts");
  const { buildProductAnalyticsTotals, buildProductAnalyticsV3Rows } = await import(
    "../src/lib/product-analytics.ts"
  );

  enterServiceDbContext("verify-product-logistics-attribution");
  const client = createAdminClient();
  // Scripts bypass page auth — Orion shop is company 2 / account 2.
  const scope = {
    marketplaceAccountId: String(accountId),
    companyId: String(accountId),
    from,
    to,
  };

  console.log(`\nLive: account ${scope.marketplaceAccountId} | ${from} → ${to}\n`);

  const [overview, build] = await Promise.all([
    getOverviewMetrics(scope, client),
    getProductProfitabilityBuild(scope, client),
  ]);

  const accountNp = overview.modelBProfit.finalNetProfit;
  const accountLogisticsInclReturns = overview.modelBProfit.logistics;
  const recon = build.logisticsReconciliation;
  const v3All = buildProductAnalyticsV3Rows(build.rows);
  const totals = buildProductAnalyticsTotals(build.rows, {
    unallocatedLogistics: recon.unallocatedLogistics,
    accountLogisticsTotal: recon.accountLogisticsTotal,
    unallocatedRevenue: build.unallocatedRevenue,
    accountRevenue: build.accountRevenue,
  });

  check(
    "Account V4 Revenue unchanged",
    near(overview.modelBProfit.revenue, EXPECTED.revenue, 2),
    `${round2(overview.modelBProfit.revenue)}`
  );
  check(
    "Account V4 Logistics unchanged",
    near(overview.modelBProfit.logistics, EXPECTED.logistics, 2),
    `${round2(overview.modelBProfit.logistics)}`
  );
  check(
    "Account V4 Storage/Acceptance/Penalties/Adj/Ads unchanged",
    near(overview.modelBProfit.storage, EXPECTED.storage, 2) &&
      near(overview.modelBProfit.acceptance, EXPECTED.acceptance, 2) &&
      near(overview.modelBProfit.penalties, EXPECTED.penalties, 2) &&
      near(overview.modelBProfit.adjustments, EXPECTED.adjustments, 2) &&
      near(overview.modelBProfit.advertising, EXPECTED.advertising, 2)
  );
  // Formula identity: live NP must equal V4 recomputation from live components
  // (productCost / netSales / tax may drift with DB data; engine must not).
  const { calculateModelBNetProfit } = await import("../src/lib/financial-engine.ts");
  const recomputed = calculateModelBNetProfit({
    grossSales: overview.modelBProfit.grossSales,
    returnedSales: overview.modelBProfit.returnedSales,
    netSales: overview.modelBProfit.netSales,
    netSalesStatus: overview.modelBProfit.netSalesStatus,
    salesForPay: overview.modelBProfit.netSales - overview.modelBProfit.marketplaceFee,
    financeNetForPay: overview.modelBProfit.revenue,
    acquiring: overview.modelBProfit.acquiring,
    logistics: overview.modelBProfit.logistics,
    storage: overview.modelBProfit.storage,
    penalties: overview.modelBProfit.penalties,
    adjustments: overview.modelBProfit.adjustments,
    acceptance: overview.modelBProfit.acceptance,
    productCost: overview.modelBProfit.productCost,
    advertising: overview.modelBProfit.advertising,
    customerPaid: overview.modelBProfit.customerPaid,
    taxPercent: overview.modelBProfit.taxPercent,
  });
  check(
    "Account V4 formula identity (engine unchanged)",
    near(recomputed.finalNetProfit, overview.modelBProfit.finalNetProfit, 0.02),
    `engine=${round2(recomputed.finalNetProfit)} live=${round2(overview.modelBProfit.finalNetProfit)}`
  );
  check(
    "Stamp account LOGISTICS ≈ 173,043",
    near(recon.accountLogisticsTotal, EXPECTED.logistics, 2),
    `${round2(recon.accountLogisticsTotal)}`
  );
  check(
    "Attributed + Unallocated = Stamp account LOGISTICS",
    near(
      recon.attributedProductLogistics + recon.unallocatedLogistics,
      recon.accountLogisticsTotal,
      0.02
    ),
    `attr=${round2(recon.attributedProductLogistics)} + unalloc=${round2(recon.unallocatedLogistics)} = ${round2(recon.accountLogisticsTotal)}`
  );
  check(
    "Attributed does not exceed account LOGISTICS",
    recon.attributedProductLogistics <= recon.accountLogisticsTotal + 0.02,
    `${round2(recon.attributedProductLogistics)} ≤ ${round2(recon.accountLogisticsTotal)}`
  );
  check(
    "Attributed logistics > 0 (not universally zero)",
    recon.attributedProductLogistics > 1000,
    `${round2(recon.attributedProductLogistics)}`
  );

  const withLogistics = build.rows.filter((r) => r.purchaseLogistics > 0);
  check(
    "Some products have attributed logistics > 0",
    withLogistics.length > 0,
    `${withLogistics.length} products`
  );

  const unitOk = build.rows.every((r) => {
    if (r.netUnits <= 0) return r.unitLogisticsCost == null;
    if (r.unitLogisticsCost == null) return false;
    return near(r.unitLogisticsCost * r.netUnits, r.purchaseLogistics, 0.05);
  });
  check("Unit Logistics × Net Units ≈ Product Logistics", unitOk);

  const sumProductRevenue = build.rows.reduce((s, r) => s + r.revenue, 0);
  check(
    "Σ Product Revenue + Unallocated Revenue ≈ Account Revenue",
    near(sumProductRevenue + build.unallocatedRevenue, build.accountRevenue, 2),
    `Σ=${round2(sumProductRevenue)} + unalloc=${round2(build.unallocatedRevenue)} vs acct=${round2(build.accountRevenue)}`
  );

  check(
    "Analytics totals expose Unallocated Logistics",
    near(totals.unallocatedLogistics, recon.unallocatedLogistics, 0.02)
  );
  const zeroLogisticsEverywhere =
    v3All.length > 0 && v3All.every((r) => r.totalLogistics === 0);
  check("v3All logistics not universally 0", !zeroLogisticsEverywhere);

  console.log("\nReconciliation snapshot:");
  console.log(
    JSON.stringify(
      {
        accountNetProfit: round2(accountNp),
        accountLogisticsInclReturns: round2(accountLogisticsInclReturns),
        stampAccountLogistics: round2(recon.accountLogisticsTotal),
        attributed: round2(recon.attributedProductLogistics),
        unallocated: round2(recon.unallocatedLogistics),
        resolvedViaSridAbs: round2(recon.resolvedViaSridAbs),
        resolvedViaNmIdAbs: round2(recon.resolvedViaNmIdAbs),
        unresolvedAbs: round2(recon.unresolvedAbs),
        productsWithLogistics: withLogistics.length,
        productCount: build.rows.length,
      },
      null,
      2
    )
  );
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
