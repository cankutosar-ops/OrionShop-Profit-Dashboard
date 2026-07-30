/**
 * Probe wb_finance coverage for week / SRIDs (correct columns only).
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

const path =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const wb = XLSX.readFile(path, { cellDates: true });
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
const saleRows = excelRows.filter((r) => String(r["Обоснование для оплаты"] || "") === "Продажа");
const sampleSrids = saleRows.slice(0, 8).map((r) => String(r.Srid));

const cols =
  "id,srid,operation_date,ppvz_for_pay,amount,supplier_oper_name,finance_category,rrd_id,realizationreport_id,marketplace_account_id,nm_id";

const probes = [];
for (const srid of sampleSrids) {
  const { data, error } = await sb.from("wb_finance").select(cols).eq("srid", srid).limit(20);
  probes.push({ srid, error: error?.message ?? null, count: data?.length ?? 0, rows: data ?? [] });
}

const counts = {};
for (const acc of ["1", "2"]) {
  const { count: cOp } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", acc)
    .gte("operation_date", "2026-07-13")
    .lte("operation_date", "2026-07-19");
  const { count: cAll } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", acc);
  const { data: maxOp } = await sb
    .from("wb_finance")
    .select("operation_date,ppvz_for_pay,srid,realizationreport_id,rrd_id")
    .eq("marketplace_account_id", acc)
    .order("operation_date", { ascending: false })
    .limit(5);
  const { count: byRr } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", acc)
    .eq("realizationreport_id", 786182326);
  const { count: byRrd } = await sb
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", acc)
    .eq("rrd_id", 786182326);
  counts[acc] = { weekOpDate: cOp, totalRows: cAll, latest: maxOp, byRealizationReportId: byRr, byRrdId: byRrd };
}

// Any finance row at all for first srid across accounts
const { data: anyFirst } = await sb.from("wb_finance").select(cols).eq("srid", sampleSrids[0]).limit(20);

// Check sales for same srid
const { data: salesHit } = await sb
  .from("wb_sales")
  .select("srid,sale_date,for_pay,price_with_disc,marketplace_account_id")
  .eq("srid", sampleSrids[0])
  .limit(10);

const out = {
  sampleSaleExcel: saleRows.slice(0, 3).map((r) => ({
    srid: r.Srid,
    pay: r["К перечислению Продавцу за реализованный Товар"],
    sale: r["Дата продажи"],
  })),
  probes,
  anyFirst,
  salesHit,
  counts,
};
writeFileSync("exports/_tmp_srid_probe2.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
