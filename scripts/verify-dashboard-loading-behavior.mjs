import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows, fetchAllInDateRange } from "../src/lib/supabase/paginate.ts";
import { supabaseFetch } from "../src/lib/supabase/fetch.ts";
import { withReadBudget, ReadBudgetExceeded, getReadBudgetSignal } from "../src/lib/supabase/read-budget.ts";
import { getDashboardTaxInputs, getCompanyTaxFoundation } from "../src/services/company-tax-service.ts";
import { calculateWbRemuneration } from "../src/lib/marketplace-fees.ts";
import { getDashboardCoreData } from "../src/services/dashboard-service.ts";
import { navigateScope } from "../src/lib/scope-navigation.ts";

// No credentials/network required: exercise real Supabase query builders and
// service functions against a deterministic PostgREST transport fixture.
process.env.PERF_AUDIT = "0";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service";
process.env.ORION_RLS_DATA_PLANE = "0";
const originalFetch = globalThis.fetch;

function fixture({ total = 4507, cap = 1000, count = true, failAt, truncateAt, latency = 2 } = {}) {
  const calls = [];
  let active = 0;
  let peak = 0;
  const fetch = async (input, init) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(cap, Number(url.searchParams.get("limit") ?? 1000));
    calls.push(url);
    active++;
    peak = Math.max(peak, active);
    try {
      await delay(latency + (offset === 1000 ? 8 : 0), undefined, { signal: init?.signal });
      if (offset === failAt) return Response.json({ message: "fixture failed" }, { status: 500 });
      const length = offset === truncateAt ? 0 : Math.max(0, Math.min(limit, total - offset));
      const data = Array.from({ length }, (_, i) => ({ id: offset + i, amount: offset + i }));
      return Response.json(data, { headers: {
        "content-range": `${offset}-${offset + length - 1}/${count ? total : "*"}`,
      } });
    } finally { active--; }
  };
  const db = createClient("https://fixture.invalid", "fixture", { global: { fetch } });
  return { db, calls, peak: () => peak };
}

const range = { column: "operation_date", from: "2026-09-01", to: "2026-09-30",
  marketplaceAccountId: "2", selectColumns: "id,amount",
  inFilters: [{ column: "product_id", values: [7, 8] }], isNullFilters: ["deleted_at"] };

for (const method of ["range", "all"]) {
  for (const options of [{ total: 0 }, { total: 1000 }, { total: 4507 },
    { total: 40062 }, { total: 1357, cap: 300 }, { total: 857, cap: 300, count: false }]) {
    const mock = fixture(options);
    const rows = method === "range"
      ? await fetchAllInDateRange(mock.db, "wb_finance", range)
      : await fetchAllRows(mock.db, "wb_finance", { marketplaceAccountId: "2",
          selectColumns: "id,amount", eqFilters: [{ column: "status", value: "ready" }] });
    assert.equal(rows.length, options.total);
    assert.deepEqual(rows.map(row => row.id), Array.from({ length: options.total }, (_, i) => i));
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), Math.max(0, options.total * (options.total - 1) / 2));
    assert.ok(mock.peak() <= 4);
    if (options.total > 4000) assert.equal(mock.peak(), 4);
    for (const url of mock.calls) {
      assert.equal(url.searchParams.get("marketplace_account_id"), "eq.2");
      assert.equal(url.searchParams.get("select"), "id,amount");
      assert.match(url.searchParams.get("order"), /id.asc/);
      if (method === "range") {
        assert.deepEqual(url.searchParams.getAll("operation_date"), ["gte.2026-09-01", "lte.2026-09-30"]);
        assert.equal(url.searchParams.get("product_id"), "in.(7,8)");
        assert.equal(url.searchParams.get("deleted_at"), "is.null");
      } else assert.equal(url.searchParams.get("status"), "eq.ready");
    }
  }
  for (const options of [{ failAt: 2000 }, { truncateAt: 2000 }]) {
    const mock = fixture(options);
    await assert.rejects(method === "range"
      ? fetchAllInDateRange(mock.db, "wb_finance", range)
      : fetchAllRows(mock.db, "wb_finance"), /fixture failed|Incomplete result/);
  }
  const empty = fixture();
  const filter = { inFilters: [{ column: "product_id", values: [] }] };
  assert.deepEqual(method === "range"
    ? await fetchAllInDateRange(empty.db, "wb_finance", { ...range, ...filter })
    : await fetchAllRows(empty.db, "wb_finance", filter), []);
  assert.equal(empty.calls.length, 0);
}
console.log("PASS pagination: 0–40,062 rows, exact totals, order, scope, lower API cap, failures, concurrency <=4");

