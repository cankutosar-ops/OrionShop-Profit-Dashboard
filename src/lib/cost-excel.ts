import * as XLSX from "xlsx";

export type CostTemplateRow = {
  supplier_article: string;
  unit_cost: number | null;
};

export type ParsedCostImportRow = {
  row: number;
  supplier_article: string;
  new_cost: number | null;
  effective_from?: string;
};

const ARTICLE_HEADERS = [
  "supplier_article",
  "supplier article",
  "product",
  "article",
  "артикул",
];

const UNIT_COST_HEADERS = [
  "unit cost",
  "unit_cost",
  "new cost",
  "new_cost",
  "cost",
  "cost_price",
  "cogs",
  "себестоимость",
];

const TEMPLATE_HEADERS = ["Supplier Article", "Unit Cost"] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findColumnKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  return Object.keys(row).find((key) => candidates.includes(normalizeHeader(key)));
}

function parseUnitCost(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const raw = typeof value === "number" ? String(value) : String(value).trim();
  if (!raw) return null;

  const cost = typeof value === "number" ? value : Number(raw.replace(",", "."));
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("Invalid unit cost value");
  }

  return cost;
}

export function buildCostTemplateWorkbook(rows: CostTemplateRow[]): ArrayBuffer {
  const sheetRows = rows.map((row) => ({
    "Supplier Article": row.supplier_article,
    "Unit Cost": row.unit_cost ?? "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: [...TEMPLATE_HEADERS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Costs");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildCostTemplateFilename(date = new Date()): string {
  const iso = date.toISOString().split("T")[0];
  return `Cost_Management_${iso}.xlsx`;
}

/** Read Supplier Article + Unit Cost only. */
export function parseCostExcel(buffer: ArrayBuffer): ParsedCostImportRow[] {
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
  const unitCostKey = findColumnKey(sample, UNIT_COST_HEADERS);

  if (!articleKey) {
    throw new Error('Expected column: "Supplier Article"');
  }

  if (!unitCostKey) {
    throw new Error('Expected column: "Unit Cost"');
  }

  const today = new Date().toISOString().split("T")[0];
  const rows: ParsedCostImportRow[] = [];

  rawRows.forEach((row, index) => {
    const supplierArticle = String(row[articleKey] ?? "").trim();
    if (!supplierArticle) return;

    try {
      const newCost = parseUnitCost(row[unitCostKey]);
      rows.push({
        row: index + 2,
        supplier_article: supplierArticle,
        new_cost: newCost,
        effective_from: today,
      });
    } catch (err) {
      throw new Error(
        `Row ${index + 2}: ${err instanceof Error ? err.message : "Invalid row"}`
      );
    }
  });

  if (rows.length === 0) {
    throw new Error("No rows with Supplier Article found in Excel file");
  }

  return rows;
}
