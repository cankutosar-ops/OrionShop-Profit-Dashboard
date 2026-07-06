#!/usr/bin/env node
/** Verify assertProductionValidationAllowed double-confirmation (no database access). */
import { assertProductionValidationAllowed, getValidationAccountId } from "./lib/validation-isolation.mjs";

function runCase(label, accountId, env, expectPass) {
  const saved = {
    allow: process.env.VALIDATION_ALLOW_PRODUCTION,
    confirm: process.env.VALIDATION_CONFIRM,
  };

  if (env.allow === undefined) delete process.env.VALIDATION_ALLOW_PRODUCTION;
  else process.env.VALIDATION_ALLOW_PRODUCTION = env.allow;

  if (env.confirm === undefined) delete process.env.VALIDATION_CONFIRM;
  else process.env.VALIDATION_CONFIRM = env.confirm;

  let passed = false;
  try {
    assertProductionValidationAllowed(accountId);
    passed = true;
  } catch {
    passed = false;
  }

  if (saved.allow === undefined) delete process.env.VALIDATION_ALLOW_PRODUCTION;
  else process.env.VALIDATION_ALLOW_PRODUCTION = saved.allow;

  if (saved.confirm === undefined) delete process.env.VALIDATION_CONFIRM;
  else process.env.VALIDATION_CONFIRM = saved.confirm;

  const ok = passed === expectPass;
  console.log(ok ? "PASS" : "FAIL", label, expectPass ? "(allowed)" : "(blocked)");
  return ok;
}

console.log("=== Validation guard verification ===\n");

let pass = true;

pass = runCase("production + no env vars", "2", {}, false) && pass;
pass = runCase("production + ALLOW only", "2", { allow: "1" }, false) && pass;
pass = runCase("production + CONFIRM only", "2", { confirm: "YES" }, false) && pass;
pass =
  runCase("production + ALLOW + wrong confirm", "2", { allow: "1", confirm: "yes" }, false) && pass;
pass =
  runCase("production + both vars set", "2", { allow: "1", confirm: "YES" }, true) && pass;
pass = runCase("non-production account + no env", "99", {}, true) && pass;

const resolved = getValidationAccountId("2");
pass = resolved === "2" && pass;
console.log(resolved === "2" ? "PASS" : "FAIL", "getValidationAccountId returns script argument");

console.log("\n" + (pass ? "PASS" : "FAIL"));
process.exit(pass ? 0 : 1);
