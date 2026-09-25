/** Actual route responses plus the query fallback observed on Netlify on 2026-09-24. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { NextResponse } = require('next/server');
function load(path, imports) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((id) => {
    assert.ok(id in imports, `Unexpected dependency ${id}`);
    return imports[id];
  }, module, module.exports);
  return module.exports;
}
const origin = 'https://orionshop-dashboard.netlify.app';
const marker = 'sanitized-one-time-secret';
const helper = load('src/lib/security/auth-redirect-url.ts', {});
const safe = load('src/lib/security/safe-auth-redirect.ts', {});
let fail = false;
const calls = [];
const auth = { createAuthServerClient: async () => ({ auth: {
  verifyOtp: async (input) => { calls.push(input); return { error: fail ? {} : null }; },
  exchangeCodeForSession: async (code) => { calls.push(code); return { error: fail ? {} : null }; },
} }) };
const imports = { 'next/server': { NextResponse }, '@/lib/supabase/auth-server': auth,
  '@/lib/security/auth-redirect-url': helper, '@/lib/security/safe-auth-redirect': safe };
const confirm = load('src/app/auth/confirm/route.ts', imports);
const callback = load('src/app/auth/callback/route.ts', imports);
function platformLocation(request, location) {
  const result = new URL(location);
  if (!result.search) result.search = new URL(request.url).search;
  return result;
}
// Sanitized reproduction: the old queryless success redirect forwards the token.
const original = new Request(`${origin}/auth/confirm?type=recovery&token_hash=${marker}`);
assert.equal(platformLocation(original, `${origin}/auth/password`).searchParams.get('token_hash'), marker);
let checked = 0;
async function check(route, path, expected) {
  const request = new Request(origin + path);
  const response = await route.GET(request);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const location = platformLocation(request, response.headers.get('location'));
  assert.equal(location.href, origin + expected);
  for (const key of ['token_hash', 'code', 'type', 'next']) assert.equal(location.searchParams.has(key), false);
  assert.ok(!location.href.includes(marker));
  checked++;
}
for (const type of ['invite', 'recovery']) {
  await check(confirm, `/auth/confirm?type=${type}&token_hash=${marker}`, '/auth/password?_auth_redirect=1');
  assert.deepEqual(calls.at(-1), { token_hash: marker, type });
}
fail = true;
await check(confirm, `/auth/confirm?type=recovery&token_hash=${marker}`, '/login?error=confirmation_failed');
await check(callback, `/auth/callback?code=${marker}`, '/login?error=callback_failed');
fail = false;
await check(confirm, `/auth/confirm?type=unknown&token_hash=${marker}`, '/login?error=confirmation_failed');
await check(callback, `/auth/callback?code=${marker}`, '/?_auth_redirect=1');
assert.equal(calls.at(-1), marker);
await check(callback, `/auth/callback?code=${marker}&next=${encodeURIComponent('/inventory#history')}`, '/inventory?_auth_redirect=1#history');
await check(callback, `/auth/callback?code=${marker}&next=${encodeURIComponent('/reports?account=1')}`, '/reports?account=1');
await check(callback, `/auth/callback?code=${marker}&next=${encodeURIComponent('https://foreign.invalid')}`, '/?_auth_redirect=1');
console.log(`PASS: ${checked} Auth redirect cases; old hosted leak reproduced, consumed secrets not propagated, intended filters preserved`);
