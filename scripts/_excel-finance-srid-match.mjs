import { readFileSync } from "fs";
import XLSX from "xlsx";

const excelPath =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №758163502_68674/Еженедельный детализированный отчет №758163502_68674 - 1.xlsx";
const wb = XLSX.read(readFileSync(excelPath));
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const saleExcel = excelRows.filter((r) => String(r["Обоснование для оплаты"] || "").trim() === "Продажа");
const parseNum = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const close = (a, b) => Math.abs(a - b) <= 0.02;
const finance = JSON.parse(readFileSync("exports/wb-raw-2026-06-18_2026-06-29/finance.json", "utf8")).data || [];
const finBySrid = new Map(finance.filter((f) => f.srid).map((f) => [String(f.srid), f]));

const diffs = [];
let matched = 0;
let retailHits = 0;
let forPayHits = 0;
for (const ex of saleExcel) {
  const f = finBySrid.get(String(ex.Srid || ""));
  if (!f) continue;
  matched++;
  const er = parseNum(ex["Вайлдберриз реализовал Товар (Пр)"]);
  const ef = parseNum(ex["К перечислению Продавцу за реализованный Товар"]);
  if (close(er, f.retail_amount)) retailHits++;
  if (close(ef, f.ppvz_for_pay)) forPayHits++;
  diffs.push({ srid: ex.Srid, excelRetail: er, financeRetail: f.retail_amount, diff: Math.round((er - f.retail_amount) * 100) / 100 });
}

console.log(
  JSON.stringify(
    {
      matched,
      total: saleExcel.length,
      retailHits,
      forPayHits,
      maxDiff: diffs.length ? Math.max(...diffs.map((d) => Math.abs(d.diff))) : null,
      avgAbsDiff: diffs.length ? diffs.reduce((s, d) => s + Math.abs(d.diff), 0) / diffs.length : null,
      sample: diffs.slice(0, 5),
    },
    null,
    2
  )
);
