#!/usr/bin/env node
/**
 * Explicitly activate Account 2 Finance recovery campaign isolation.
 * No Wildberries API calls. No DB writes.
 *
 * Usage: npm run campaign:account2-finance:activate
 */
import { readFileSync, existsSync } from "fs";
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

const { activateFinanceRecoveryCampaign } = await import(
  "../src/lib/finance-recovery/coordination.ts"
);

const existing = existsSync(PROGRESS_PATH)
  ? JSON.parse(readFileSync(PROGRESS_PATH, "utf8"))
  : { accountId: ACCOUNT_ID };

if (String(existing.accountId ?? ACCOUNT_ID) !== ACCOUNT_ID) {
  console.error(`Refusing to activate: progress accountId=${existing.accountId}`);
  process.exit(2);
}

const next = activateFinanceRecoveryCampaign({
  marketplaceAccountId: ACCOUNT_ID,
  progress: {
    ...existing,
    accountId: ACCOUNT_ID,
  },
  progressPath: PROGRESS_PATH,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      campaignStatus: next.campaignStatus,
      campaignActivatedAt: next.campaignActivatedAt,
      recoveryActive: next.recoveryActive ?? false,
      serverRetryUntil: next.serverRetryUntil ?? null,
      note: "Account 2 Finance is reserved; Commercial Continuity must skip Finance. No WB call made.",
    },
    null,
    2
  )
);
