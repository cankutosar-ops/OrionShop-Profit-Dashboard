#!/usr/bin/env node
/**
 * Deductions / Account Adjustments accounting audit (read-only).
 * Usage: node scripts/audit-deductions.mjs [financeExport] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const exportPath = process.argv[2] ?? "exports/wb-raw-account1-portal-proof/finance.json";
const FROM = process.argv[3] ?? "2026-06-15";
const TO = process.argv[4] ?? "2026-07-12";
const PORTAL_DEDUCTIONS = Number(process.argv[5] ?? 75_000);

const raw = JSON.parse(readFileSync(resolve(exportPath), "utf8"));
const rows = raw.data ?? raw;
const ymd = (s) => s?.slice?.(0, 10) ?? "";

function inRange(r) {
  return ymd(r.rr_dt) >= FROM && ymd(r.rr_dt) <= TO;
}

function classify(row) {
  const desc = (row.bonus_type_name ?? "").toLowerCase();
  const oper = (row.supplier_oper_name ?? "").toLowerCase();

  if (/продвижен|реклам|advert|promo/i.test(desc)) return "Advertising deduction";
  if (/комисс/i.test(desc)) return "Marketplace commission adjustment";
  if (/кредит|займ|loan|credit/i.test(desc)) return "Credit / loan repayment";
  if (/финанс|коррект/i.test(desc)) return "Financial adjustment";
  if (/удерж/i.test(oper) && !desc) return "Manual account adjustment";
  return "Other";
}

const deductionRows = rows.filter((r) => inRange(r) && Math.abs(Number(r.deduction ?? 0)) > 0);

const audited = deductionRows.map((r) => ({
  date: r.rr_dt,
  amount: Math.abs(Number(r.deduction)),
  supplier_oper_name: r.supplier_oper_name ?? null,
  source_key: `rrd:${r.rrd_id}:deduction`,
  doc_type_name: r.doc_type_name || null,
  description: r.bonus_type_name || null,
  reason_code: null,
  nm_id: r.nm_id ?? 0,
  srid: r.srid ?? null,
  sa_name: r.sa_name || null,
  realizationreport_id: r.realizationreport_id ?? null,
  classification: classify(r),
  product_attached: Boolean(r.nm_id && r.nm_id > 0),
}));

const totalsByCategory = audited.reduce((acc, row) => {
  acc[row.classification] = (acc[row.classification] ?? 0) + row.amount;
  return acc;
}, {});

const sum = audited.reduce((a, r) => a + r.amount, 0);

console.log(
  JSON.stringify(
    {
      scope: { from: FROM, to: TO, exportMeta: raw.metadata ?? null },
      portalDeductions: PORTAL_DEDUCTIONS,
      rowCount: audited.length,
      totalDeductions: sum,
      diffVsPortal: Math.round((sum - PORTAL_DEDUCTIONS) * 100) / 100,
      totalsByCategory,
      rows: audited,
      productAttachedCount: audited.filter((r) => r.product_attached).length,
      accountLevelCount: audited.filter((r) => !r.product_attached).length,
    },
    null,
    2
  )
);
