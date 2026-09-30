import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { once } from "node:events";
import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Run the compiled Next app, including middleware, cookies, authorization,
// React request caching and HTML/Flight rendering. The only backend is this
// loopback fixture; no real keys/accounts or production writes are involved.
await readFile(resolve(".next/BUILD_ID"));
const fixtureUser = { id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
  email: "fixture@example.invalid", app_metadata: { orion: { company_ids: ["1"], marketplace_account_ids: ["1", "2"] } },
  user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ sub: fixtureUser.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "fixture-signature"].join(".");
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: fixtureUser })).toString("base64url")}`;
const accounts = [1, 2].map(id => ({ id: String(id), company_id: "1", marketplace: "wildberries", account_name: `Fixture Store ${id}`, is_default: id === 1, is_active: true,
  last_successful_sync_at: "2026-09-30T00:00:00Z", last_sync_at: null, lifecycle_status: "ready", connection_status: "connected" }));
const calls = [];
let authMode = "ready";
let authCounter = 0;
let failPageAuthAt = Infinity;
let financeMode = "ready";
let snapshotsMode = "ready";
let disconnected = 0;

const fixture = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://fixture.invalid");
  const table = url.pathname.split("/").at(-1);
  calls.push({ table, query: url.search, time: Date.now() });
  response.setHeader("content-type", "application/json");
  const send = (value, status = 200) => { response.statusCode = status; response.end(JSON.stringify(value)); };
  if (url.pathname.startsWith("/auth/")) {
    authCounter++;
    if (authMode === "hang") { response.on("close", () => disconnected++); return; }
    if (authMode === "error" || authCounter === failPageAuthAt) return send({ msg: "fixture Auth unavailable" }, 503);
    if (request.headers.authorization !== `Bearer ${token}`) return send({ msg: "Invalid session" }, 401);
    return send(fixtureUser);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return send({ message: "Fixture forbids mutations" }, 405);
  const accountId = url.searchParams.get("marketplace_account_id")?.slice(3) ?? "1";
  if (table === "wb_finance" && financeMode === "error") return send({ message: "fixture finance unavailable" }, 500);
  if (table.startsWith("warehouse_") && snapshotsMode === "hang") { response.on("close", () => disconnected++); return; }
  if (table === "wb_finance") await delay(10);
  const date = "2026-09-20";
  const product = { id: accountId, marketplace_account_id: accountId, supplier_article: `SKU-${accountId}`, nm_id: Number(accountId), name: `Fixture Product ${accountId}`, brand_id: "1", category_id: "1", brand: { id: "1", name: "Fixture Brand" }, category: { id: "1", name: "Fixture Category" } };
  const data = {
    marketplace_accounts: accounts,
    marketplace_accounts_public: accounts,
    companies: [{ id: "1", name: "Fixture Company", is_default: true, currency: "RUB" }],
    products: [product],
    wb_sales: [{ id: "1", marketplace_account_id: accountId, srid: "s1", nm_id: Number(accountId), product_id: accountId, sale_date: date, revenue: 100, price_with_disc: 100, for_pay: 80, quantity: 1, is_return: false }],
    wb_orders: [{ id: "1", marketplace_account_id: accountId, product_id: accountId, order_date: date, price: 100, price_with_disc: 100, quantity: 1, status: "completed" }],
    wb_finance: Array.from({ length: accountId === "2" ? 40062 : 10 }, (_, i) => ({ id: String(i + 1), marketplace_account_id: accountId, product_id: accountId, operation_date: date, operation_type: "sale", amount: 1, raw_amount: 1, source_key: `r:${i}:for_pay`, finance_category: "FOR_PAY", wb_source_suffix: "for_pay", srid: "s1", nm_id: Number(accountId) })),
    wb_ads: [{ id: "1", marketplace_account_id: accountId, product_id: accountId, campaign_date: date, spend: 2 }],
    product_cost_history: [{ id: "1", product_id: accountId, cost: 10, effective_from: "2026-01-01", effective_to: null, created_at: "2026-01-01T00:00:00Z" }],
    company_tax_profiles: [{ id: "1", company_id: "1", tax_system: "USN", tax_object: "USN_INCOME", tax_rate: 6, effective_from: "2026-01-01", effective_to: null }],
    warehouse_sales_report_snapshot: [], warehouse_account_balance: [],
  };
  let rows = data[table] ?? [];
  for (const [key, value] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const [operator, ...parts] = value.split(".");
    const target = parts.join(".");
    if (operator === "eq") rows = rows.filter(row => String(row[key]) === target);
    if (operator === "in") rows = rows.filter(row => target.slice(1, -1).split(",").includes(String(row[key])));
    if (operator === "gte") rows = rows.filter(row => row[key] >= target);
    if (operator === "lte") rows = rows.filter(row => row[key] <= target);
    if (operator === "is" && target === "null") rows = rows.filter(row => row[key] == null);
  }
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const size = Number(url.searchParams.get("limit") ?? 1000);
  rows = rows.slice(offset, offset + size);
  response.setHeader("content-range", `${offset}-${offset + rows.length - 1}/${total}`);
  if (request.headers.accept?.includes("vnd.pgrst.object")) return send(rows[0] ?? null);
  if (request.method === "HEAD") return response.end();
  send(rows);
});
await new Promise((resolve, reject) => { fixture.once("error", reject); fixture.listen(0, "127.0.0.1", resolve); });
const fixtureUrl = `http://127.0.0.1:${fixture.address().port}`;
const portServer = http.createServer();
await new Promise(resolve => portServer.listen(0, "127.0.0.1", resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const baseUrl = `http://127.0.0.1:${port}`;
let output = "";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: fixtureUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-anon",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service", INTERNAL_API_SECRET: "fixture-internal-secret-for-local-test-only", ORION_RLS_DATA_PLANE: "1", PERF_AUDIT: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", chunk => { output += chunk; });
child.stderr.on("data", chunk => { output += chunk; });
const measurements = [];
const scopeUrl = account => `/?company=1&account=${account}&from=2026-09-01&to=2026-09-30`;
async function load(path, { rsc = false, loggedIn = true } = {}) {
  const started = Date.now();
  const response = await fetch(baseUrl + path, { redirect: "manual", signal: AbortSignal.timeout(55_000),
    headers: { ...(loggedIn ? { Cookie: cookie } : {}), ...(rsc ? { RSC: "1" } : {}) } });
  const body = await response.text();
  return { response, body, ms: Date.now() - started };
}

try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try { await fetch(baseUrl + "/favicon.ico"); break; } catch { await delay(100); }
  }
  const guest = await load(scopeUrl(1), { loggedIn: false });
  assert.equal(guest.response.status, 307);
  assert.match(guest.response.headers.get("location"), /\/login\?/);
  for (const account of [1, 2, 1]) {
    calls.length = 0;
    const page = await load(scopeUrl(account));
    assert.equal(page.response.status, 200);
    assert.match(page.body, /Sales &amp; Profit Trend/);
    assert.doesNotMatch(page.body, /Showing sample placeholders|NEXT_REDIRECT/);
    const financeReads = calls.filter(call => call.table === "wb_finance");
    assert.equal(financeReads.length, account === 2 ? 41 : 1, "Core and optional strip must share one SQL load inside React rendering");
    assert.ok(financeReads.every(call => call.query.includes(`marketplace_account_id=eq.${account}`)));
    measurements.push({ scenario: `HTML account ${account}`, ms: page.ms, financeReads: financeReads.length });
  }
  const flight = await load(scopeUrl(2), { rsc: true });
  assert.equal(flight.response.status, 200);
  assert.match(flight.response.headers.get("content-type"), /text\/x-component/);
  assert.match(flight.body, /Sales & Profit Trend/);
  assert.doesNotMatch(flight.body, /:E\{/);
  measurements.push({ scenario: "RSC account 2", ms: flight.ms });
  assert.match(flight.response.headers.get("x-orion-request-id"), /^[0-9a-f-]{36}$/);
  assert.ok(output.includes(flight.response.headers.get("x-orion-request-id")), "server timing logs must match the response request id");
  const concurrent = await Promise.all([load(scopeUrl(1)), load(scopeUrl(2)), load(scopeUrl(2), { rsc: true })]);
  for (const result of concurrent) assert.equal(result.response.status, 200);
  assert.equal(new Set(concurrent.map(result => result.response.headers.get("x-orion-request-id"))).size, 3);
  measurements.push({ scenario: "three concurrent HTML/RSC requests", maxMs: Math.max(...concurrent.map(result => result.ms)) });
  calls.length = 0;
  const emptyDate = await load("/?company=1&account=2&from=2026-08-01&to=2026-08-07");
  assert.equal(emptyDate.response.status, 200);
  const dateReads = calls.filter(call => call.table === "wb_finance");
  assert.equal(dateReads.length, 1);
  assert.ok(dateReads[0].query.includes("operation_date=gte.2026-08-01") && dateReads[0].query.includes("operation_date=lte.2026-08-07"));
  const denied = await load(scopeUrl(3));
  assert.match(denied.response.headers.get("location") ?? denied.body, /access-denied/);

  authMode = "error";
  const authFailure = await load(scopeUrl(1));
  assert.equal(authFailure.response.status, 200);
  assert.match(authFailure.body, /Dashboard could not finish loading/);
  assert.equal(authFailure.response.headers.get("location"), null, "Auth outage must not redirect to login");
  const authFlight = await load(scopeUrl(1), { rsc: true });
  assert.equal(authFlight.response.status, 200);
  assert.match(authFlight.response.headers.get("content-type"), /text\/x-component/);
  assert.match(authFlight.body, /DashboardLoadError/);
  const authApi = await load("/api/companies");
  assert.equal(authApi.response.status, 503);
  assert.match(authApi.body, /AUTH_UNAVAILABLE/);
  authMode = "hang";
  const hungAuth = await load(scopeUrl(1));
  assert.equal(hungAuth.response.status, 200);
  assert.ok(hungAuth.ms < 10_500);
  measurements.push({ scenario: "hanging middleware Auth bounded", ms: hungAuth.ms });
  await delay(50);
  assert.ok(disconnected >= 1, "deadline must disconnect the actual fixture request");
  authMode = "ready";
  authCounter = 0;
  failPageAuthAt = 2; // middleware succeeds, page's independent check fails
  const pageAuth = await load(scopeUrl(1));
  assert.match(pageAuth.body, /Dashboard could not finish loading/);
  assert.equal(pageAuth.response.headers.get("location"), null);
  failPageAuthAt = Infinity;

  financeMode = "error";
  const badFinance = await load(scopeUrl(1), { rsc: true });
  assert.match(badFinance.body, /:E\{/);
  assert.doesNotMatch(badFinance.body, /Showing sample placeholders|"modelB"/);
  financeMode = "ready";
  const pricingUrl = "/analytics/pricing?company=1&account=2";
  calls.length = 0;
  const pricing = await load(pricingUrl);
  assert.equal(pricing.response.status, 200);
  assert.doesNotMatch(pricing.body, /Smart Pricing could not finish loading/);
  assert.match(pricing.body, /Forward-looking target price/);
  const pricingFinanceReads = calls.filter(call => call.table === "wb_finance");
  assert.ok(pricingFinanceReads.length > 1);
  for (const call of pricingFinanceReads) {
    const columns = new URLSearchParams(call.query).get("select");
    assert.ok(columns && columns !== "*" && columns.includes("operation_date"));
  }
  financeMode = "error";
  const pricingFailure = await load(pricingUrl, { rsc: true });
  assert.match(pricingFailure.body, /DashboardLoadError/);
  assert.match(pricingFailure.body, /"pageName":"Smart Pricing"/);
  assert.doesNotMatch(pricingFailure.body, /:E\{/);
  financeMode = "ready";
  snapshotsMode = "hang";
  const slowOptional = await load(scopeUrl(1));
  assert.equal(slowOptional.response.status, 200);
  assert.match(slowOptional.body, /Sales &amp; Profit Trend/);
  assert.match(slowOptional.body, /Settlement and wallet data are temporarily unavailable/);
  assert.ok(slowOptional.ms >= 4_000 && slowOptional.ms < 7_000);
  measurements.push({ scenario: "hanging optional snapshots, healthy core", ms: slowOptional.ms });
  await delay(50);
  assert.ok(disconnected >= 3, "both optional requests must be canceled at their own deadline");
  snapshotsMode = "ready";
  const recovered = await load(scopeUrl(2));
  assert.equal(recovered.response.status, 200);
  assert.match(recovered.body, /Sales &amp; Profit Trend/);
  console.log(JSON.stringify({ status: "PASS", environment: "compiled Next production app with loopback fixtures; not a live deployment benchmark", measurements }, null, 2));
} catch (error) {
  console.error(output.slice(-5000));
  if (error.code === "ERR_ASSERTION") error.actual = "See the assertion and local fixture log";
  throw error;
} finally {
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(3000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
  await writeFile("/tmp/orion-production-fixture.log", output);
}
