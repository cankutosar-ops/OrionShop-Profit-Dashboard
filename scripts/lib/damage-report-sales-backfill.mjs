/**
 * Damage Report — controlled historical sales backfill helpers.
 * Account-wide WB Statistics Sales API; SKU filter applied after fetch.
 * Does not calculate compensation. Does not create stub products.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { resolve } from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

export const DAMAGE_BACKFILL_DIR = resolve("exports/damage-report/backfill");

export const DEFAULTS = {
  batchDays: Number(process.env.DAMAGE_BACKFILL_BATCH_DAYS || 30),
  successDelayMs: Number(process.env.DAMAGE_BACKFILL_SUCCESS_DELAY_MS || 60_000),
  max429Attempts: Number(process.env.DAMAGE_BACKFILL_MAX_429_ATTEMPTS || 3),
  max5xxAttempts: Number(process.env.DAMAGE_BACKFILL_MAX_5XX_ATTEMPTS || 3),
  /** User-specified 429 schedule: ~60s, ~120s, ~300s */
  retry429ScheduleMs: [60_000, 120_000, 300_000],
  retry5xxScheduleMs: [30_000, 60_000, 120_000],
  lockStaleMs: 4 * 60 * 60_000,
  pilotSkuLimit: 5,
  /** Stop after N batches attempted (success or fail). 0 = unlimited. */
  maxBatches: Number(process.env.DAMAGE_BACKFILL_MAX_BATCHES || 0),
};

export const ACCOUNT_FILE_MAP = [
  {
    marketplaceAccountId: "1",
    legalName: "ИП Галиева Ошар Гузель Ирековна",
    accountNameExpected: "Wildberries Default",
    file: "C:/Users/User/Downloads/Firma1_Guzel_SKU_Bazli_Kayiplar_DUZELTILMIS.xlsx",
    mappingEvidence: "catalog_nm_match + sellerFinanceName exports",
  },
  {
    marketplaceAccountId: "2",
    legalName: "ИП Галиева Лилия Фаисовна",
    accountNameExpected: "Orion shop",
    file: "C:/Users/User/Downloads/Firma2_Lilia_SKU_Bazli_Kayiplar_DUZELTILMIS.xlsx",
    mappingEvidence: "catalog_nm_match (102/102); zero overlap with account 1",
  },
];

export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(name), "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
      }
    } catch {
      // ignore
    }
  }
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export function parseRuDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function progressPath(accountId) {
  return resolve(DAMAGE_BACKFILL_DIR, `progress-${accountId}.json`);
}

function lockPath(accountId) {
  return resolve(DAMAGE_BACKFILL_DIR, `lock-${accountId}.json`);
}

export function loadProgress(accountId) {
  const path = progressPath(accountId);
  if (!existsSync(path)) {
    return {
      completedBatches: {},
      failedBatches: {},
      pendingBatches: [],
      skuStates: {},
      metrics: {
        apiRequests: 0,
        successfulRequests: 0,
        responses429: 0,
        otherRetryableErrors: 0,
        totalRetries: 0,
        rowsReceived: 0,
        rowsUpserted: 0,
        periodsSkippedAlreadyComplete: 0,
        periodsBackfilled: 0,
      },
      meta: {},
    };
  }
  const state = JSON.parse(readFileSync(path, "utf8"));
  state.completedBatches ??= {};
  state.failedBatches ??= {};
  state.pendingBatches ??= [];
  state.skuStates ??= {};
  state.metrics ??= {};
  state.meta ??= {};
  return state;
}

export function saveProgress(accountId, state) {
  mkdirSync(DAMAGE_BACKFILL_DIR, { recursive: true });
  state.meta.lastSavedAt = new Date().toISOString();
  writeFileSync(progressPath(accountId), JSON.stringify(state, null, 2));
}

export function acquireLock(accountId, staleMs = DEFAULTS.lockStaleMs) {
  mkdirSync(DAMAGE_BACKFILL_DIR, { recursive: true });
  const path = lockPath(accountId);
  if (existsSync(path)) {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    const age = Date.now() - new Date(lock.startedAt).getTime();
    if (age < staleMs) {
      throw new Error(
        `Damage backfill lock active for account ${accountId} (pid ${lock.pid}, started ${lock.startedAt})`
      );
    }
  }
  const lock = { pid: process.pid, startedAt: new Date().toISOString(), accountId };
  writeFileSync(path, JSON.stringify(lock, null, 2));
  return lock;
}

export function releaseLock(accountId) {
  const path = lockPath(accountId);
  if (!existsSync(path)) return;
  try {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    if (lock.pid === process.pid) unlinkSync(path);
  } catch {
    // ignore
  }
}

export function batchKey(from, to) {
  return `${from}:${to}`;
}

/** Collapse sorted unique ISO dates into contiguous ranges, then chunk to batchDays. */
export function datesToBatches(sortedDates, batchDays = DEFAULTS.batchDays) {
  if (!sortedDates.length) return [];
  const ranges = [];
  let start = sortedDates[0];
  let prev = sortedDates[0];
  for (let i = 1; i < sortedDates.length; i++) {
    const cur = sortedDates[i];
    if (daysBetween(prev, cur) === 2) {
      // consecutive calendar days (diff 1 day between prev and cur means adjacent)
    }
    if (addDays(prev, 1) === cur) {
      prev = cur;
      continue;
    }
    ranges.push({ from: start, to: prev });
    start = cur;
    prev = cur;
  }
  ranges.push({ from: start, to: prev });

  const batches = [];
  for (const range of ranges) {
    let cursor = range.from;
    while (cursor <= range.to) {
      const end = addDays(cursor, batchDays - 1);
      const to = end < range.to ? end : range.to;
      batches.push({
        from: cursor,
        to,
        label: `${cursor} → ${to}`,
        key: batchKey(cursor, to),
      });
      if (to === range.to) break;
      cursor = addDays(to, 1);
    }
  }
  return batches;
}