const navigations = [];
const router = {
  push: (...args) => navigations.push(["push", ...args]),
  replace: (...args) => navigations.push(["replace", ...args]),
  refresh: () => assert.fail("scope selection must not trigger another render"),
};
navigateScope(router, "/?company=1&account=2");
navigateScope(router, "/?company=1&account=2&from=2026-09-01", "replace");
assert.deepEqual(navigations, [
  ["push", "/?company=1&account=2", { scroll: false }],
  ["replace", "/?company=1&account=2&from=2026-09-01", { scroll: false }],
]);
for (const path of ["layout/sidebar", "administration/admin-sidebar"]) {
  const source = await readFile(new URL(`../src/components/${path}.tsx`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /prefetch(?:\s|=\{true\})/);
  assert.match(source, /prefetch=\{false\}/);
}
console.log("PASS navigation: one router operation per scope change; sidebar full prefetch disabled");

try {
  let aborted = 0;
  globalThis.fetch = async (_input, init) => {
    try { await delay(1000, undefined, { signal: init.signal }); }
    catch (error) { aborted++; throw error; }
    return Response.json([]);
  };
  const started = Date.now();
  await assert.rejects(withReadBudget(() => Promise.all([
    supabaseFetch("https://fixture.invalid/a"), supabaseFetch("https://fixture.invalid/b"),
  ]), 25), ReadBudgetExceeded);
  await delay(5);
  assert.equal(aborted, 2, "expired render cancels both active HTTP requests");
  assert.ok(Date.now() - started < 500);
  assert.equal(getReadBudgetSignal(), undefined, "budget must not leak across requests");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(supabaseFetch(new Request("https://fixture.invalid", { signal: controller.signal })));
  await assert.rejects(withReadBudget(() => { throw new Error("failed early"); }, 100), /failed early/);
  assert.equal(await withReadBudget(async () => "ready", 100), "ready");
  const isolated = await Promise.allSettled([
    withReadBudget(() => supabaseFetch("https://fixture.invalid/slow"), 10),
    withReadBudget(async () => { await delay(30); return "other tenant ready"; }, 100),
  ]);
  assert.equal(isolated[0].status, "rejected");
  assert.equal(isolated[1].value, "other tenant ready");
  console.log("PASS deadlines: actual HTTP cancellation, inherited Request signal, independent tenant budgets");

  const profile = { id: "1", company_id: "1", tax_system: "USN", tax_object: "USN_INCOME", tax_rate: 6,
    minimum_tax_rate: 1, effective_from: "2026-01-01", effective_to: null, vat_status: "EXEMPT" };
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    calls.push(url);
    const data = table === "company_tax_profiles" ? [profile]
      : table === "marketplace_accounts" ? [{ id: "1" }, { id: "2" }]
      : table === "tax_purchase_recognition_events" ? [{ event_key: "paid-sale", event_type: "RECOGNITION", amount_rub: 25, recognition_date: "2026-09-10" }]
      : table === "company_purchase_tax_policies" ? null : [];
    return init?.method === "HEAD"
      ? new Response(null, { headers: { "content-range": "*/0" } })
      : Response.json(data, { headers: { "content-range": `0-0/${Array.isArray(data) ? data.length : 0}` } });
  };
  const inputs = await getDashboardTaxInputs("1", range.from, range.to);
  assert.equal(inputs.profile.tax_rate, 6);
  assert.equal(inputs.recognizedExpensesKopeks, 0);
  assert.deepEqual(calls.map(url => url.pathname.split("/").at(-1)), ["company_tax_profiles"]);
  assert.equal(calls[0].searchParams.get("company_id"), "eq.1");
  calls.length = 0;
  assert.equal((await getDashboardTaxInputs("1", "2025-01-01", "2025-12-31")).profile, null);
  assert.equal(calls.length, 1);
  profile.tax_object = "USN_INCOME_MINUS_EXPENSES";
  profile.tax_rate = 15;
  const detailed = await getCompanyTaxFoundation("1", range.from, range.to);
  const dashboard = await getDashboardTaxInputs("1", range.from, range.to);
  assert.equal(dashboard.recognizedExpensesKopeks, detailed.recognizedExpensesKopeks);
  assert.equal(dashboard.recognizedExpensesKopeks, 2500, "purchase deductions remain in the expense regime");
  const financeAccounts = new Set(calls.filter(url => url.pathname.endsWith("/wb_finance")).map(url => url.searchParams.get("marketplace_account_id")));
  assert.deepEqual([...financeAccounts].sort(), ["eq.1", "eq.2"]);
  console.log("PASS tax: income-only reads one profile; expense regime preserves company-wide purchase deductions");

  const service = await readFile(new URL("../src/services/dashboard-service.ts", import.meta.url), "utf8");
  const columns = service.match(/const DASHBOARD_FINANCE_COLUMNS =\s*"([^"]+)"/)[1].split(",").map(s => s.trim());
  const finance = [{ id: "1", amount: 12, raw_amount: -12, source_key: "r:ppvz_vw" },
    { id: "2", amount: 2, raw_amount: -2, wb_source_suffix: "vw_nds" }];
  const projected = finance.map(row => Object.fromEntries(columns.map(column => [column, row[column]])));
  assert.deepEqual(calculateWbRemuneration(projected, 100), calculateWbRemuneration(finance, 100));
  assert.equal(calculateWbRemuneration(projected, 100).value, -14);

  profile.tax_object = "USN_INCOME";
  profile.tax_rate = 6;
  const sources = {
    products: [{ id: "7", marketplace_account_id: "2", supplier_article: "fixture", nm_id: 7, name: "Fixture", brand_id: "1", category_id: "1", brand: { id: "1", name: "Brand" }, category: { id: "1", name: "Category" } }],
    wb_orders: [{ id: "1", product_id: "7", order_date: range.from, price: 100, price_with_disc: 100, quantity: 1, status: "completed" }],
    wb_sales: [{ id: "1", srid: "s1", nm_id: 7, product_id: "7", sale_date: range.from, revenue: 100, price_with_disc: 100, for_pay: 80, quantity: 1, is_return: false }],
    wb_finance: Array.from({ length: 40062 }, (_, i) => ({ id: String(i + 1), marketplace_account_id: "2", product_id: "7", nm_id: 7, operation_date: range.from, operation_type: "sale", amount: 1, raw_amount: 1, source_key: `r:${i}:for_pay`, description: "Sale", srid: "s1", finance_category: "FOR_PAY", wb_source_suffix: "for_pay", supplier_oper_name: "Продажа" })),
    wb_ads: [{ id: "1", marketplace_account_id: "2", product_id: "7", campaign_date: range.from, spend: 2 }],
    product_cost_history: [{ id: "1", product_id: "7", cost: 10, effective_from: "2026-01-01", effective_to: null, created_at: "2026-01-01T00:00:00Z" }],
    company_tax_profiles: [profile],
    marketplace_accounts: { last_successful_sync_at: "2026-09-30T00:00:00Z", last_sync_at: null },
  };
  let narrow = false;
  let financeReads = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    assert.ok(Object.hasOwn(sources, table), `Unexpected dashboard query: ${table}`);
    if (table === "wb_finance") financeReads++;
    let data = sources[table];
    if (!Array.isArray(data)) return Response.json(data);
    const total = data.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 1000);
    data = data.slice(offset, offset + limit);
    const select = url.searchParams.get("select");
    if (narrow && select !== "*") {
      const keys = select.split(/,(?![^()]*\))/).map(part => part.trim().split(":")[0]);
      data = data.map(row => Object.fromEntries(keys.map(key => [key, row[key]])));
    }
    return Response.json(data, { headers: { "content-range": `${offset}-${offset + data.length - 1}/${total}` } });
  };
  const scope = { companyId: "1", marketplaceAccountId: "2", from: range.from, to: range.to };
  const fullDashboard = await getDashboardCoreData(scope);
  assert.equal(fullDashboard.isSampleData, false);
  assert.equal(financeReads, 41, "income-only tax must not reread the finance history");
  narrow = true;
  const narrowDashboard = await getDashboardCoreData(scope);
  assert.deepEqual(narrowDashboard, fullDashboard, "projected rows preserve all dashboard totals/charts/products");
  console.log("PASS full dashboard: 40,062 finance rows, one history read, identical full/projected payloads");

  const originalSources = { ...sources };
  for (const table of ["wb_sales", "wb_orders", "wb_finance", "wb_ads"]) sources[table] = [];
  const noActivity = await getDashboardCoreData(scope);
  assert.equal(noActivity.isEmptyPeriod, true, "a catalogue is not activity in the selected period");
  sources.products = [];
  sources.wb_finance = [{ ...originalSources.wb_finance[0], product_id: null, amount: 42, raw_amount: 42 }];
  const financeOnly = await getDashboardCoreData(scope);
  assert.notEqual(financeOnly.isEmptyPeriod, true, "unattributed Finance remains real activity without catalogue rows");
  assert.equal(financeOnly.overview.revenue, 42);
  Object.assign(sources, originalSources);
  console.log("PASS empty-period classification: catalogue-only is empty; finance-only totals are preserved");

  globalThis.fetch = async () => Response.json({ message: "database unavailable" }, { status: 500 });
  await assert.rejects(getDashboardCoreData({ companyId: "1", marketplaceAccountId: "2", from: range.from, to: range.to }), /database unavailable/);
  await delay(10); // Also surface any unhandled concurrent-query rejection.
  console.log("PASS live failures reject instead of displaying sample financial figures; signed fee projection preserved");
} finally { globalThis.fetch = originalFetch; }
