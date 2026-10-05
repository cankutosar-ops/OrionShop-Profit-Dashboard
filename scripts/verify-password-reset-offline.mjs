import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { NextResponse } from 'next/server.js';

// Execute the real routes with isolated Auth doubles: never send recovery mail.
let mode = 'success';
let calls = [];
const logs = [];
const privateValue = 'PRIVATE_PROVIDER_MESSAGE';
const auth = {
  async resetPasswordForEmail(email, options) {
    calls.push({ method: 'reset', email, options });
    if (mode === 'transport') throw new Error(privateValue);
    return { error: mode === 'rate' ? { status: 429, message: privateValue } :
      mode === 'provider' ? { status: 500, message: privateValue } : null };
  },
  async verifyOtp(input) { calls.push({ method: 'otp', input }); return { error: mode === 'success' ? null : { message: privateValue } }; },
  async exchangeCodeForSession(code) { calls.push({ method: 'pkce', code }); return { error: mode === 'success' ? null : { message: privateValue } }; },
};
function load(path) {
  const source = readFileSync(path, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', compiled)((name) => {
    if (name === 'next/server') return { NextResponse };
    if (name === '@/lib/supabase/auth-server') return { createAuthServerClient: async () => {
      if (mode === 'config') throw new Error(privateValue);
      return { auth };
    } };
    if (name === '@/lib/security/auth-redirect-url') return load('src/lib/security/auth-redirect-url.ts');
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports, { error: (...args) => logs.push(args) });
  return module.exports;
}
const { POST } = load('src/app/api/auth/password-reset/route.ts');
const { GET } = load('src/app/auth/confirm/route.ts');
const origin = 'https://dashboard.example.invalid';
function request(email = 'test@example.invalid', requestOrigin = origin) {
  return new Request(`${origin}/api/auth/password-reset`, { method: 'POST', headers: { origin: requestOrigin, host: new URL(origin).host, 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
}
assert.equal((await POST(request('bad'))).status, 400);
assert.equal((await POST(request(undefined, 'https://foreign.example.invalid'))).status, 403);
assert.equal(calls.length, 0);
for (const [behavior, status] of [['success', 200], ['rate', 429], ['provider', 503], ['config', 503], ['transport', 503]]) {
  mode = behavior; calls = [];
  const response = await POST(request());
  assert.equal(response.status, status, behavior);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(calls.length, behavior === 'config' ? 0 : 1, 'no inline retry');
  const body = await response.json();
  if (status === 503) {
    assert.ok(body.requestId);
    assert.equal(response.headers.get('X-Request-Id'), body.requestId);
    assert.equal(body.ok, undefined);
  }
  assert.ok(!JSON.stringify(body).includes(privateValue));
}
assert.ok(!JSON.stringify(logs).includes(privateValue));
assert.ok(!JSON.stringify(logs).includes('test@example.invalid'));
mode = 'success';
for (const [query, method] of [['token_hash=sensitive-token&type=recovery', 'otp'], ['token_hash=sensitive-token&type=invite', 'otp'], ['code=sensitive-code', 'pkce']]) {
  calls = [];
  const response = await GET(new Request(`${origin}/auth/confirm?${query}`));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, method);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.pathname, '/auth/password');
  assert.ok(!location.search.includes('sensitive'));
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
}
calls = [];
assert.equal(new URL((await GET(new Request(`${origin}/auth/confirm?token_hash=bad&type=signup&code=bad`))).headers.get('location')).pathname, '/login');
assert.equal(calls.length, 0);
mode = 'provider';
assert.equal(new URL((await GET(new Request(`${origin}/auth/confirm?code=bad`))).headers.get('location')).pathname, '/login');

const baseEnv = { ...process.env, NETLIFY: 'true', CONTEXT: 'production' };
delete baseEnv.NEXT_PUBLIC_SUPABASE_URL;
delete baseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let guard = spawnSync(process.execPath, ['scripts/guard-build.mjs'], { env: baseEnv, encoding: 'utf8' });
assert.equal(guard.status, 1);
assert.ok(guard.stderr.includes('NEXT_PUBLIC_SUPABASE_URL'));
guard = spawnSync(process.execPath, ['scripts/guard-build.mjs'], { env: { ...baseEnv, CONTEXT: 'deploy-preview' }, encoding: 'utf8' });
assert.equal(guard.status, 0, guard.stderr);
guard = spawnSync(process.execPath, ['scripts/guard-build.mjs'], { env: { ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'offline-only' }, encoding: 'utf8' });
assert.equal(guard.status, 0, guard.stderr);
console.log('PASS: reset validation, error privacy, reference IDs, no retries, OTP/PKCE redirects, production build config and isolated previews');
