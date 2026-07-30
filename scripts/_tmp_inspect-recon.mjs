import { readFileSync, writeFileSync } from "fs";
const j = JSON.parse(
  readFileSync("exports/revenue-reconciliation-2026-01-01_2026-07-19.json", "utf8")
);
const weeks = j.excelWeeks || [];
const byYear = {};
for (const w of weeks) {
  const y = w.start.slice(0, 4);
  byYear[y] = (byYear[y] || 0) + 1;
}
let bad = 0;
const mismatches = [];
for (const w of weeks) {
  const calc =
    w.kPerechisleniyu -
    w.logistics -
    w.storage -
    w.acceptance -
    w.otherHold -
    w.penalties;
  if (Math.abs(calc - w.totalPay) > 2) {
    bad++;
    if (mismatches.length < 8) {
      mismatches.push({
        id: w.id,
        start: w.start,
        end: w.end,
        calc: Math.round(calc * 100) / 100,
        totalPay: w.totalPay,
        delta: Math.round((calc - w.totalPay) * 100) / 100,
        otherHold: w.otherHold,
      });
    }
  }
}
const starts = weeks.map((w) => w.start).sort();
const out = {
  header: j.excelHeader,
  weekCount: j.excelWeekCount,
  dateSpan: j.excel.dateSpan,
  byYear,
  types: [...new Set(weeks.map((w) => w.type))],
  identityMismatches: bad,
  mismatchSamples: mismatches,
  first: weeks.slice(0, 3),
  last: weeks.slice(-3),
  excelTotals: j.excel,
  db: j.db,
  gaps: {
    salesForPay_minus_excelK: j.db.salesForPay - j.excel.kPerechisleniyu,
    financeForPay_minus_excelK:
      j.db.finance.financeNetForPay_signed - j.excel.kPerechisleniyu,
  },
};
writeFileSync("exports/revenue-recon-inspect.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
