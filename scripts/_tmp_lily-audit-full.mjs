import { createRequire } from "module";
import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  parseWbSourceSuffix,
  effectiveFinanceCategory,
} from "../src/lib/finance-category.ts";
import { mapFinanceRowsFromReport } from "../src/lib/wildberries/mappers.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const SRID = "e8.r70c53dab43d9457eb9e197ef8d6a25d8.0.0";
const EXCEL =
  "C:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";

function loadEnv() {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function load(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(raw) ? raw : raw.data || [];
}

const salesPath = "exports/wb-raw-2026-06-18_2026-06-29/sales.json";
const financePath = "exports/wb-raw-2026-06-18_2026-06-29/finance.json";
const ordersPath = "exports/wb-raw-2026-06-18_2026-06-29/orders.json";

const sale = load(salesPath).find((s) => s.srid === SRID);
const financeRows = load(financePath).filter((r) => r.srid === SRID);
const order = load(ordersPath).find((o) => o.srid === SRID);

// How mapper splits finance into DB lines
const mappedLines = [];
for (const row of financeRows) {
  const lines = mapFinanceRowsFromReport(row, null);
  for (const line of lines) {
    const suffix = parseWbSourceSuffix(
      line.source_key,
      line.wb_source_suffix ?? null
    );
    const cat = effectiveFinanceCategory(line);
    mappedLines.push({
      ...line,
      parsed_suffix: suffix,
      effective_category: cat,
    });
  }
}

// Excel week containing 2026-06-25
const wb = XLSX.readFile(EXCEL, { cellDates: true });
const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
  header: 1,
  defval: null,
  raw: false,
});
const header = grid[0];
let excelWeek = null;
for (let i = 1; i < grid.length; i++) {
  const row = grid[i];
  if (!row || row[5] !== "Основной") continue;
  const start = String(row[2]).slice(0, 10);
  const end = String(row[3]).slice(0, 10);
  if (start <= "2026-06-25" && "2026-06-25" <= end) {
    excelWeek = {
      note: "Excel weekly report has NO per-SRID lines. This is the Основной week containing sale_date 2026-06-25.",
      start,
      end,
      rawByHeader: Object.fromEntries(header.map((h, j) => [String(h), row[j]])),
    };
    break;
  }
}

loadEnv();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: dbSale, error: e1 } = await sb
  .from("wb_sales")
  .select("*")
  .eq("srid", SRID)
  .maybeSingle();

const { data: dbFinance, error: e2 } = await sb
  .from("wb_finance")
  .select("*")
  .eq("srid", SRID);

const { data: dbOrder, error: e3 } = await sb
  .from("wb_orders")
  .select("*")
  .eq("srid", SRID)
  .maybeSingle();

const { data: product, error: e4 } = await sb
  .from("products")
  .select("*")
  .eq("supplier_article", "LILYSIYAH01")
  .maybeSingle();

const out = {
  article: "LILYSIYAH01",
  srid: SRID,
  salesApiRawComplete: sale,
  ordersApiRawComplete: order,
  financeApiRawComplete: financeRows,
  financeMappedToDbLines: mappedLines,
  weeklyExcelOsnovnoyWeekContainingSaleDate: excelWeek,
  databasePersisted: {
    products: product,
    productsError: e4?.message || null,
    wb_sales: dbSale,
    wb_salesError: e1?.message || null,
    wb_orders: dbOrder,
    wb_ordersError: e3?.message || null,
    wb_finance: dbFinance,
    wb_financeError: e2?.message || null,
  },
};

writeFileSync(
  "exports/lily-siyah01-single-sale-audit.json",
  JSON.stringify(out, null, 2)
);

console.log(
  JSON.stringify(
    {
      mappedLineCount: mappedLines.length,
      mappedSummary: mappedLines.map((l) => ({
        suffix: l.parsed_suffix,
        cat: l.effective_category,
        amount: l.amount,
        oper: l.supplier_oper_name,
      })),
      excel: excelWeek?.rawByHeader
        ? {
            report: excelWeek.rawByHeader["№ отчета"],
            start: excelWeek.start,
            end: excelWeek.end,
            prodazha: excelWeek.rawByHeader["Продажа"],
            k: excelWeek.rawByHeader["К перечислению за товар"],
            total: excelWeek.rawByHeader["Итого к оплате"],
          }
        : null,
      dbSale: dbSale
        ? {
            revenue: dbSale.revenue,
            price_with_disc: dbSale.price_with_disc,
            for_pay: dbSale.for_pay,
            sale_date: dbSale.sale_date,
          }
        : e1?.message,
      dbFinanceCount: dbFinance?.length ?? e2?.message,
      dbOrder: dbOrder
        ? { price: dbOrder.price, price_with_disc: dbOrder.price_with_disc }
        : e3?.message,
    },
    null,
    2
  )
);
