import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { fetchWithSignal } from "../src/lib/supabase/fetch-with-signal.ts";
import { withOperationTimeout, OperationTimeoutError } from "../src/lib/operation-timeout.ts";
import { isAuthServiceFailure } from "../src/lib/security/auth-unavailable.ts";
import { recordPerfEvent, loadAllPerfEvents, runWithPerfRequest, getPerfRequestId } from "../src/lib/perf/perf-recorder.ts";

const originalFetch = globalThis.fetch;
const anyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any");
let transportAborted = 0;
try {
  Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
  globalThis.fetch = async (_input, init) => new Promise((resolve, reject) => {
    const onAbort = () => { transportAborted++; reject(init.signal.reason); };
    if (init.signal.aborted) onAbort();
    else init.signal.addEventListener("abort", onAbort, { once: true });
  });
  const original = new AbortController();
  const started = Date.now();
  await assert.rejects(withOperationTimeout(signal => fetchWithSignal("https://fixture.invalid", { signal: original.signal }, [signal]), 20), OperationTimeoutError);
  assert.equal(transportAborted, 1);
  assert.ok(Date.now() - started < 500);
  const budget = new AbortController();
  const pending = fetchWithSignal("https://fixture.invalid", { signal: original.signal }, [budget.signal]);
  original.abort(new Error("caller canceled"));
  await assert.rejects(pending, /caller canceled/);
  assert.equal(transportAborted, 2);
  budget.abort();
} finally {
  Object.defineProperty(AbortSignal, "any", anyDescriptor);
  globalThis.fetch = originalFetch;
}
for (const status of [429, 500, 502, 503, 504]) assert.equal(isAuthServiceFailure(new AuthApiError("outage", status, "fixture")), true);
assert.equal(isAuthServiceFailure(new AuthRetryableFetchError("network", 0)), true);
for (const status of [400, 401, 403]) assert.equal(isAuthServiceFailure(new AuthApiError("invalid", status, "fixture")), false);
console.log("PASS Edge transport without AbortSignal.any; actual abort; unavailable Auth vs invalid sessions");

const previousDirectory = process.cwd();
const previousEnvironment = process.env.NODE_ENV;
const previousAudit = process.env.PERF_AUDIT;
const temporary = await mkdtemp(join(tmpdir(), "orion-perf-default-"));
try {
  process.chdir(temporary);
  process.env.NODE_ENV = "production";
  delete process.env.PERF_AUDIT;
  runWithPerfRequest("/", () => {
    assert.equal(getPerfRequestId(), undefined);
    recordPerfEvent({ category: "sql", name: "fixture", durationMs: 1 });
  });
  assert.deepEqual(loadAllPerfEvents(), []);
  assert.equal(existsSync(".perf"), false, "ordinary production requests must not write audit files");
  process.env.PERF_AUDIT = "1";
  await runWithPerfRequest("/", async () => {
    assert.ok(getPerfRequestId());
    recordPerfEvent({ category: "sql", name: "fixture", durationMs: 1 });
  });
  assert.equal(loadAllPerfEvents().length, 1, "explicit audit remains available");
  assert.throws(() => runWithPerfRequest("/", () => { throw new Error("early failure"); }), /early failure/);
  assert.equal(getPerfRequestId(), undefined);
  console.log("PASS server performance audit: production default does no recording/disk writes; explicit opt-in works");
} finally {
  process.chdir(previousDirectory);
  if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment;
  if (previousAudit === undefined) delete process.env.PERF_AUDIT; else process.env.PERF_AUDIT = previousAudit;
  await rm(temporary, { recursive: true, force: true });
}
