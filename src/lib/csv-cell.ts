/** Serialize a CSV cell for spreadsheet consumers without evaluating text as a formula. */
export function escapeSpreadsheetCsvCell(value: string, numeric = false): string {
  // A leading apostrophe is Excel's text marker. Keep actual numeric cells
  // numeric so negative business amounts retain their displayed value.
  const safe = !numeric && /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(value)
    ? `'${value}`
    : value;
  return /[,;"\r\n]/.test(safe)
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}