/**
 * Parse lost SKUs from Excel.
 * Reference date = max(Rapor Tarihi) from PDF Satırları per nm_id (claim/report date).
 */
export function parseDamageExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const skuSheetName = wb.SheetNames.find((n) => /SKU/i.test(n)) ?? wb.SheetNames[0];
  const pdfSheetName = wb.SheetNames.find((n) => /PDF/i.test(n));

  const skuRows = XLSX.utils.sheet_to_json(wb.Sheets[skuSheetName], {
    defval: null,
    raw: false,
  });
  const pdfRows = pdfSheetName
    ? XLSX.utils.sheet_to_json(wb.Sheets[pdfSheetName], { defval: null, raw: false })
    : [];

  /** @type {Map<string, { nmId: number, article: string, lostQty: number, reportDates: string[], name: string|null }>} */
  const byNm = new Map();

  for (const row of skuRows) {
    const article = String(row["SKU / Satıcı Artikulü"] ?? "").trim();
    if (!article || article.toUpperCase() === "TOPLAM") continue;
    const nmRaw = row["WB Nomenklatura"];
    const nmId = Number(nmRaw);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    const qty = Number(String(row["Toplam Kayıp Adet"] ?? "").replace(",", ".")) || 0;
    const key = String(nmId);
    const existing = byNm.get(key);
    if (existing) {
      existing.lostQty += qty;
    } else {
      byNm.set(key, {
        nmId,
        article,
        lostQty: qty,
        reportDates: [],
        name: row["Ürün Adı"] != null ? String(row["Ürün Adı"]) : null,
      });
    }
  }

  for (const row of pdfRows) {
    const nmId = Number(row["WB Nomenklatura"]);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    const key = String(nmId);
    const parsed = parseRuDate(row["Rapor Tarihi"]);
    if (!byNm.has(key)) {
      const article = String(row["Satıcı Artikulü"] ?? "").trim() || `nm-${nmId}`;
      byNm.set(key, {
        nmId,
        article,
        lostQty: Number(row["Kayıp Adet"]) || 0,
        reportDates: [],
        name: row["Ürün Adı"] != null ? String(row["Ürün Adı"]) : null,
      });
    }
    if (parsed) byNm.get(key).reportDates.push(parsed);
  }

  const skus = [];
  for (const item of byNm.values()) {
    const dates = [...item.reportDates].sort();
    const referenceDate = dates.length ? dates[dates.length - 1] : null;
    const requiredStart = referenceDate ? addDays(referenceDate, -365) : null;
    skus.push({
      nmId: item.nmId,
      article: item.article,
      lostQty: item.lostQty,
      name: item.name,
      referenceDate,
      requiredStart,
      requiredEnd: referenceDate,
      reportDateMin: dates[0] ?? null,
      reportDateMax: dates.length ? dates[dates.length - 1] : null,
    });
  }

  return {
    filePath,
    skuSheetName,
    pdfSheetName,
    skus: skus.sort((a, b) => a.nmId - b.nmId),
  };
}

export function isRateLimitedError(message) {
  const m = String(message).toLowerCase();
  return m.includes("429") || m.includes("too many requests") || m.includes("rate limit");
}

export function isRetryableServerError(message) {
  return /\b(500|502|503|504)\b/.test(String(message));
}

export function missingDays(
  requiredStart,
  requiredEnd,
  coveredDays,
  completedBatches,
  syncedEra = null
) {
  const completedDaySet = new Set();
  for (const key of Object.keys(completedBatches ?? {})) {
    const [from, to] = key.split(":");
    for (const d of enumerateDays(from, to)) completedDaySet.add(d);
  }
  const missing = [];
  for (const d of enumerateDays(requiredStart, requiredEnd)) {
    if (coveredDays.has(d) || completedDaySet.has(d)) continue;
    // Days inside the account's observed sales era with no rows = verified empty calendar days
    // (normal sync already covered the era; zero sales that day is legitimate).
    if (
      syncedEra?.min &&
      syncedEra?.max &&
      d >= syncedEra.min &&
      d <= syncedEra.max
    ) {
      continue;
    }
    missing.push(d);
  }
  return missing;
}

function enumerateDays(start, end) {
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function pickPilotSkus(skus, catalogSet, salesPresenceMap, limit = DEFAULTS.pilotSkuLimit) {
  const withRef = skus.filter((s) => s.referenceDate);
  const picked = [];
  const take = (pred) => {
    for (const s of withRef) {
      if (picked.length >= limit) break;
      if (picked.some((p) => p.nmId === s.nmId)) continue;
      if (pred(s)) picked.push(s);
    }
  };
  take((s) => catalogSet.has(s.nmId) && salesPresenceMap.get(s.nmId));
  take((s) => catalogSet.has(s.nmId) && !salesPresenceMap.get(s.nmId));
  take((s) => !catalogSet.has(s.nmId));
  take(() => true);
  return picked.slice(0, limit);
}
