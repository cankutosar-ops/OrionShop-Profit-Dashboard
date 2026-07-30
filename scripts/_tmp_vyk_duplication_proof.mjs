/**
 * Prove whether По выкупам Продажа/Возврат lines are duplicated inside Основной detail.
 */
import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const num = (v) => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function load(path) {
  const wb = XLSX.readFile(path, { cellDates: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
}
function map(r, type) {
  return {
    type,
    srid: r.Srid == null || r.Srid === "" ? null : String(r.Srid),
    justification: String(r["Обоснование для оплаты"] ?? ""),
    ppvz: num(r["К перечислению Продавцу за реализованный Товар"]),
    logistics: num(r["Услуги по доставке товара покупателю"]),
    rebill: num(r["Возмещение издержек по перевозке/по складским операциям с товаром"]),
    saleDate: r["Дата продажи"] == null ? null : String(r["Дата продажи"]).slice(0, 10),
    nmId: String(r["Код номенклатуры"] ?? ""),
    barcode: String(r["Баркод"] ?? ""),
  };
}

const PATH_OSN =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const PATH_VYK =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182329_1202289/Еженедельный детализированный отчет №786182329_1202289 - 1.xlsx";

const osn = load(PATH_OSN).map((r) => map(r, "Основной"));
const vyk = load(PATH_VYK).map((r) => map(r, "По выкупам"));

const vykPayLines = vyk.filter((r) => r.justification === "Продажа" || r.justification === "Возврат");
const compare = vykPayLines.map((v) => {
  const osnSame = osn.filter(
    (o) => o.srid === v.srid && o.justification === v.justification && Math.abs(o.ppvz - v.ppvz) < 0.02
  );
  const osnSameSrid = osn.filter((o) => o.srid === v.srid);
  return {
    vyk: v,
    exactMatchInOsn: osnSame.length > 0,
    exactMatches: osnSame,
    osnLinesForSrid: osnSameSrid,
  };
});

const vykLogLines = vyk.filter((r) => r.justification === "Логистика");
const logCompare = vykLogLines.map((v) => {
  const osnSame = osn.filter(
    (o) =>
      o.srid === v.srid &&
      o.justification === "Логистика" &&
      Math.abs(o.logistics - v.logistics) < 0.02 &&
      o.saleDate === v.saleDate
  );
  return {
    srid: v.srid,
    logistics: v.logistics,
    saleDate: v.saleDate,
    duplicatedInOsn: osnSame.length > 0,
  };
});

const out = {
  vykPayLineCount: vykPayLines.length,
  allPayLinesDuplicatedInOsn: compare.every((c) => c.exactMatchInOsn),
  payCompare: compare,
  vykLogisticsLines: vykLogLines.length,
  allLogisticsDuplicatedInOsn: logCompare.every((c) => c.duplicatedInOsn),
  logisticsDuplicatedCount: logCompare.filter((c) => c.duplicatedInOsn).length,
  logCompare,
  implication:
    "If every По выкупам Продажа/Возврат/Логистика line also exists with identical amounts in Основной detail, then summing both reports double-counts. Summary Excel still lists them as separate report № with separate К totals — settlement packaging differs from detail-file SRID membership.",
};
writeFileSync("exports/_tmp_vyk_duplication_proof.json", JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      allPayDup: out.allPayLinesDuplicatedInOsn,
      allLogDup: out.allLogisticsDuplicatedInOsn,
      pay: compare.map((c) => ({
        srid: c.vyk.srid,
        j: c.vyk.justification,
        ppvz: c.vyk.ppvz,
        dup: c.exactMatchInOsn,
      })),
      logDupCount: `${out.logisticsDuplicatedCount}/${out.vykLogisticsLines}`,
    },
    null,
    2
  )
);
