/**
 * Evidence pack: To Customer / From Customer (WB API → DB → History API).
 * Usage: npx tsx scripts/proof-inventory-transit.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
  }
}

loadEnv();

const outDir = resolve("exports/inventory-transit-proof");
mkdirSync(outDir, { recursive: true });

const { getMarketplaceAccountForSync } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
const {
  pivotHistoryRows,
  DEFAULT_HISTORY_TABLE_SETTINGS,
} = await import("../src/lib/inventory-history-table.ts");

const account = await getMarketplaceAccountForSync("1");
const client = new WbApiClient(account.apiKey);
const items = await client.fetchWbWarehousesStock();

const withTransit = items.filter(
  (i) => Number(i.inWayToClient) > 0 || Number(i.inWayFromClient) > 0
);
const sumTo = items.reduce((a, i) => a + (Number(i.inWayToClient) || 0), 0);
const sumFrom = items.reduce((a, i) => a + (Number(i.inWayFromClient) || 0), 0);
const sample = withTransit.slice(0, 5);

const apiProof = {
  endpoint:
    "POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses",
  accountId: "1",
  accountName: account.account_name,
  itemCount: items.length,
  fieldNamesOnItem: items[0] ? Object.keys(items[0]) : [],
  fieldMapping: {
    "To Customer": "inWayToClient → in_way_to_client → toCustomer",
    "From Customer": "inWayFromClient → in_way_from_client → fromCustomer",
  },
  sumInWayToClient: sumTo,
  sumInWayFromClient: sumFrom,
  rowsWithTransit: withTransit.length,
  sampleRows: sample,
};

writeFileSync(
  resolve(outDir, "wb-api-response-sample.json"),
  JSON.stringify(apiProof, null, 2)
);
writeFileSync(
  resolve(outDir, "wb-api-raw-item.json"),
  JSON.stringify(sample[0] ?? items[0] ?? null, null, 2)
);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sumDay(date) {
  let from = 0;
  let rows = 0;
  let to = 0;
  let fromC = 0;
  const samples = [];
  for (;;) {
    const { data, error } = await sb
      .from("historical_inventory_snapshots")
      .select(
        "seller_article,size,warehouse_name,quantity,in_way_to_client,in_way_from_client,barcode"
      )
      .eq("marketplace_account_id", 1)
      .eq("snapshot_date", date)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      rows += 1;
      const t = Number(r.in_way_to_client) || 0;
      const f = Number(r.in_way_from_client) || 0;
      to += t;
      fromC += f;
      if ((t > 0 || f > 0) && samples.length < 5) samples.push(r);
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return { date, rows, sumTo: to, sumFrom: fromC, samples };
}

const daily = await sumDay("2026-07-26");
const histDates = {};
for (const d of ["2026-07-25", "2026-07-20", "2026-07-17"]) {
  histDates[d] = await sumDay(d);
}

const widePath = resolve(
  "exports/historical-inventory/account-1/_source/STOCK_HISTORY_DAILY_wide.csv"
);
const wideHeader = existsSync(widePath)
  ? readFileSync(widePath, "utf8").split(/\r?\n/)[0]
  : "";

const histRes = await fetch(
  "http://localhost:3000/api/inventory/history?marketplaceAccountId=1&snapshotDate=2026-07-26&full=1"
);
const histJson = await histRes.json();
const hRows = histJson.rows ?? [];
const hTo = hRows.reduce((a, r) => a + (Number(r.in_way_to_client) || 0), 0);
const hFrom = hRows.reduce(
  (a, r) => a + (Number(r.in_way_from_client) || 0),
  0
);

const flat = hRows.map((r) => ({
  brand: r.brand || "",
  subject: r.subject || "",
  seller_article: r.seller_article || "",
  barcode: r.barcode || "",
  size: r.size || "",
  warehouse_name: r.warehouse_name || "",
  quantity: Number(r.quantity) || 0,
  in_way_to_client: Number(r.in_way_to_client) || 0,
  in_way_from_client: Number(r.in_way_from_client) || 0,
}));

const sizeLevel = pivotHistoryRows(flat, DEFAULT_HISTORY_TABLE_SETTINGS);
const modelLevel = pivotHistoryRows(flat, {
  ...DEFAULT_HISTORY_TABLE_SETTINGS,
  size: false,
  barcode: false,
});
const categoryLevel = pivotHistoryRows(flat, {
  ...DEFAULT_HISTORY_TABLE_SETTINGS,
  size: false,
  model: false,
  barcode: false,
});
const brandLevel = pivotHistoryRows(flat, {
  ...DEFAULT_HISTORY_TABLE_SETTINGS,
  size: false,
  model: false,
  category: false,
  barcode: false,
});

function aggSum(pivot) {
  return {
    rows: pivot.pivotRows.length,
    total: pivot.pivotRows.reduce((a, r) => a + r.total, 0),
    toCustomer: pivot.pivotRows.reduce((a, r) => a + r.toCustomer, 0),
    fromCustomer: pivot.pivotRows.reduce((a, r) => a + r.fromCustomer, 0),
    top: [...pivot.pivotRows]
      .sort((a, b) => b.toCustomer - a.toCustomer)
      .slice(0, 3)
      .map((r) => ({
        brand: r.brand,
        category: r.category,
        model: r.model,
        size: r.size,
        total: r.total,
        toCustomer: r.toCustomer,
        fromCustomer: r.fromCustomer,
      })),
  };
}

const evidence = {
  api: {
    sumTo,
    sumFrom,
    itemCount: items.length,
    sample: sample[0] ?? null,
  },
  database_daily: daily,
  database_historical_csv_dates: histDates,
  csv: {
    path: widePath,
    header: wideHeader,
    hasInWayToClient: /inWayToClient/i.test(wideHeader),
    hasInWayFromClient: /inWayFromClient/i.test(wideHeader),
  },
  historyApi: {
    status: histRes.status,
    rowCount: hRows.length,
    sumTo: hTo,
    sumFrom: hFrom,
    sample: hRows.filter((r) => Number(r.in_way_to_client) > 0).slice(0, 3),
  },
  aggregation: {
    size: aggSum(sizeLevel),
    model: aggSum(modelLevel),
    category: aggSum(categoryLevel),
    brand: aggSum(brandLevel),
  },
  parity: {
    api_vs_db_to: sumTo === daily.sumTo,
    api_vs_db_from: sumFrom === daily.sumFrom,
    db_vs_historyApi_to: daily.sumTo === hTo,
    db_vs_historyApi_from: daily.sumFrom === hFrom,
    historyApi_vs_sizeAgg_to: hTo === aggSum(sizeLevel).toCustomer,
    historyApi_vs_brandAgg_to: hTo === aggSum(brandLevel).toCustomer,
  },
};

writeFileSync(resolve(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
