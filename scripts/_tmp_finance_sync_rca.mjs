/**
 * Evidence-only: why finance sync stopped after 2026-07-05.
 * NO writes. NO sync. Read-only DB + local progress files.
 */
import { createRequire } from "module";
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { resolve, join } from "path";

const require = createRequire(import.meta.url);

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const sb = createAdminClient();

async function countExact(table, filters) {
  let q = sb.from(table).select("*", { count: "exact", head: true });
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (v && typeof v === "object" && v.op === "gte") q = q.gte(k, v.v);
    else if (v && typeof v === "object" && v.op === "lte") q = q.lte(k, v.v);
    else if (v && typeof v === "object" && v.op === "gt") q = q.gt(k, v.v);
    else q = q.eq(k, v);
  }
  const { count, error } = await q;
  return { count, error: error?.message ?? null };
}

// --- Step 1/6: account sync state ---
const { data: accounts, error: accErr } = await sb
  .from("marketplace_accounts")
  .select(
    "id,name,marketplace,sync_enabled,last_sync_at,last_successful_sync_at,last_sync_status,created_at,updated_at,company_id"
  )
  .order("id");

// Try extra columns if present
const { data: accountsFull } = await sb.from("marketplace_accounts").select("*").order("id");
const accountCols = accountsFull?.[0] ? Object.keys(accountsFull[0]) : [];
const accountSafe = (accountsFull ?? []).map((a) => {
  const copy = { ...a };
  for (const k of Object.keys(copy)) {
    if (/token|key|secret|encrypt|password|api/i.test(k)) {
      const v = copy[k];
      copy[k] =
        v == null || v === ""
          ? null
          : typeof v === "string"
            ? `[REDACTED len=${v.length}]`
            : "[REDACTED]";
    }
  }
  return copy;
});

// --- Step 4: wb_finance newest ---
const financeByAccount = {};
for (const acc of accounts ?? [{ id: 1 }, { id: 2 }]) {
  const id = String(acc.id);
  const { data: newest } = await sb
    .from("wb_finance")
    .select("id,operation_date,operation_type,amount,srid,source_key,nm_id,product_id")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(5);

  const { data: oldestRecent } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", id)
    .order("operation_date", { ascending: false })
    .limit(1);

  const total = await countExact("wb_finance", { marketplace_account_id: id });
  const afterJul5 = await countExact("wb_finance", {
    marketplace_account_id: id,
    operation_date: { op: "gt", v: "2026-07-05" },
  });
  const onJul5 = await countExact("wb_finance", {
    marketplace_account_id: id,
    operation_date: "2026-07-05",
  });
  const week = await countExact("wb_finance", {
    marketplace_account_id: id,
    operation_date: { op: "gte", v: "2026-07-13" },
  });
  // also lte for week - do separate
  const weekFull = await (async () => {
    const { count, error } = await sb
      .from("wb_finance")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", id)
      .gte("operation_date", "2026-07-13")
      .lte("operation_date", "2026-07-19");
    return { count, error: error?.message ?? null };
  })();

  // Daily histogram Jul 1-20
  const daily = {};
  for (let d = 1; d <= 20; d++) {
    const day = `2026-07-${String(d).padStart(2, "0")}`;
    daily[day] = (
      await countExact("wb_finance", {
        marketplace_account_id: id,
        operation_date: day,
      })
    ).count;
  }

  // Parse newest source_key for rrd ids
  const rrdFromSource = (newest ?? []).map((r) => {
    const m = String(r.source_key ?? "").match(/rrd:(\d+):/);
    return { source_key: r.source_key, rrd_id: m ? m[1] : null, ...r };
  });

  financeByAccount[id] = {
    totalRows: total,
    rowsAfterJul5: afterJul5,
    rowsOnJul5: onJul5,
    rowsWeekJul13_19: weekFull,
    newestRows: rrdFromSource,
    maxOperationDate: oldestRecent?.[0]?.operation_date ?? null,
    dailyJul1_20: daily,
  };
}

