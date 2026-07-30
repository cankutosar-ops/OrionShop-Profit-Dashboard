/**
 * Schema + SRID existence + Step1 both-SRID value diffs.
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const sb = createAdminClient();

// 1) Discover columns via select *
const { data: oneRow, error: oneErr } = await sb
  .from("wb_finance")
  .select("*")
  .eq("marketplace_account_id", "1")
  .limit(1);
const cols = oneRow?.[0] ? Object.keys(oneRow[0]) : [];

// 2) Date distribution
const { data: dates } = await sb
  .from("wb_finance")
  .select("operation_date")
  .eq("marketplace_account_id", "1")
  .order("operation_date", { ascending: false })
  .limit(20);

const { data: datesAsc } = await sb
  .from("wb_finance")
  .select("operation_date")
  .eq("marketplace_account_id", "1")
  .order("operation_date", { ascending: true })
  .limit(5);

// Try alternate date-like fields from cols
const dateLike = cols.filter((c) => /date|dt|rr_|period/i.test(c));

const latestByField = {};
for (const f of dateLike.slice(0, 8)) {
  const { data } = await sb
    .from("wb_finance")
    .select(f)
    .eq("marketplace_account_id", "1")
    .not(f, "is", null)
    .order(f, { ascending: false })
    .limit(3);
  latestByField[f] = data;
}

// 3) Load excel both files and compare overlapping SRIDs
function load(path) {
  const wb = XLSX.readFile(path, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const map = (r, type) => ({
  type,
  srid: r.Srid == null ? null : String(r.Srid),
  justification: String(r["Обоснование для оплаты"] ?? ""),
  docType: String(r["Тип документа"] ?? ""),
  nmId: String(r["Код номенклатуры"] ?? ""),
  barcode: String(r["Баркод"] ?? ""),
  qty: num(r["Кол-во"]),
  ppvz: num(r["К перечислению Продавцу за реализованный Товар"]),
  logistics: num(r["Услуги по доставке товара покупателю"]),
  rebill: num(r["Возмещение издержек по перевозке/по складским операциям с товаром"]),
  storage: num(r["Хранение"]),
  penalties: num(r["Общая сумма штрафов"]),
  acceptance: num(r["Операции на приемке"]),
  holds: num(r["Удержания"]),
  saleDate: r["Дата продажи"] == null ? null : String(r["Дата продажи"]).slice(0, 10),
});

const PATH_OSN =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const PATH_VYK =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182329_1202289/Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx";

const osn = load(PATH_OSN).map((r) => map(r, "Основной")).filter((r) => r.srid);
const vyk = load(PATH_VYK).map((r) => map(r, "По выкупам")).filter((r) => r.srid);
const osnBy = new Map();
for (const r of osn) {
  if (!osnBy.has(r.srid)) osnBy.set(r.srid, []);
  osnBy.get(r.srid).push(r);
}
const vykBy = new Map();
for (const r of vyk) {
  if (!vykBy.has(r.srid)) vykBy.set(r.srid, []);
  vykBy.get(r.srid).push(r);
}
const both = [...osnBy.keys()].filter((s) => vykBy.has(s));
const onlyVyk = [...vykBy.keys()].filter((s) => !osnBy.has(s));
const onlyOsn = [...osnBy.keys()].filter((s) => !vykBy.has(s));

function sumKey(rows, key) {
  return Math.round(rows.reduce((a, r) => a + r[key], 0) * 100) / 100;
}
const bothCompare = both.map((srid) => {
  const a = osnBy.get(srid);
  const b = vykBy.get(srid);
  const keys = ["ppvz", "logistics", "rebill", "storage", "penalties", "acceptance", "holds", "qty"];
  const diffs = {};
  for (const k of keys) {
    const av = sumKey(a, k);
    const bv = sumKey(b, k);
    diffs[k] = { osn: av, vyk: bv, delta: Math.round((av - bv) * 100) / 100, same: Math.abs(av - bv) < 0.02 };
  }
  return {
    srid,
    osnLines: a.length,
    vykLines: b.length,
    osnJustifications: a.map((x) => x.justification),
    vykJustifications: b.map((x) => x.justification),
    osn: a,
    vyk: b,
    fieldDiffs: diffs,
    anyValueDiff: Object.values(diffs).some((d) => !d.same),
  };
});

// 4) SRID lookup with * only
const sample = osn.filter((r) => r.justification === "Продажа").slice(0, 5).map((r) => r.srid);
const sridHits = [];
for (const srid of sample) {
  const { data, error } = await sb.from("wb_finance").select("*").eq("srid", srid).limit(5);
  sridHits.push({
    srid,
    error: error?.message ?? null,
    count: data?.length ?? 0,
    sample: (data ?? []).map((r) => {
      const pick = {};
      for (const k of Object.keys(r)) {
        if (/srid|date|pay|amount|oper|rr|nm|barcode|category|delivery|storage|penalty|accept|account/i.test(k)) {
          pick[k] = r[k];
        }
      }
      return pick;
    }),
  });
}

// Count finance in July by whatever date field works
const julyCounts = {};
for (const f of dateLike) {
  const { count, error } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", "1")
    .gte(f, "2026-07-01")
    .lte(f, "2026-07-31");
  julyCounts[f] = { count, error: error?.message ?? null };
}

const out = {
  oneErr: oneErr?.message ?? null,
  columnCount: cols.length,
  columns: cols,
  dateLike,
  latestOperationDates: dates,
  earliestOperationDates: datesAsc,
  latestByField,
  julyCounts,
  step1: {
    osnRows: osn.length,
    vykRows: vyk.length,
    osnUnique: osnBy.size,
    vykUnique: vykBy.size,
    onlyOsn: onlyOsn.length,
    onlyVyk: onlyVyk.length,
    both: both.length,
    onlyVykSrids: onlyVyk,
    bothCompare,
    bothWithValueDiffs: bothCompare.filter((x) => x.anyValueDiff).length,
    bothIdenticalValues: bothCompare.filter((x) => !x.anyValueDiff).length,
  },
  sridHits,
};
writeFileSync("exports/_tmp_audit_schema_and_both.json", JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      cols: cols.length,
      dateLike,
      julyCounts,
      latestOp: dates?.[0],
      earliestOp: datesAsc?.[0],
      step1: {
        osnUnique: osnBy.size,
        vykUnique: vykBy.size,
        onlyOsn: onlyOsn.length,
        onlyVyk: onlyVyk.length,
        both: both.length,
        bothWithValueDiffs: bothCompare.filter((x) => x.anyValueDiff).length,
      },
      sridHits: sridHits.map((h) => ({ srid: h.srid, count: h.count, error: h.error, keys: Object.keys(h.sample[0] || {}) })),
    },
    null,
    2
  )
);
