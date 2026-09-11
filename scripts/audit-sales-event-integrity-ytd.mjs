#!/usr/bin/env node
/**
 * READ-ONLY historical sales event integrity audit.
 * Does not write wb_sales, finance, ads, or cost history.
 * Does not acquire the sales backfill lock. Skips WB API for a locked account.
 *
 *   npx tsx scripts/audit-sales-event-integrity-ytd.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { createWbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { buildLatestCostByProductId } from "../src/lib/cost-history-resolution.ts";
import { calculateEstimatedTax } from "../src/lib/financial-engine-tax.ts";
import { DEFAULT_TAX_PERCENT } from "../src/lib/smart-pricing-constants.ts";

const FROM = "2026-01-01";
const TO = "2026-09-06";
const DATE_FROM = "2026-01-01T00:00:00";
const OUT_DIR = resolve("exports/sales-event-integrity-audit");
const LOCK_DIR = resolve("exports/sales-backfill");

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, i).trim()] ??= v;
    }
  }
}

function dateOnly(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function inRange(day) {
  return Boolean(day && day >= FROM && day <= TO);
}

function absNum(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function eventTypeOf(saleId) {
  const id = String(saleId ?? "");
  if (id.startsWith("S")) return "SALE";
  if (id.startsWith("R")) return "RETURN";
  return "OTHER";
}

function isUnresolved(saleId) {
  return String(saleId ?? "").startsWith("unresolved:");
}

function liveLock(accountId) {
  const path = resolve(LOCK_DIR, `lock-${accountId}.json`);
  if (!existsSync(path)) return null;
  const lock = JSON.parse(readFileSync(path, "utf8"));
  const ageMs = Date.now() - new Date(lock.startedAt).getTime();
  return { ...lock, ageMs, path, fresh: ageMs < 4 * 60 * 60_000 };
}

function moneyBucket() {
  return { count: 0, units: 0, priceWithDisc: 0, finishedPrice: 0, forPay: 0 };
}

function addMoney(bucket, event, units = 1) {
  bucket.count += 1;
  bucket.units += units;
  bucket.priceWithDisc += event.priceWithDisc;
  bucket.finishedPrice += event.finishedPrice;
  bucket.forPay += event.forPay;
}

function finishMoney(bucket) {
  return {
    count: bucket.count,
    units: bucket.units,
    priceWithDisc: round2(bucket.priceWithDisc),
    finishedPrice: round2(bucket.finishedPrice),
    forPay: round2(bucket.forPay),
  };
}

function toApiEvent(row) {
  const saleID = String(row.saleID ?? "");
  const type = eventTypeOf(saleID);
  return {
    saleID,
    srid: String(row.srid ?? ""),
    date: dateOnly(row.date),
    dateRaw: row.date ?? null,
    lastChangeDate: row.lastChangeDate ?? null,
    nmId: row.nmId ?? null,
    supplierArticle: row.supplierArticle ?? null,
    priceWithDisc: absNum(row.priceWithDisc),
    finishedPrice: absNum(row.finishedPrice),
    forPay: absNum(row.forPay),
    warehouse: row.warehouseName ?? null,
    barcode: row.barcode ?? null,
    eventType: type,
    sourceAmountSigns: {
      priceWithDisc: Number(row.priceWithDisc ?? 0),
      finishedPrice: Number(row.finishedPrice ?? 0),
      forPay: Number(row.forPay ?? 0),
    },
  };
}

async function fetchAll(sb, table, select, apply) {
  const PAGE = 1000;
  const rows = [];
  let offset = 0;
  for (;;) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function loadExportEvents(filePath) {
  if (!existsSync(filePath)) return [];
  const json = JSON.parse(readFileSync(filePath, "utf8"));
  const rows = Array.isArray(json) ? json : (json.data ?? []);
  return rows.map(toApiEvent).filter((e) => e.saleID && e.srid);
}

function groupBySrid(events) {
  const map = new Map();
  for (const event of events) {
    const list = map.get(event.srid) ?? [];
    list.push(event);
    map.set(event.srid, list);
  }
  return map;
}

function classifyShape(events) {
  const sales = events.filter((e) => e.eventType === "SALE");
  const returns = events.filter((e) => e.eventType === "RETURN");
  if (sales.length > 1 || returns.length > 1) return "MULTI";
  if (sales.length && returns.length) return "BOTH";
  if (returns.length) return "RETURN_ONLY";
  if (sales.length) return "SALE_ONLY";
  return "OTHER";
}

function emptyStats() {
  return {
    uniqueSrids: 0,
    saleEvents: 0,
    returnEvents: 0,
    otherEvents: 0,
    saleOnly: 0,
    returnOnly: 0,
    both: 0,
    multiSale: 0,
    multiReturn: 0,
    eventsBeforeFrom: 0,
  };
}

function analyzeIdentity(events) {
  const inPeriod = events.filter((e) => inRange(e.date));
  const siblings = new Map();
  const bySridAll = groupBySrid(events);
  for (const event of inPeriod) {
    siblings.set(event.srid, bySridAll.get(event.srid) ?? [event]);
  }
  const stats = emptyStats();
  stats.uniqueSrids = siblings.size;
  stats.saleEvents = inPeriod.filter((e) => e.eventType === "SALE").length;
  stats.returnEvents = inPeriod.filter((e) => e.eventType === "RETURN").length;
  stats.otherEvents = inPeriod.filter((e) => e.eventType === "OTHER").length;
  stats.eventsBeforeFrom = events.filter((e) => e.date && e.date < FROM).length;

  const listed = { both: [], multiSale: [], multiReturn: [], returnOnly: [] };
  for (const [srid, group] of siblings) {
    const sales = group.filter((e) => e.eventType === "SALE");
    const returns = group.filter((e) => e.eventType === "RETURN");
    if (sales.length > 1) {
      stats.multiSale += 1;
      listed.multiSale.push(compactGroup(srid, group));
    }
    if (returns.length > 1) {
      stats.multiReturn += 1;
      listed.multiReturn.push(compactGroup(srid, group));
    }
    if (sales.length && returns.length && sales.length === 1 && returns.length === 1) stats.both += 1;
    else if (sales.length && returns.length) stats.both += 1;
    else if (returns.length) stats.returnOnly += 1;
    else if (sales.length) stats.saleOnly += 1;
    if (sales.length && returns.length) listed.both.push(compactGroup(srid, group));
    if (!sales.length && returns.length) listed.returnOnly.push(compactGroup(srid, group));
  }
  return { stats, listed, groups: siblings, inPeriod };
}

function compactEvent(e) {
  return {
    saleID: e.saleID,
    date: e.date,
    lastChangeDate: e.lastChangeDate,
    priceWithDisc: e.priceWithDisc,
    finishedPrice: e.finishedPrice,
    forPay: e.forPay,
    nmId: e.nmId,
    supplierArticle: e.supplierArticle,
  };
}

function compactGroup(srid, group) {
  return {
    srid,
    sales: group.filter((e) => e.eventType === "SALE").map(compactEvent),
    returns: group.filter((e) => e.eventType === "RETURN").map(compactEvent),
  };
}

function periodTotals(events) {
  const sales = events.filter((e) => e.eventType === "SALE");
  const returns = events.filter((e) => e.eventType === "RETURN");
  const gross = sales.reduce((s, e) => s + e.priceWithDisc, 0);
  const returned = returns.reduce((s, e) => s + e.priceWithDisc, 0);
  const finishedNet =
    sales.reduce((s, e) => s + e.finishedPrice, 0) -
    returns.reduce((s, e) => s + e.finishedPrice, 0);
  return {
    grossSales: round2(gross),
    returnedSales: round2(returned),
    netSales: round2(gross - returned),
    soldUnits: sales.length,
    returnedUnits: returns.length,
    netUnits: sales.length - returns.length,
    finishedPriceNet: round2(finishedNet),
    estimatedTax: round2(calculateEstimatedTax(finishedNet, DEFAULT_TAX_PERCENT)),
  };
}

function warehouseToEvent(row) {
  const type = row.event_type === "RETURN" || row.is_return ? "RETURN" : "SALE";
  return {
    saleID: row.sale_id ?? null,
    native: Boolean(row.sale_id) && !isUnresolved(row.sale_id),
    unresolved: isUnresolved(row.sale_id),
    srid: String(row.srid ?? ""),
    date: dateOnly(row.sale_date),
    nmId: row.nm_id ?? null,
    productId: row.product_id ? String(row.product_id) : null,
    supplierArticle: null,
    priceWithDisc: absNum(row.price_with_disc),
    finishedPrice: absNum(row.revenue),
    forPay: absNum(row.for_pay),
    warehouse: row.warehouse ?? null,
    barcode: row.barcode ?? null,
    eventType: type,
    quantity: Number(row.quantity ?? 1) || 1,
    isReturn: Boolean(row.is_return),
  };
}

function compareAccount({ accountId, apiEvents, warehouseRows, exportEvents, costs, products }) {
  const identity = apiEvents ? analyzeIdentity(apiEvents) : null;
  const whEvents = warehouseRows.map(warehouseToEvent);
  const whBySaleId = new Map();
  const whBySrid = new Map();
  for (const row of whEvents) {
    if (row.saleID) whBySaleId.set(row.saleID, row);
    const list = whBySrid.get(row.srid) ?? [];
    list.push(row);
    whBySrid.set(row.srid, list);
  }

  const sourceEvents = apiEvents ?? exportEvents ?? [];
  const sourceLabel = apiEvents ? "live_api" : exportEvents ? "stored_export_only" : "none";
  const sourceIdentity = analyzeIdentity(sourceEvents);
  const categories = {
    HEALTHY: moneyBucket(),
    PLACEHOLDER: moneyBucket(),
    OVERWRITE_RECOVERABLE: moneyBucket(),
    OVERWRITE_NOT_CURRENTLY_RECOVERABLE: moneyBucket(),
    MULTI_EVENT_ANOMALY: moneyBucket(),
    OTHER: moneyBucket(),
  };
  const categorySrids = {
    HEALTHY: [],
    PLACEHOLDER: [],
    OVERWRITE_RECOVERABLE: [],
    OVERWRITE_NOT_CURRENTLY_RECOVERABLE: [],
    MULTI_EVENT_ANOMALY: [],
    OTHER: [],
  };

  const missingFromWarehouse = [];
  const alreadyRepaired = [];
  const samples = [];
  const productImpact = new Map();
  const monthly = new Map();
  const dateAxis = {
    pairs: 0,
    saleLastChangeEqualsReturnDate: 0,
    saleLastChangeAfterSaleDate: 0,
    returnAfterSale: 0,
    sameCalendarDay: 0,
    saleDateBeforeReturnDate: 0,
    mechanism: {
      laterReturnWouldWinOnSridUpsert: 0,
      saleLastChangeInsideReturnFetchWindow: 0,
    },
  };

  function monthOf(day) {
    return day ? day.slice(0, 7) : "unknown";
  }
  function monthRow(month) {
    if (!monthly.has(month)) {
      monthly.set(month, {
        month,
        saleEvents: 0,
        returnEvents: 0,
        sridsBoth: 0,
        overwrittenEvents: 0,
        recoverableEvents: 0,
        unrecoverableEvents: 0,
        affectedNetSales: 0,
        affectedUnits: 0,
      });
    }
    return monthly.get(month);
  }

  const groups = sourceIdentity.groups;
  for (const [srid, group] of groups) {
    const apiSales = group.filter((e) => e.eventType === "SALE");
    const apiReturns = group.filter((e) => e.eventType === "RETURN");
    const wh = whBySrid.get(srid) ?? [];
    const whSales = wh.filter((e) => e.eventType === "SALE");
    const whReturns = wh.filter((e) => e.eventType === "RETURN");
    const shape = classifyShape(group);
    const touchesPeriod = group.some((e) => inRange(e.date));
    if (!touchesPeriod) continue;

    const findings = [];
    for (const event of group) {
      if (!inRange(event.date)) continue;
      const native = whBySaleId.get(event.saleID);
      const typed = (event.eventType === "SALE" ? whSales : whReturns).filter((row) => {
        if (row.native && row.saleID === event.saleID) return true;
        if (row.unresolved && row.eventType === event.eventType) return true;
        return false;
      });
      if (native && native.native) {
        findings.push({ event, status: "native_present" });
      } else if (typed.some((row) => row.unresolved)) {
        findings.push({ event, status: "placeholder" });
      } else if (event.eventType === "SALE" && whReturns.length && !whSales.length) {
        findings.push({ event, status: "sale_overwritten_by_return" });
      } else if (event.eventType === "RETURN" && whSales.length && !whReturns.length) {
        findings.push({ event, status: "return_overwritten_by_sale" });
      } else if (!wh.length) {
        findings.push({ event, status: "missing_entirely" });
      } else {
        findings.push({ event, status: "missing_identity" });
      }
    }

    const missing = findings.filter((f) =>
      ["sale_overwritten_by_return", "return_overwritten_by_sale", "missing_entirely", "missing_identity"].includes(
        f.status
      )
    );
    const placeholders = findings.filter((f) => f.status === "placeholder");
    const bothPreserved =
      apiSales.length > 0 &&
      apiReturns.length > 0 &&
      whSales.length > 0 &&
      whReturns.length > 0 &&
      missing.length === 0;

    let category = "OTHER";
    if (shape === "MULTI") category = "MULTI_EVENT_ANOMALY";
    else if (missing.length === 0 && placeholders.length === 0 && findings.length) category = "HEALTHY";
    else if (missing.length === 0 && placeholders.length) category = "PLACEHOLDER";
    else if (missing.length && apiEvents) category = "OVERWRITE_RECOVERABLE";
    else if (missing.length && !apiEvents) category = "OTHER";
    else category = "OTHER";

    if (bothPreserved && (whSales.some((r) => r.native) || whReturns.some((r) => r.native))) {
      alreadyRepaired.push(srid);
    }

    const affectedEvents = missing.map((f) => f.event);
    const bucketEvents = category === "HEALTHY" || category === "PLACEHOLDER" ? group.filter((e) => inRange(e.date)) : affectedEvents.length ? affectedEvents : group.filter((e) => inRange(e.date));
    for (const event of bucketEvents) addMoney(categories[category], event, 1);
    if (categorySrids[category].length < 30) {
      categorySrids[category].push({
        srid,
        category,
        api: compactGroup(srid, group),
        warehouse: wh.map((row) => ({
          saleID: row.saleID,
          eventType: row.eventType,
          date: row.date,
          unresolved: row.unresolved,
          priceWithDisc: row.priceWithDisc,
          productId: row.productId,
        })),
        findings: findings.map((f) => ({ saleID: f.event.saleID, status: f.status })),
      });
    }

    if (apiSales.length && apiReturns.length) {
      dateAxis.pairs += 1;
      const sale = apiSales[0];
      const ret = apiReturns[0];
      if (sale.date && ret.date && sale.date < ret.date) dateAxis.saleDateBeforeReturnDate += 1;
      if (sale.date && ret.date && sale.date === ret.date) dateAxis.sameCalendarDay += 1;
      if (ret.date && sale.date && ret.date > sale.date) dateAxis.returnAfterSale += 1;
      const saleLcd = dateOnly(sale.lastChangeDate);
      if (saleLcd && ret.date && saleLcd === ret.date) dateAxis.saleLastChangeEqualsReturnDate += 1;
      if (saleLcd && sale.date && saleLcd > sale.date) dateAxis.saleLastChangeAfterSaleDate += 1;
      if (ret.date && sale.date && ret.date > sale.date) dateAxis.mechanism.laterReturnWouldWinOnSridUpsert += 1;
      if (saleLcd && ret.date && saleLcd >= ret.date) dateAxis.mechanism.saleLastChangeInsideReturnFetchWindow += 1;

      if (samples.length < 25 && inRange(sale.date) || (ret.date && inRange(ret.date))) {
        if (samples.length < 25) {
          const oldStored = !whSales.length && whReturns.length ? "RETURN_ONLY" : whSales.length && !whReturns.length ? "SALE_ONLY" : wh.length > 1 ? "BOTH_ROWS" : wh.length === 1 ? wh[0].eventType : "ABSENT";
          samples.push({
            srid,
            sale: compactEvent(sale),
            return: compactEvent(ret),
            oldSridUniqueModelWouldStore: ret.date >= sale.date ? "RETURN" : "SALE",
            currentWarehouseStores: oldStored,
            newModelStores: "SALE_AND_RETURN",
          });
        }
      }
    }

    for (const event of affectedEvents) {
      const month = monthRow(monthOf(event.date));
      month.overwrittenEvents += 1;
      if (category === "OVERWRITE_RECOVERABLE") month.recoverableEvents += 1;
      if (category === "OVERWRITE_NOT_CURRENTLY_RECOVERABLE") month.unrecoverableEvents += 1;
      const sign = event.eventType === "SALE" ? 1 : -1;
      month.affectedNetSales += sign * event.priceWithDisc;
      month.affectedUnits += sign;
    }

    for (const event of group.filter((e) => inRange(e.date))) {
      const month = monthRow(monthOf(event.date));
      if (event.eventType === "SALE") month.saleEvents += 1;
      if (event.eventType === "RETURN") month.returnEvents += 1;
    }
    if (apiSales.length && apiReturns.length) {
      const months = new Set(group.filter((e) => inRange(e.date)).map((e) => monthOf(e.date)));
      for (const month of months) monthRow(month).sridsBoth += 1;
    }

    if (affectedEvents.length) {
      const key = String(group[0].nmId ?? "unknown");
      const hit = productImpact.get(key) ?? {
        nmId: group[0].nmId,
        supplierArticle: group[0].supplierArticle,
        productId: wh[0]?.productId ?? null,
        affectedSaleEvents: 0,
        affectedReturnEvents: 0,
        affectedSales: 0,
        affectedReturns: 0,
        affectedNetSales: 0,
        affectedUnits: 0,
        productCostUnresolvedUnits: 0,
      };
      for (const event of affectedEvents) {
        if (event.eventType === "SALE") {
          hit.affectedSaleEvents += 1;
          hit.affectedSales += event.priceWithDisc;
          hit.affectedUnits += 1;
        } else {
          hit.affectedReturnEvents += 1;
          hit.affectedReturns += event.priceWithDisc;
          hit.affectedUnits -= 1;
        }
        hit.affectedNetSales += event.eventType === "SALE" ? event.priceWithDisc : -event.priceWithDisc;
        const product = products.get(Number(event.nmId));
        const cost = product ? costs.get(String(product.id)) : null;
        if (cost == null) hit.productCostUnresolvedUnits += 1;
        if (!hit.productId && product) hit.productId = String(product.id);
        if (!hit.supplierArticle) hit.supplierArticle = event.supplierArticle;
      }
      productImpact.set(key, hit);
    }

    for (const finding of findings) {
      if (finding.status !== "native_present" && finding.status !== "placeholder") {
        missingFromWarehouse.push({
          srid,
          saleID: finding.event.saleID,
          status: finding.status,
          date: finding.event.date,
          priceWithDisc: finding.event.priceWithDisc,
        });
      }
    }
  }

  const warehousePeriod = whEvents.filter((e) => inRange(e.date));
  const sourcePeriod = sourceEvents.filter((e) => inRange(e.date));
  const warehouseTotals = periodTotals(warehousePeriodEvents(warehousePeriod));
  const sourceTotals = periodTotals(sourcePeriod);
  const productCost = simulateProductCost(warehousePeriod, sourcePeriod, products, costs);

  const impact = impactFromMissing(missingFromWarehouse, sourceEvents, products, costs);

  for (const row of monthly.values()) {
    row.affectedNetSales = round2(row.affectedNetSales);
  }

  const topProducts = [...productImpact.values()]
    .map((row) => ({
      ...row,
      affectedSales: round2(row.affectedSales),
      affectedReturns: round2(row.affectedReturns),
      affectedNetSales: round2(row.affectedNetSales),
    }))
    .sort((a, b) => Math.abs(b.affectedNetSales) - Math.abs(a.affectedNetSales))
    .slice(0, 20);

  return {
    accountId,
    source: sourceLabel,
    apiFetched: Boolean(apiEvents),
    identity: sourceIdentity.stats,
    listedCounts: {
      both: sourceIdentity.listed.both.length,
      returnOnly: sourceIdentity.listed.returnOnly.length,
      multiSale: sourceIdentity.listed.multiSale.length,
      multiReturn: sourceIdentity.listed.multiReturn.length,
    },
    bothExamples: sourceIdentity.listed.both.slice(0, 40),
    multiSaleExamples: sourceIdentity.listed.multiSale.slice(0, 20),
    multiReturnExamples: sourceIdentity.listed.multiReturn.slice(0, 20),
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, finishMoney(v)])),
    categorySamples: categorySrids,
    warehouseRows: whEvents.length,
    warehousePeriodRows: warehousePeriod.length,
    warehouseNativeSaleIds: whEvents.filter((e) => e.native).length,
    warehousePlaceholders: whEvents.filter((e) => e.unresolved).length,
    warehouseBothEventSrids: [...whBySrid.values()].filter(
      (rows) => rows.some((r) => r.eventType === "SALE") && rows.some((r) => r.eventType === "RETURN")
    ).length,
    alreadyRepairedPairs: alreadyRepaired.length,
    missingEventCount: missingFromWarehouse.length,
    dateAxis,
    samples,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    topProducts,
    warehouseTotals,
    sourceTotals,
    productCost,
    impact,
    recovery: {
      automaticallyRecoverableFromCurrentApi: apiEvents ? impact.recoverableEvents : null,
      recoverableOnlyIfEarlierDateFrom: sourceIdentity.stats.returnOnly,
      recoverableFromStoredExports: exportEvents ? exportEvents.length : 0,
      cannotRecoverWithoutNativeEvent: apiEvents ? 0 : "live_api_not_called",
      alreadyRepairedByCurrentResync: alreadyRepaired.length,
    },
  };
}

function warehousePeriodEvents(rows) {
  return rows.map((row) => ({
    eventType: row.eventType,
    priceWithDisc: row.priceWithDisc * (row.quantity || 1),
    finishedPrice: row.finishedPrice * (row.quantity || 1),
    forPay: row.forPay,
  }));
}

function simulateProductCost(warehousePeriod, sourcePeriod, products, costs) {
  function costOf(events, useWarehouse) {
    let known = 0;
    let unresolvedUnits = 0;
    let resolvedUnits = 0;
    for (const event of events) {
      const qty = event.eventType === "RETURN" ? -1 : 1;
      const nmId = event.nmId;
      const product = products.get(Number(nmId)) ?? (useWarehouse && event.productId ? { id: event.productId } : null);
      const productId = product?.id ?? event.productId;
      const cost = productId != null ? costs.get(String(productId)) : null;
      if (cost == null) unresolvedUnits += Math.abs(qty);
      else {
        known += cost * qty;
        resolvedUnits += Math.abs(qty);
      }
    }
    return { productCostKnown: round2(known), unresolvedUnits, resolvedUnits };
  }
  return {
    warehouse: costOf(warehousePeriod, true),
    source: costOf(sourcePeriod, false),
  };
}

function impactFromMissing(missing, sourceEvents, products, costs) {
  const byId = new Map(sourceEvents.map((e) => [e.saleID, e]));
  let gross = 0;
  let returned = 0;
  let sold = 0;
  let retUnits = 0;
  let finished = 0;
  let pc = 0;
  let pcUnresolved = 0;
  let recoverable = 0;
  for (const item of missing) {
    const event = byId.get(item.saleID);
    if (!event) continue;
    recoverable += 1;
    if (event.eventType === "SALE") {
      gross += event.priceWithDisc;
      sold += 1;
      finished += event.finishedPrice;
    } else {
      returned += event.priceWithDisc;
      retUnits += 1;
      finished -= event.finishedPrice;
    }
    const product = products.get(Number(event.nmId));
    const cost = product ? costs.get(String(product.id)) : null;
    if (cost == null) pcUnresolved += 1;
    else pc += cost * (event.eventType === "SALE" ? 1 : -1);
  }
  const tax = calculateEstimatedTax(Math.max(finished, 0), DEFAULT_TAX_PERCENT);
  // Marginal tax on the missing events' finishedPrice net, not a recompute of the account base.
  const taxMarginal = finished > 0 ? finished * (DEFAULT_TAX_PERCENT / 100) : finished * (DEFAULT_TAX_PERCENT / 100);
  return {
    recoverableEvents: recoverable,
    grossSales: round2(gross),
    returnedSales: round2(returned),
    netSales: round2(gross - returned),
    soldUnits: sold,
    returnedUnits: retUnits,
    netUnits: sold - retUnits,
    finishedPriceNet: round2(finished),
    estimatedTaxMarginal: round2(finished * (DEFAULT_TAX_PERCENT / 100)),
    estimatedTaxIfBaseClamped: round2(tax),
    productCost: pcUnresolved ? null : round2(pc),
    productCostKnown: round2(pc),
    productCostUnresolvedUnits: pcUnresolved,
    netProfitImpactWhereProvable:
      pcUnresolved === 0 ? round2(-(pc + finished * (DEFAULT_TAX_PERCENT / 100))) : null,
    note:
      "Net Profit impact holds Revenue, Logistics, Storage, Acceptance, Penalties, Adjustments, and Advertising fixed. Product Cost uses latest approved unit cost × signed unit. Missing product cost is unresolved, not invented.",
  };
}

async function loadCatalog(sb, accountId) {
  const products = await fetchAll(
    sb,
    "products",
    "id, nm_id, supplier_article, marketplace_account_id",
    (q) => q.eq("marketplace_account_id", accountId)
  );
  const productIds = products.map((p) => String(p.id));
  const costs = [];
  for (let i = 0; i < productIds.length; i += 200) {
    const chunk = productIds.slice(i, i + 200);
    const rows = await fetchAll(
      sb,
      "product_cost_history",
      "id, product_id, cost, effective_from, created_at",
      (q) => q.in("product_id", chunk)
    );
    costs.push(...rows);
  }
  const productByNm = new Map(products.map((p) => [Number(p.nm_id), p]));
  const costMap = buildLatestCostByProductId(
    costs,
    products.map((p) => ({ id: String(p.id), supplier_article: p.supplier_article ?? "" }))
  );
  return { productByNm, costMap, productCount: products.length, costRows: costs.length };
}

loadEnv();

const accounts = ["1", "2"];
const locks = Object.fromEntries(accounts.map((id) => [id, liveLock(id)]));
const sb = createAdminClient();
const reports = {};
const extracts = {};

for (const accountId of accounts) {
  const lock = locks[accountId];
  const catalog = await loadCatalog(sb, accountId);
  const warehouseRows = await fetchAll(
    sb,
    "wb_sales",
    "id, sale_id, event_type, srid, nm_id, product_id, sale_date, revenue, price_with_disc, for_pay, quantity, is_return, return_date, warehouse, barcode",
    (q) => q.eq("marketplace_account_id", accountId)
  );

  let apiEvents = null;
  let apiError = null;
  if (lock?.fresh) {
    apiError = `Backfill lock active for account ${accountId} (pid ${lock.pid}, started ${lock.startedAt}). API not called.`;
  } else {
    try {
      const sync = await createWbSyncService(accountId);
      const raw = await sync.getApiClient().fetchSales(DATE_FROM);
      apiEvents = raw.map(toApiEvent).filter((e) => e.saleID && e.srid);
      extracts[accountId] = apiEvents.map((e) => ({
        saleID: e.saleID,
        srid: e.srid,
        date: e.date,
        lastChangeDate: e.lastChangeDate,
        nmId: e.nmId,
        supplierArticle: e.supplierArticle,
        priceWithDisc: e.priceWithDisc,
        finishedPrice: e.finishedPrice,
        forPay: e.forPay,
        warehouse: e.warehouse,
        barcode: e.barcode,
        sourceAmountSigns: e.sourceAmountSigns,
      }));
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err);
    }
  }

  const exportPaths =
    accountId === "2"
      ? ["exports/wb-raw-2026-06-30_2026-07-05/sales.json"]
      : [
          "exports/wb-raw-account1-portal-proof/sales.json",
          "exports/wb-raw-2026-06-18_2026-06-29/sales.json",
        ];
  const exportEvents = [];
  for (const file of exportPaths) {
    exportEvents.push(...loadExportEvents(resolve(file)));
  }

  const compared = compareAccount({
    accountId,
    apiEvents,
    warehouseRows,
    exportEvents: apiEvents ? null : exportEvents,
    costs: catalog.costMap,
    products: catalog.productByNm,
  });

  reports[accountId] = {
    apiError,
    lock,
    catalog: { products: catalog.productCount, costRows: catalog.costRows },
    warehouseSnapshotAt: new Date().toISOString(),
    warehouseRowsLoaded: warehouseRows.length,
    exportEventsLoaded: exportEvents.length,
    exportPaths,
    ...compared,
    pre2026EventsInPayload: apiEvents ? apiEvents.filter((e) => e.date && e.date < FROM).length : null,
    januaryReturnOnly: sourceReturnOnlyInJanuary(apiEvents ?? exportEvents),
  };
}

function sourceReturnOnlyInJanuary(events) {
  const groups = groupBySrid(events.filter((e) => e.date && e.date >= "2026-01-01" && e.date <= "2026-01-31"));
  let returnOnly = 0;
  for (const group of groups.values()) {
    const sales = events.filter((e) => e.srid === [...groups.keys()][0]);
    void sales;
  }
  let count = 0;
  const all = groupBySrid(events);
  for (const [srid, group] of all) {
    const inJan = group.some((e) => e.date && e.date >= "2026-01-01" && e.date <= "2026-01-31");
    if (!inJan) continue;
    const sales = group.filter((e) => e.eventType === "SALE");
    const returns = group.filter((e) => e.eventType === "RETURN");
    if (!sales.length && returns.length) count += 1;
    void srid;
  }
  return count;
}

mkdirSync(OUT_DIR, { recursive: true });
const out = {
  generatedAt: new Date().toISOString(),
  readOnly: true,
  dateFromUsed: DATE_FROM,
  period: { from: FROM, to: TO },
  dateFromDecision:
    "Proceeded with 2026-01-01. Existing proof (account 2 export dateFrom 2026-06-30 included a SALE dated 2026-05-29) shows lastChangeDate of the SALE can move with the later RETURN, so a YTD dateFrom includes those pairs. An earlier dateFrom is not proven necessary before the fetch. Return-only January SRIDs, if any, are reported separately and are not treated as synthesized sales.",
  locks,
  accounts: reports,
};
writeFileSync(resolve(OUT_DIR, "ytd-2026-report.json"), JSON.stringify(out, null, 2));
for (const [accountId, events] of Object.entries(extracts)) {
  writeFileSync(
    resolve(OUT_DIR, `account-${accountId}-api-events.json`),
    JSON.stringify({ accountId, dateFrom: DATE_FROM, count: events.length, events }, null, 2)
  );
}
console.log(
  JSON.stringify(
    {
      written: resolve(OUT_DIR, "ytd-2026-report.json"),
      accounts: Object.fromEntries(
        Object.entries(reports).map(([id, report]) => [
          id,
          {
            apiError: report.apiError,
            identity: report.identity,
            categories: report.categories,
            warehouseRows: report.warehouseRows,
            warehousePlaceholders: report.warehousePlaceholders,
            warehouseBothEventSrids: report.warehouseBothEventSrids,
            missingEventCount: report.missingEventCount,
            impact: report.impact,
          },
        ])
      ),
    },
    null,
    2
  )
);
