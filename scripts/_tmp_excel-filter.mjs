/**
 * Re-sum Excel for 2026-01-01→2026-07-19: Основной only + unique weeks.
 */
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const EXCEL =
  "C:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";
const FROM = "2026-01-01";
const TO = "2026-07-19";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const toYmd = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};
const overlaps = (a, b, from, to) => a <= to && b >= from;

const wb = XLSX.readFile(EXCEL, { cellDates: true });
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: null,
  raw: true,
});
const header = grid[0].map((h) => String(h ?? ""));
console.log("HEADER", header);

const idx = Object.fromEntries(header.map((h, i) => [h, i]));
// corrupted column 13
const otherIdx =
  idx["Прочие удержания/выплаты"] ??
  header.findIndex((h) => /удерж/i.test(h) || h === '"x' || h === "x");

const rows = [];
for (let i = 1; i < grid.length; i++) {
  const r = grid[i];
  if (!r?.[0]) continue;
  const start = toYmd(r[idx["Дата начала"]]);
  const end = toYmd(r[idx["Дата конца"]]);
  const type = r[idx["Тип отчета"]];
  if (!start || !end) continue;
  if (!overlaps(start, end, FROM, TO)) continue;
  rows.push({
    id: String(r[idx["№ отчета"]]),
    start,
    end,
    type: type == null ? null : String(type),
    prodazha: num(r[idx["Продажа"]]),
    k: num(r[idx["К перечислению за товар"]]),
    logistics: num(r[idx["Стоимость логистики"]]),
    storage: num(r[idx["Стоимость хранения"]]),
    acceptance: num(r[idx["Стоимость операций на приемке"]]),
    other: otherIdx >= 0 ? num(r[otherIdx]) : 0,
    penalties: num(r[idx["Общая сумма штрафов"]]),
    totalPay: num(r[idx["Итого к оплате"]]),
    vvAdj: num(r[idx["Корректировка Вознаграждения Вайлдберриз (ВВ)"]]),
    loyaltyCost: num(r[idx["Стоимость участия в программе лояльности"]]),
    loyaltyPoints: num(r[idx["Сумма баллов, удержанных по программе лояльности"]]),
    oneTime: num(r[idx["Разовое изменение срока перечисления денежных средств"]]),
  });
}

const types = {};
for (const r of rows) types[r.type ?? "null"] = (types[r.type ?? "null"] || 0) + 1;

function sumSet(list) {
  const s = {
    n: list.length,
    prodazha: 0,
    k: 0,
    logistics: 0,
    storage: 0,
    acceptance: 0,
    other: 0,
    penalties: 0,
    totalPay: 0,
    vvAdj: 0,
    loyaltyCost: 0,
    loyaltyPoints: 0,
    oneTime: 0,
  };
  for (const r of list) {
    s.prodazha += r.prodazha;
    s.k += r.k;
    s.logistics += r.logistics;
    s.storage += r.storage;
    s.acceptance += r.acceptance;
    s.other += r.other;
    s.penalties += r.penalties;
    s.totalPay += r.totalPay;
    s.vvAdj += r.vvAdj;
    s.loyaltyCost += r.loyaltyCost;
    s.loyaltyPoints += r.loyaltyPoints;
    s.oneTime += r.oneTime;
  }
  for (const k of Object.keys(s)) if (k !== "n") s[k] = r2(s[k]);
  s.impliedFee = r2(s.prodazha - s.k);
  s.formulaTotal = r2(
    s.k - s.logistics - s.storage - s.acceptance - s.other - s.penalties
  );
  // try with extra columns
  s.formulaTotalPlusExtras = r2(
    s.k -
      s.logistics -
      s.storage -
      s.acceptance -
      s.other -
      s.penalties -
      s.vvAdj -
      s.loyaltyCost -
      s.loyaltyPoints -
      s.oneTime
  );
  s.delta_total_vs_formula = r2(s.totalPay - s.formulaTotal);
  s.delta_total_vs_formulaPlus = r2(s.totalPay - s.formulaTotalPlusExtras);
  return s;
}

const osnovnoy = rows.filter((r) => /основн/i.test(r.type || ""));
const uniqueByWeek = [];
const seen = new Set();
for (const r of [...osnovnoy].sort((a, b) => a.start.localeCompare(b.start))) {
  const key = `${r.start}|${r.end}`;
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueByWeek.push(r);
}

// Also: weeks fully inside period (date_from >= FROM && date_to <= TO)
const contained = uniqueByWeek.filter((r) => r.start >= FROM && r.end <= TO);

const out = {
  header,
  otherIdx,
  allOverlapping: { count: rows.length, types, sum: sumSet(rows) },
  osnovnoyOnly: { count: osnovnoy.length, sum: sumSet(osnovnoy) },
  uniqueOsnovnoyWeeks: {
    count: uniqueByWeek.length,
    sum: sumSet(uniqueByWeek),
    weeks: uniqueByWeek.map((r) => ({
      id: r.id,
      start: r.start,
      end: r.end,
      k: r.k,
      totalPay: r.totalPay,
    })),
  },
  containedInPeriod: { count: contained.length, sum: sumSet(contained) },
};

writeFileSync("exports/excel-period-sums.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  types,
  all: out.allOverlapping.sum,
  osnovnoy: out.osnovnoyOnly.sum,
  unique: out.uniqueOsnovnoyWeeks.sum,
  contained: out.containedInPeriod.sum,
  uniqueWeekCount: uniqueByWeek.length,
}, null, 2));
