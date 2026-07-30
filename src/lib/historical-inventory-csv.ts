/**
 * Sprint 10 — parse archived STOCK_HISTORY_DAILY wide CSV into snapshot rows.
 */

import type { HistoricalInventorySnapshotInsert } from "@/lib/historical-inventory-types";

function detectSep(headerLine: string): ";" | "," {
  return headerLine.includes(";") ? ";" : ",";
}

function splitCsvLine(line: string, sep: ";" | ","): string[] {
  if (sep === ";") {
    return line.split(";").map((c) => c.replace(/^"|"$/g, "").trim());
  }
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** DD.MM.YYYY → YYYY-MM-DD */
export function parseWbDateHeader(header: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(header).trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseHistoricalWideCsv(
  text: string,
  marketplaceAccountId: number
): HistoricalInventorySnapshotInsert[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const sep = detectSep(lines[0]);
  const headers = splitCsvLine(lines[0], sep);
  const idx = Object.fromEntries(headers.map((h, i) => [h, i])) as Record<string, number>;

  const dateCols = headers
    .map((h) => ({ header: h, iso: parseWbDateHeader(h) }))
    .filter((d): d is { header: string; iso: string } => Boolean(d.iso));

  const rows: HistoricalInventorySnapshotInsert[] = [];

  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], sep);
    const nmRaw = cols[idx.NmID] ?? "";
    const nmId = Number(nmRaw);
    if (!Number.isFinite(nmId) || nmId <= 0) continue;

    const warehouse = String(cols[idx.OfficeName] ?? "").trim();
    const brand = String(cols[idx.BrandName] ?? "").trim();
    const subject = String(cols[idx.SubjectName] ?? "").trim();
    const sellerArticle = String(cols[idx.VendorCode] ?? "").trim();
    const size = String(cols[idx.SizeName] ?? "").trim();
    const barcode = ""; // STOCK_HISTORY_DAILY_CSV does not include barcode

    for (const d of dateCols) {
      const qtyRaw = cols[idx[d.header]] ?? "0";
      const quantity =
        Number(String(qtyRaw).replace(/\s/g, "").replace(",", ".")) || 0;

      rows.push({
        snapshot_date: d.iso,
        marketplace_account_id: marketplaceAccountId,
        warehouse_name: warehouse,
        brand,
        subject,
        seller_article: sellerArticle,
        nm_id: nmId,
        barcode,
        size,
        quantity,
        // STOCK_HISTORY_DAILY has no transit fields — explicit 0 (not unknown).
        in_way_to_client: 0,
        in_way_from_client: 0,
      });
    }
  }

  return rows;
}

/** Day-folder raw.csv (normalized long format from recovery script). */
export function parseHistoricalDayRawCsv(
  text: string,
  marketplaceAccountId: number,
  snapshotDate: string
): HistoricalInventorySnapshotInsert[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const sep = detectSep(lines[0]);
  const headers = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const find = (...names: string[]) => {
    for (const n of names) {
      const i = headers.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iDate = find("snapshot date", "snapshot_date");
  const iWh = find("warehouse");
  const iSku = find("seller sku", "seller_article", "vendor");
  const iNm = find("wb sku", "nm");
  const iSize = find("size");
  const iQty = find("quantity");
  const iBrand = find("brand");
  const iSubject = find("subject");
  const iBarcode = find("barcode");

  const rows: HistoricalInventorySnapshotInsert[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = splitCsvLine(lines[r], sep);
    const nmId = Number(cols[iNm] ?? "");
    if (!Number.isFinite(nmId) || nmId <= 0) continue;
    const date =
      iDate >= 0 && cols[iDate]
        ? /^\d{2}\.\d{2}\.\d{4}$/.test(cols[iDate])
          ? parseWbDateHeader(cols[iDate]) ?? snapshotDate
          : cols[iDate].slice(0, 10)
        : snapshotDate;

    rows.push({
      snapshot_date: date,
      marketplace_account_id: marketplaceAccountId,
      warehouse_name: String(cols[iWh] ?? "").trim(),
      brand: iBrand >= 0 ? String(cols[iBrand] ?? "").trim() : "",
      subject: iSubject >= 0 ? String(cols[iSubject] ?? "").trim() : "",
      seller_article: String(cols[iSku] ?? "").trim(),
      nm_id: nmId,
      barcode: iBarcode >= 0 ? String(cols[iBarcode] ?? "").trim() : "",
      size: String(cols[iSize] ?? "").trim(),
      quantity: Number(String(cols[iQty] ?? "0").replace(",", ".")) || 0,
      in_way_to_client: 0,
      in_way_from_client: 0,
    });
  }
  return rows;
}