// --- Sales coverage for same period (proves token works for other entities) ---
const salesByAccount = {};
for (const acc of accounts ?? [{ id: 1 }]) {
  const id = String(acc.id);
  const { data: newestSales } = await sb
    .from("wb_sales")
    .select("srid,sale_date,for_pay,is_return")
    .eq("marketplace_account_id", id)
    .order("sale_date", { ascending: false })
    .limit(3);
  const salesWeek = await (async () => {
    const { count, error } = await sb
      .from("wb_sales")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", id)
      .gte("sale_date", "2026-07-13")
      .lte("sale_date", "2026-07-19T23:59:59");
    return { count, error: error?.message ?? null };
  })();
  const salesAfterJul5 = await (async () => {
    const { count, error } = await sb
      .from("wb_sales")
      .select("*", { count: "exact", head: true })
      .eq("marketplace_account_id", id)
      .gt("sale_date", "2026-07-05T23:59:59");
    return { count, error: error?.message ?? null };
  })();
  salesByAccount[id] = { newestSales, salesWeek, salesAfterJul5 };
}

// --- Local progress / logs ---
function listDirSafe(p) {
  if (!existsSync(p)) return null;
  return readdirSync(p).map((name) => {
    const full = join(p, name);
    const st = statSync(full);
    return { name, size: st.size, mtime: st.mtime.toISOString(), isDir: st.isDirectory() };
  });
}

const progressFiles = {};
const candidates = [
  "exports/finance-backfill",
  "exports/finance-sync",
  "exports",
];
for (const dir of candidates) {
  const list = listDirSafe(resolve(dir));
  if (!list) continue;
  const relevant = list.filter((f) => /finance|sync|progress/i.test(f.name));
  progressFiles[dir] = relevant;
  for (const f of relevant) {
    if (f.isDir) continue;
    if (!/\.json$/i.test(f.name)) continue;
    if (f.size > 2_000_000) continue;
    try {
      const raw = readFileSync(resolve(dir, f.name), "utf8");
      progressFiles[`${dir}/${f.name}`] = JSON.parse(raw);
    } catch {
      progressFiles[`${dir}/${f.name}`] = { parseError: true };
    }
  }
}

// Specific known progress paths
for (const p of [
  "exports/finance-backfill/progress-1.json",
  "exports/finance-backfill/progress-2.json",
  "exports/finance-backfill/last-run.json",
]) {
  if (existsSync(resolve(p))) {
    try {
      progressFiles[p] = JSON.parse(readFileSync(resolve(p), "utf8"));
    } catch (e) {
      progressFiles[p] = { error: String(e) };
    }
  }
}

// Check .perf timings for finance
let perfFinanceHints = [];
const perfPath = resolve(".perf/timings.jsonl");
if (existsSync(perfPath)) {
  const lines = readFileSync(perfPath, "utf8").trim().split("\n").slice(-500);
  for (const line of lines) {
    if (/finance/i.test(line)) {
      try {
        perfFinanceHints.push(JSON.parse(line));
      } catch {
        perfFinanceHints.push(line.slice(0, 200));
      }
    }
  }
  perfFinanceHints = perfFinanceHints.slice(-30);
}

const out = {
  investigatedAt: new Date().toISOString(),
  step1_accountState: {
    accErr: accErr?.message ?? null,
    accountColumns: accountCols,
    accounts: accountSafe,
    accountsMinimal: accounts,
  },
  step4_financeDb: financeByAccount,
  salesCoverage: salesByAccount,
  localProgressAndLogs: {
    listed: Object.fromEntries(
      Object.entries(progressFiles).filter(([, v]) => Array.isArray(v))
    ),
    files: Object.fromEntries(
      Object.entries(progressFiles).filter(([, v]) => !Array.isArray(v))
    ),
  },
  perfFinanceHints,
};
writeFileSync(
  "exports/finance-sync-rootcause-evidence.json",
  JSON.stringify(out, null, 2)
);
console.log(
  JSON.stringify(
    {
      accounts: (accounts ?? []).map((a) => ({
        id: a.id,
        sync_enabled: a.sync_enabled,
        last_sync_at: a.last_sync_at,
        last_successful_sync_at: a.last_successful_sync_at,
        last_sync_status: a.last_sync_status,
      })),
      finance: Object.fromEntries(
        Object.entries(financeByAccount).map(([id, v]) => [
          id,
          {
            maxOp: v.maxOperationDate,
            total: v.totalRows.count,
            afterJul5: v.rowsAfterJul5.count,
            week: v.rowsWeekJul13_19.count,
            onJul5: v.rowsOnJul5.count,
            newest: v.newestRows[0],
            dailyTail: Object.fromEntries(
              Object.entries(v.dailyJul1_20).filter(([, c]) => (c ?? 0) > 0)
            ),
          },
        ])
      ),
      sales: salesByAccount,
      progressKeys: Object.keys(progressFiles),
    },
    null,
    2
  )
);
