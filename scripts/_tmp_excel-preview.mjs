import { createRequire } from "module";
import { writeFileSync } from "fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const path =
  "C:/Users/User/Downloads/Еженедельный отчет 2024-01-29 - 2026-07-19_1202289.xlsx";
const wb = XLSX.readFile(path, { cellDates: true });

const out = { sheets: wb.SheetNames, previews: {} };

for (const name of wb.SheetNames) {
  const sh = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sh, {
    header: 1,
    defval: null,
    raw: true,
  });
  const preview = [];
  for (let i = 0; i < rows.length && preview.length < 60; i++) {
    const r = rows[i] || [];
    if (!r.some((c) => c !== null && c !== "")) continue;
    preview.push({
      i,
      cells: r.slice(0, 15).map((c) => {
        if (c == null) return null;
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        if (typeof c === "number") return c;
        return String(c).replace(/\s+/g, " ").slice(0, 120);
      }),
    });
  }
  out.previews[name] = {
    ref: sh["!ref"],
    rowCount: rows.length,
    preview,
  };
}

writeFileSync("exports/wb-excel-sheet-preview.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ sheets: out.sheets, counts: Object.fromEntries(Object.entries(out.previews).map(([k,v]) => [k, v.rowCount])) }, null, 2));
console.log(JSON.stringify(out.previews[out.sheets[0]]?.preview?.slice(0, 30), null, 2));
