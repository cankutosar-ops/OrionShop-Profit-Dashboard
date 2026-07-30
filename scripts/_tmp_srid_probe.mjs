/**
 * Probe Excel SRIDs against wb_finance (no engine changes).
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

const path =
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №786182326_1202289/Еженедельный детализированный отчет №786182326_1202289 - 1.xlsx";
const wb = XLSX.readFile(path, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
const saleRows = rows.filter((r) => String(r["Обоснование для оплаты"] || "") === "Продажа");
const sampleSrids = saleRows.slice(0, 5).map((r) => String(r.Srid));

const sb = createAdminClient();
const probes = [];
for (const srid of sampleSrids) {
  const { data, error } = await sb
    .from("wb_finance")
    .select(
      "id,srid,operation_date,sale_dt,rr_dt,ppvz_for_pay,amount,supplier_oper_name,finance_category,rrd_id,realizationreport_id,marketplace_account_id"
    )
    .eq("srid", srid)
    .limit(20);
  probes.push({ srid, error: error?.message ?? null, count: data?.length ?? 0, rows: data ?? [] });
}

const s0 = sampleSrids[0];
const { count: finWeek } = await sb
  .from("wb_finance")
  .select("*", { count: "exact", head: true })
  .eq("marketplace_account_id", "1")
  .gte("operation_date", "2026-07-13")
  .lte("operation_date", "2026-07-19");

const { data: weekSample } = await sb
  .from("wb_finance")
  .select("srid,operation_date,ppvz_for_pay,supplier_oper_name,rrd_id,realizationreport_id")
  .eq("marketplace_account_id", "1")
  .gte("operation_date", "2026-07-13")
  .lte("operation_date", "2026-07-19")
  .not("ppvz_for_pay", "is", null)
  .limit(8);

const { data: byRrd, count: byRrdCount } = await sb
  .from("wb_finance")
  .select("id,srid,rrd_id,realizationreport_id,operation_date,ppvz_for_pay", { count: "exact" })
  .eq("marketplace_account_id", "1")
  .eq("rrd_id", 786182326)
  .limit(5);

const { data: byRrId, count: byRrIdCount } = await sb
  .from("wb_finance")
  .select("id,srid,rrd_id,realizationreport_id,operation_date,ppvz_for_pay", { count: "exact" })
  .eq("marketplace_account_id", "1")
  .eq("realizationreport_id", 786182326)
  .limit(5);

// Check if week finance SRIDs share prefix with excel
const excelSet = new Set(rows.map((r) => r.Srid).filter(Boolean).map(String));
const weekSrids = (weekSample ?? []).map((r) => r.srid);
const overlapWeekSample = weekSrids.filter((s) => excelSet.has(s));

const out = {
  sampleSaleExcel: saleRows.slice(0, 3).map((r) => ({
    srid: r.Srid,
    pay: r["К перечислению Продавцу за реализованный Товар"],
    sale: r["Дата продажи"],
  })),
  probes,
  finWeek,
  weekSample,
  byRrd,
  byRrdCount,
  byRrId,
  byRrIdCount,
  excelUniqueSrids: excelSet.size,
  overlapWeekSample,
};
writeFileSync("exports/_tmp_srid_probe.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
