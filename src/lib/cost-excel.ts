import * as XLSX from "xlsx";
import type { BulkCostRow } from "@/services/cost-service";

const ARTICLE_HEADERS = ["supplier_article", "product", "article", "артикул", "supplier article"];
const COST_HEADERS = ["cost", "cost_price", "cogs", "себестоимость"];
const DATE_HEADERS = ["effective_from", "effective from", "date", "valid_from", "from"];

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findColumnKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  return Object.keys(row).find((key) => candidates.includes(normalizeHeader(key)));
}

function parseExcelDate(value: unknown): string {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error("Invalid Excel date");
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  if (value instanceof Date) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("Missing effective date");
    return trimmed.split("T")[0];
  }

  throw new Error("Invalid effective date");
}

function parseCost(value: unknown): number {
  const cost = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("Invalid cost value");
  }
  return cost;
}

export function parseCostExcel(buffer: ArrayBuffer): BulkCostRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("Excel file has no worksheets");
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rawRows.length === 0) {
    throw new Error("Excel file is empty");
  }

  const sample = rawRows[0];
  const articleKey = findColumnKey(sample, ARTICLE_HEADERS);
  const costKey = findColumnKey(sample, COST_HEADERS);
  const dateKey = findColumnKey(sample, DATE_HEADERS);

  if (!articleKey || !costKey) {
    throw new Error(
      "Expected columns: supplier_article (or product), cost, and optional effective_from"
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const rows: BulkCostRow[] = [];

  rawRows.forEach((row, index) => {
    const supplierArticle = String(row[articleKey] ?? "").trim();
    if (!supplierArticle) return;

    try {
      rows.push({
        row: index + 2,
        supplier_article: supplierArticle,
        cost: parseCost(row[costKey]),
        effective_from: dateKey ? parseExcelDate(row[dateKey]) : today,
      });
    } catch (err) {
      throw new Error(
        `Row ${index + 2}: ${err instanceof Error ? err.message : "Invalid row"}`
      );
    }
  });

  if (rows.length === 0) {
    throw new Error("No valid rows found in Excel file");
  }

  return rows;
}
