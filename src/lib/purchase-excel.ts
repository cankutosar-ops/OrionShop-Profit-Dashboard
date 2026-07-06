import * as XLSX from "xlsx";

export type PurchaseTemplateRow = {
  supplier_article: string;
};

export type PurchaseExcelParseResult = {
  rows: ParsedPurchaseImportRow[];
  skipped: number;
  errors: { row: number; message: string }[];
};

const ARTICLE_HEADERS = [
  "supplier_article",
  "supplier article",
  "product",
  "article",
  "артикул",
];

const QUANTITY_HEADERS = ["quantity", "qty", "amount", "количество"];
const UNIT_COST_HEADERS = [
  "unit cost",
  "unit_cost",
  "cost",
  "cost_price",
  "unit price",
  "себестоимость",
];

const TEMPLATE_HEADERS = ["Supplier Article", "Quantity", "Unit Cost"] as const;

export type ParsedPurchaseImportRow = {
  row: number;
  supplier_article: string;
  quantity: number;
  unit_cost: number;
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findColumnKey(row: Record<string, unknown>, candidates: string[]): string | undefined {
  return Object.keys(row).find((key) => candidates.includes(normalizeHeader(key)));
}

function parseQuantity(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    throw new Error("Quantity is required");
  }
  const qty = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
    throw new Error("Quantity must be a positive whole number");
  }
  return qty;
}

function parseUnitCost(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    throw new Error("Unit Cost is required");
  }
  const cost = typeof value === "number" ? value : Number(String(value).replace(",", ".").trim());
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error("Unit Cost must be a non-negative number");
  }
  return cost;
}

export function buildPurchaseTemplateWorkbook(rows: PurchaseTemplateRow[]): ArrayBuffer {
  const sheetRows = rows.map((row) => ({
    "Supplier Article": row.supplier_article,
    Quantity: "",
    "Unit Cost": "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows, { header: [...TEMPLATE_HEADERS] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Purchases");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildPurchaseTemplateFilename(date = new Date()): string {
  const iso = date.toISOString().split("T")[0];
  return `Purchases_Template_${iso}.xlsx`;
}

export function parsePurchaseExcel(buffer: ArrayBuffer): PurchaseExcelParseResult {
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
  const quantityKey = findColumnKey(sample, QUANTITY_HEADERS);
  const unitCostKey = findColumnKey(sample, UNIT_COST_HEADERS);

  if (!articleKey) {
    throw new Error('Expected column: "Supplier Article"');
  }
  if (!quantityKey) {
    throw new Error('Expected column: "Quantity"');
  }
  if (!unitCostKey) {
    throw new Error('Expected column: "Unit Cost"');
  }

  const rows: ParsedPurchaseImportRow[] = [];
  const errors: { row: number; message: string }[] = [];
  let skipped = 0;

  rawRows.forEach((row, index) => {
    const supplierArticle = String(row[articleKey] ?? "").trim();
    if (!supplierArticle) return;

    try {
      rows.push({
        row: index + 2,
        supplier_article: supplierArticle,
        quantity: parseQuantity(row[quantityKey]),
        unit_cost: parseUnitCost(row[unitCostKey]),
      });
    } catch (err) {
      skipped += 1;
      errors.push({
        row: index + 2,
        message: err instanceof Error ? err.message : "Invalid row",
      });
    }
  });

  if (rows.length === 0 && skipped === 0) {
    throw new Error("No rows with Supplier Article found in Excel file");
  }

  return { rows, skipped, errors };
}
