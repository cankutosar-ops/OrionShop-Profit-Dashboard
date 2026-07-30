import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const ARTICLE = "LILYSIYAH01";

function load(path) {
  if (!existsSync(path)) return [];
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

function findSalesFiles(root = "exports") {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) {
        if (name.name === "node_modules" || name.name === ".git") continue;
        walk(p);
      } else if (/sales\.json$/i.test(name.name) || /wb_sales/i.test(name.name)) {
        out.push(p);
      }
    }
  }
  walk(root);
  return out;
}

const salesFiles = findSalesFiles();
console.log("sales files", salesFiles.length);

const allSalesHits = [];
for (const p of salesFiles) {
  try {
    const rows = load(p).filter(
      (s) => String(s.supplierArticle || s.supplier_article || "").toUpperCase() === ARTICLE
    );
    for (const s of rows) allSalesHits.push({ path: p, sale: s });
  } catch (e) {
    console.log("skip", p, e.message);
  }
}

console.log("sales hits", allSalesHits.length);
const completed = allSalesHits.filter((h) =>
  String(h.sale.saleID || h.sale.sale_id || "").startsWith("S")
);
console.log("completed", completed.length);

// Prefer completed with forPay > 0 and matching finance
const pairs = [
  [
    "exports/wb-raw-2026-06-18_2026-06-29/sales.json",
    "exports/wb-raw-2026-06-18_2026-06-29/finance.json",
    "exports/wb-raw-2026-06-18_2026-06-29/orders.json",
  ],
  [
    "exports/wb-raw-2026-06-30_2026-07-05/sales.json",
    "exports/wb-raw-2026-06-30_2026-07-05/finance.json",
    "exports/wb-raw-2026-06-30_2026-07-05/orders.json",
  ],
  [
    "exports/wb-raw-account1-portal-proof/sales.json",
    "exports/wb-raw-account1-portal-proof/finance.json",
    "exports/wb-raw-account1-portal-proof/orders.json",
  ],
];

let best = null;
for (const [sp, fp, op] of pairs) {
  const sales = load(sp).filter(
    (s) =>
      String(s.supplierArticle || "").toUpperCase() === ARTICLE &&
      String(s.saleID || "").startsWith("S") &&
      Number(s.forPay) > 0
  );
  const fin = load(fp);
  const bySrid = new Map();
  for (const r of fin) {
    if (!r?.srid) continue;
    if (!bySrid.has(r.srid)) bySrid.set(r.srid, []);
    bySrid.get(r.srid).push(r);
  }
  const orders = load(op);
  for (const s of sales) {
    const rows = bySrid.get(s.srid) || [];
    const hasSale = rows.some((r) =>
      /продаж/i.test(String(r.supplier_oper_name || r.supplierOperName || ""))
    );
    const order = orders.find((o) => o.srid === s.srid) || null;
    const score =
      (hasSale ? 1000 : 0) +
      (rows.length ? 100 : 0) +
      (order ? 50 : 0) +
      Number(s.forPay || 0);
    if (!best || score > best.score) {
      best = { score, sp, fp, op, sale: s, finance: rows, order };
    }
  }
}

if (!best) {
  // fallback any completed from all hits
  const c = completed[0];
  if (!c) {
    writeFileSync(
      "exports/lily-siyah01-single-sale-audit.json",
      JSON.stringify({ error: "no sale found", salesHits: allSalesHits.length }, null, 2)
    );
    console.log("NO SALE");
    process.exit(1);
  }
  best = {
    score: 0,
    sp: c.path,
    fp: null,
    op: null,
    sale: c.sale,
    finance: [],
    order: null,
  };
}

const out = {
  article: ARTICLE,
  selected: {
    srid: best.sale.srid,
    saleID: best.sale.saleID,
    date: best.sale.date,
    nmId: best.sale.nmId,
    salesPath: best.sp,
    financePath: best.fp,
    ordersPath: best.op,
    score: best.score,
  },
  salesApiRaw: best.sale,
  financeApiRawRows: best.finance,
  ordersApiRaw: best.order,
  allSalesHitCount: allSalesHits.length,
  completedCount: completed.length,
};

writeFileSync(
  "exports/lily-siyah01-single-sale-audit.json",
  JSON.stringify(out, null, 2)
);
console.log(JSON.stringify(out.selected, null, 2));
console.log("finance rows", best.finance.length);
console.log("order", best.order ? "yes" : "no");
console.log(
  "sale keys",
  Object.keys(best.sale).sort().join(",")
);
if (best.finance[0]) {
  console.log("finance keys", Object.keys(best.finance[0]).sort().join(","));
}
