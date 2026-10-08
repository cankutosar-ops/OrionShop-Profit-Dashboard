import { escapeSpreadsheetCsvCell } from '@/lib/csv-cell';
import type { OzonFinanceModel } from './finance-model';

export function renderOzonFinanceCsv(model: OzonFinanceModel) {
  const rows = [['Account','From','To','Status','Accrual date','Source identity','Component','SKU','Currency','Signed amount','Source path'],
    [model.accountId,model.from,model.to,model.status,'','','Source observations; Net Profit is not finalized','','','','report_status'],
    ...model.lines.map(line => [model.accountId,model.from,model.to,model.status,line.date,line.identity,line.label,line.sku ?? '',line.currency,line.signedAmount,line.sourcePath])];
  return '\uFEFF' + rows.map((row,i) => row.map((value,column) => escapeSpreadsheetCsvCell(value,i > 0 && column === 9)).join(',')).join('\r\n');
}
