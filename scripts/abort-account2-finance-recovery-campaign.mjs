#!/usr/bin/env node
/**
 * Explicitly abort Account 2 Finance recovery campaign isolation.
 * Does NOT delete Finance rows or roll back persisted pages.
 * No Wildberries API calls. No production Finance table writes.
 *
 * Usage: npm run campaign:account2-finance:abort
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const ACCOUNT_ID = "2";
const PROGRESS_PATH = resolve("exports/finance-backfill/account-2-recovery-progress.json");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), name), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

loadEnv();

const reason = process.argv.includes("--reason")
  ? process.argv[process.argv.indexOf("--reason") + 1]
  : "explicit_admin_abort";

const { abortFinanceRecoveryCampaign } = await import(
  "../src/lib/finance-recovery/coordination.ts"
);

const next = abortFinanceRecoveryCampaign({
  marketplaceAccountId: ACCOUNT_ID,
  progressPath: PROGRESS_PATH,
  reason,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      campaignStatus: next.campaignStatus,
      campaignAbortedAt: next.campaignAbortedAt,
      recoveryActive: next.recoveryActive,
      abortReason: next.abortReason,
      note: "Campaign aborted. Persisted Finance pages are retained. Account 2 CC Finance may resume.",
    },
    null,
    2
  )
);
