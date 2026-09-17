#!/usr/bin/env node
/** Exercise the real route, scope decision, and middleware with isolated in-memory dependencies. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const INTERNAL = "offline-internal-secret";
const CRON = "offline-cron-secret";
process.env.INTERNAL_API_SECRET = INTERNAL;
process.env.CRON_SECRET = CRON;

class NextResponse extends Response {
  static json(body, init = {}) {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: { "content-type": "application/json" },
    });
  }
  static next() {
    return new NextResponse(null, { status: 200 });
  }
  static redirect(url) {
    return new NextResponse(null, { status: 302, headers: { location: String(url) } });
  }
}

function loadTs(path, imports) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (!(id in imports)) throw new Error(`Unexpected import ${id} in ${path}`);
    return imports[id];
  };
  new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}

const accounts = {
  A1: { marketplaceAccountId: "A1", companyId: "C1" },
  A2: { marketplaceAccountId: "A2", companyId: "C1" },
  B1: { marketplaceAccountId: "B1", companyId: "C2" },
};
const lookupMarketplaceAccount = async (id) => accounts[id] ?? null;
const membership = async () => ({ companyIds: ["C1"], marketplaceAccountIds: ["A1"] });
const secrets = loadTs("src/lib/security/secrets.ts", {});
const internalRequest = (request) => request.headers.get("authorization") === `Bearer ${INTERNAL}`;
const requireAuth = async (request) => {
  if (internalRequest(request)) return { id: "service:internal", app_metadata: {} };
  const principal = request.headers.get("x-offline-principal");
  if (!principal) return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
  return {
    id: principal,
    app_metadata: { orion: { role: principal === "admin" ? "administrator" : "viewer" } },
  };
};
const authHelpers = {
  requireAuth,
  isAuthFailure: (value) => value instanceof NextResponse,
  isInternalServiceRequest: internalRequest,
};
const tenantMembership = { lookupMarketplaceAccount, resolveTenantMembership: membership };
const tenantScope = loadTs("src/lib/security/tenant-scope.ts", {
  "@/lib/security/tenant-membership": tenantMembership,
});
const authorize = loadTs("src/lib/security/authorize.ts", {
  "next/server": { NextResponse },
  "@/lib/security/require-auth": authHelpers,
  "@/lib/security/tenant-membership": tenantMembership,
  "@/lib/security/tenant-scope": tenantScope,
  "@/lib/filter-params": { FILTER_PARAMS: { account: "account", company: "company" } },
});
const admin = loadTs("src/lib/security/admin-authorization.ts", {
  "next/server": { NextResponse },
  "@/lib/security/require-auth": authHelpers,
  "@/lib/security/tenant-membership": {
    readTenantClaims: (user) => ({ role: user.app_metadata?.orion?.role ?? null }),
  },
});

const calls = [];
const route = loadTs("src/app/api/sync/commercial-continuity/route.ts", {
  "next/server": { NextResponse },
  "@/lib/security/authorize": authorize,
  "@/lib/security/require-auth": authHelpers,
  "@/lib/security/admin-authorization": admin,
  "@/lib/security/tenant-membership": tenantMembership,
  "@/lib/security/secrets": secrets,
  "@/lib/commercial-continuity/execution-bounds": { COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS: 1000 },
  "@/lib/wildberries/sync-log": { syncLog() {} },
  "@/services/commercial-continuity-service": {
    async runCommercialContinuityTick(input) {
      calls.push(input);
      const selected = Object.keys(accounts).filter((id) => !input.marketplaceAccountId || id === input.marketplaceAccountId);
      return {
        accountsConsidered: selected.length,
        results: selected.map((id) => ({ marketplaceAccountId: id, status: "offline-only" })),
      };
    },
  },
});

const middleware = loadTs("src/middleware.ts", {
  "@supabase/ssr": {
    createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: activeRequest.headers.get("x-offline-principal") ? { id: "user" } : null } }) },
    }),
  },
  "next/server": { NextResponse },
  "@/lib/security/containment-gate": {
    CONTAINMENT_HEADER: "x-orion-internal-secret",
    hasContainmentAccess: async (request) => request.headers.get("x-offline-containment") === "yes" || internalRequest(request),
    containmentUnauthorizedResponse: () => NextResponse.json({ code: "CONTAINMENT_GATE" }, { status: 401 }),
    applyContainmentCookie: async (response) => response,
  },
  "@/lib/security/auth-paths": { isAuthPublicPath: () => false },
  "@/lib/supabase/env": { getSupabaseEnv: () => ({ isConfigured: true, url: "https://offline.invalid", anonKey: "offline" }) },
  "@/lib/security/secrets": secrets,
});
let activeRequest;

async function scenario(label, { account, principal, bearer, containment = false, method = "GET", body } = {}) {
  calls.length = 0;
  const url = new URL("https://offline.invalid/api/sync/commercial-continuity");
  if (account !== undefined) url.searchParams.set("marketplaceAccountId", account);
  const headers = new Headers();
  if (principal) headers.set("x-offline-principal", principal);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (containment) headers.set("x-offline-containment", "yes");
  if (body !== undefined) headers.set("content-type", "application/json");
  const request = new Request(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  request.nextUrl = new URL(request.url);
  request.cookies = { getAll: () => [], set() {} };
  activeRequest = request;
  const gate = await middleware.middleware(request);
  const response = gate.status === 200
    ? await route[method](request)
    : gate;
  const payload = await response.json().catch(() => ({}));
  const result = { label, middleware: gate.status, status: response.status, code: payload.code ?? null,
    accounts: payload.results?.map((row) => row.marketplaceAccountId) ?? [], calls: calls.length };
  console.log(JSON.stringify(result));
  return result;
}

const A = await scenario("A unauthenticated", { account: "A1", containment: true });
assert.equal(A.status, 401); assert.equal(A.calls, 0);
const B = await scenario("B own account", { account: "A1", principal: "user", containment: true });
assert.equal(B.status, 200); assert.deepEqual(B.accounts, ["A1"]);
const C = await scenario("C foreign account", { account: "A2", principal: "user", containment: true });
assert.equal(C.status, 403); assert.equal(C.calls, 0); assert.deepEqual(C.accounts, []);
const D = await scenario("D omitted account", { principal: "user", containment: true });
assert.equal(D.status, 400); assert.equal(D.calls, 0);
const E = await scenario("E admin account", { account: "A2", principal: "admin", containment: true });
assert.equal(E.status, 200); assert.deepEqual(E.accounts, ["A2"]);
const F = await scenario("F cron secret", { bearer: CRON });
assert.equal(F.middleware, 200); assert.equal(F.status, 200); assert.deepEqual(F.accounts, ["A1", "A2", "B1"]);
const Fbad = await scenario("F invalid cron secret", { bearer: "wrong" });
assert.equal(Fbad.middleware, 401); assert.equal(Fbad.calls, 0);
const Finternal = await scenario("F internal secret", { bearer: INTERNAL });
assert.equal(Finternal.status, 200); assert.equal(Finternal.calls, 1);
const G = await scenario("G nonexistent account", { account: "absent", principal: "user", containment: true });
assert.equal(G.status, 403); assert.equal(G.calls, 0);
const Ginternal = await scenario("G internal nonexistent account", { account: "absent", bearer: INTERNAL });
assert.equal(Ginternal.status, 403); assert.equal(Ginternal.calls, 0);
const Gempty = await scenario("G empty account", { account: "", principal: "user", containment: true });
assert.equal(Gempty.status, 400); assert.equal(Gempty.calls, 0);
const Gbody = await scenario("G malformed POST body", { principal: "user", containment: true, method: "POST", body: { marketplaceAccountId: {} } });
assert.equal(Gbody.status, 400); assert.equal(Gbody.calls, 0);

let globalTickReads = 0;
const statusRoute = loadTs("src/app/api/sync/commercial-continuity/status/route.ts", {
  "next/server": { NextResponse },
  "@/lib/security/authorize": authorize,
  "@/lib/security/admin-authorization": admin,
  "@/lib/security/require-auth": authHelpers,
  "@/lib/security/tenant-membership": tenantMembership,
  "@/services/commercial-continuity-service": {
    getAccountCommercialFreshness: async (id) => [{ entity: "finance", marketplaceAccountId: id }],
    listEligibleCommercialAccounts: async (ids) => Object.keys(accounts)
      .filter((id) => !ids || ids.includes(id))
      .map((id) => ({ id, account_name: `Account ${id}` })),
    resolveCommercialSyncIntervalMinutes: async () => 60,
  },
  "@/lib/supabase/admin": {
    createAdminClient: () => {
      globalTickReads += 1;
      const chain = { from: () => chain, select: () => chain, order: () => chain,
        limit: () => chain, maybeSingle: async () => ({ data: { accounts_considered: 3 } }) };
      return chain;
    },
  },
});
async function statusScenario(account, principal, bearer) {
  const url = new URL("https://offline.invalid/api/sync/commercial-continuity/status");
  if (account) url.searchParams.set("marketplaceAccountId", account);
  const headers = new Headers();
  if (principal) headers.set("x-offline-principal", principal);
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  const response = await statusRoute.GET(new Request(url, { headers }));
  return { status: response.status, body: await response.json() };
}
const ownStatus = await statusScenario("A1", "user");
assert.equal(ownStatus.status, 200);
assert.deepEqual(ownStatus.body.eligibleAccounts.map((row) => row.id), ["A1"]);
assert.equal(ownStatus.body.lastTick, null);
assert.equal(globalTickReads, 0);
const foreignStatus = await statusScenario("A2", "user");
assert.equal(foreignStatus.status, 403);
const defaultStatus = await statusScenario(undefined, "user");
assert.deepEqual(defaultStatus.body.eligibleAccounts.map((row) => row.id), ["A1"]);
const adminStatus = await statusScenario("A2", "admin");
assert.equal(adminStatus.status, 200);
assert.equal(adminStatus.body.marketplaceAccountId, "A2");
assert.deepEqual(adminStatus.body.eligibleAccounts.map((row) => row.id), ["A1", "A2", "B1"]);
const internalStatus = await statusScenario(undefined, undefined, INTERNAL);
assert.equal(internalStatus.status, 200);
assert.deepEqual(internalStatus.body.eligibleAccounts.map((row) => row.id), ["A1", "A2", "B1"]);
assert.equal(internalStatus.body.lastTick.accounts_considered, 3);
assert.equal(globalTickReads, 2);

let eligibleQueries = 0;
const commercialService = loadTs("src/services/commercial-continuity-service.ts", {
  "@/lib/supabase/admin": {
    createAdminClient: () => ({
      from: () => {
        eligibleQueries += 1;
        let ids;
        const query = {
          select: () => query,
          eq: () => query,
          in: (_column, values) => { ids = values; return query; },
          order: async () => ({ data: Object.keys(accounts)
            .filter((id) => !ids || ids.includes(id))
            .map((id) => ({ id, account_name: `Account ${id}`, is_active: true, sync_enabled: true })), error: null }),
        };
        return query;
      },
    }),
  },
  "@/lib/marketplace-account-visibility": { filterOperationalMarketplaceAccounts: (rows) => rows },
  "@/lib/commercial-continuity/classify": {},
  "@/lib/commercial-continuity/persist-outcome": {},
  "@/lib/commercial-continuity/types": {},
  "@/lib/commercial-continuity/window": {},
  "@/lib/production-health/score": {},
  "@/lib/platform-config/provider": {},
  "@/lib/wildberries/sync-log": {},
  "@/services/commercial-entity-sync-state-service": {},
  "@/services/sync-job-service": {},
});
assert.deepEqual((await commercialService.listEligibleCommercialAccounts(["A1"])).map((row) => row.id), ["A1"]);
assert.deepEqual(await commercialService.listEligibleCommercialAccounts([]), []);
assert.equal(eligibleQueries, 1);
console.log("PASS commercial continuity authorization offline scenarios");
