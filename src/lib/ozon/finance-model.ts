import { addDecimal, money, negateDecimal } from './money';
import { classifyOzonAccrual, type OzonAccrualType, type OzonExpenseCategory } from './finance-types';

export type OzonFinanceSnapshot = { id: string; marketplace_account_id: string; accrual_date: string; accruals: Record<string, unknown>[]; dictionary?: OzonAccrualType[] | null };
export type OzonFinanceLine = { identity: string; date: string; category: OzonExpenseCategory | 'sales' | 'sellerSubsidies';
  label: string; signedAmount: string; currency: string; sku: string | null; sourcePath: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value) || !value.every(object)) throw new Error('invalid_ozon_finance_components');
  return value;
};
const validSku = (value: unknown) => (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
  (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);

/** Accrual source projection, not WB V4. Control totals are never additional expenses. */
export function buildOzonFinanceModel(input: { accountId: string; from: string; to: string;
  snapshots: OzonFinanceSnapshot[]; dictionary: OzonAccrualType[] | null;
}) {
  const lines: OzonFinanceLine[] = [], issues: string[] = [], controls: { date: string; currency: string; amount: string; matched: boolean }[] = [];
  const days = new Set<string>(), ids = new Set<string>();
  for (const snapshot of input.snapshots) {
    if (String(snapshot.marketplace_account_id) !== input.accountId || snapshot.accrual_date < input.from || snapshot.accrual_date > input.to || days.has(snapshot.accrual_date) || ids.has(snapshot.id)) throw new Error('ozon_finance_scope_or_snapshot_conflict');
    days.add(snapshot.accrual_date); ids.add(snapshot.id);
    const identicalRows = new Set<string>();
    for (const [rowIndex, row] of snapshot.accruals.entries()) {
      const rowKey = JSON.stringify(row);
      if (identicalRows.has(rowKey)) issues.push(`${snapshot.accrual_date}:identical_source_rows_require_review`);
      identicalRows.add(rowKey);
      const rowLines: OzonFinanceLine[] = [];
      const emit = (value: unknown, category: OzonFinanceLine['category'], path: string, label: string, sku: unknown = null) => {
        if (lines.length + rowLines.length >= 50000) throw new Error('ozon_finance_component_budget_exhausted');
        const m = money(value);
        rowLines.push({ identity: `${snapshot.id}:${rowIndex}:${path}`, date: snapshot.accrual_date,
          category, label, signedAmount: m.amount, currency: m.currency,
          sku: typeof sku === 'string' || (typeof sku === 'number' && Number.isSafeInteger(sku)) ? String(sku) : null, sourcePath: path });
      };
      const fee = (value: Record<string, unknown>, path: string, sku: unknown = null) => {
        const type = classifyOzonAccrual(value.type_id, snapshot.dictionary ?? input.dictionary ?? []);
        emit(value.accrued, type.category, path, type.name, sku);
        if (type.category === 'unknown') issues.push(`${snapshot.accrual_date}:unknown_type:${String(value.type_id)}`);
      };
      try {
        if (row.date !== snapshot.accrual_date) throw new Error('accrual_date_mismatch');
        const category = row.accrued_category;
        const chosen = ({ POSTING: 'posting', ITEM: 'item_fees', NON_ITEM: 'non_item_fee', CONTAINER_FEES: 'container_fees' } as Record<string, string>)[String(category)];
        if (!chosen || !object(row[chosen])) throw new Error('unknown_accrual_category');
        // Unselected branches can be null/empty placeholders, never silently hide supplied money.
        for (const branch of ['posting','item_fees','non_item_fee','container_fees']) {
          if (branch !== chosen && object(row[branch]) && /"amount"\s*:/.test(JSON.stringify(row[branch]))) throw new Error('overlapping_accrual_branches');
        }
        if (category === 'POSTING') {
          for (const [p, product] of array((row.posting as Record<string, unknown>).products).entries()) {
            if (!validSku(product.sku)) throw new Error('invalid_posting_sku');
            if (!object(product.commission)) throw new Error('missing_posting_commission');
            const c = product.commission, prefix = `posting.products[${p}]`;
            emit(c.sale_amount, 'sales', `${prefix}.commission.sale_amount`, 'Realized sale amount', product.sku);
            emit(c.commission, 'commission', `${prefix}.commission.commission`, 'Final commission', product.sku);
            for (const name of ['bonus','coinvestment']) emit(c[name], 'sellerSubsidies', `${prefix}.commission.${name}`, name, product.sku);
            // seller_price/sale_price are unit prices; sale_commission is a list-price comparison, not a second deduction.
            if (!object(product.delivery)) throw new Error('missing_delivery_components');
            const before = rowLines.length;
            for (const [i, service] of array(product.delivery.services).entries()) fee(service, `${prefix}.delivery.services[${i}]`, product.sku);
            const control = money(product.delivery.total_accrued), delivered = rowLines.slice(before);
            if (delivered.some(line => line.currency !== control.currency) || addDecimal(...delivered.map(line => line.signedAmount)) !== control.amount) throw new Error('delivery_control_mismatch');
          }
        } else if (category === 'ITEM') {
          for (const [g, group] of array((row.item_fees as Record<string, unknown>).fees).entries()) {
            if (!validSku(group.sku)) throw new Error('invalid_item_sku');
            for (const [i, component] of array(group.fees).entries()) fee(component, `item_fees.fees[${g}].fees[${i}]`, group.sku);
          }
        } else if (category === 'NON_ITEM') fee(row.non_item_fee as Record<string, unknown>, 'non_item_fee');
        else for (const [i, component] of array((row.container_fees as Record<string, unknown>).fees).entries()) fee(component, `container_fees.fees[${i}]`);
        const total = money(row.total_amount);
        const matched = rowLines.every(line => line.currency === total.currency) && addDecimal(...rowLines.map(line => line.signedAmount)) === total.amount;
        controls.push({ date: snapshot.accrual_date, currency: total.currency, amount: total.amount, matched });
        if (!matched) issues.push(`${snapshot.accrual_date}:row_control_mismatch:${rowIndex}`);
      } catch (error) { issues.push(`${snapshot.accrual_date}:${error instanceof Error ? error.message : 'invalid_source'}:${rowIndex}`); }
      lines.push(...rowLines);
    }
  }
  const currencies = [...new Set(lines.map(line => line.currency))];
  if (currencies.some(currency => currency !== 'RUB')) issues.push('non_rub_source_no_fx_inference');
  const totals = currencies.map(currency => {
    const relevant = lines.filter(line => line.currency === currency);
    const categories = [...new Set(relevant.map(line => line.category))].map(category => ({ category,
      signedAmount: addDecimal(...relevant.filter(line => line.category === category).map(line => line.signedAmount)),
      deduction: negateDecimal(addDecimal(...relevant.filter(line => line.category === category).map(line => line.signedAmount))) }));
    return { currency, categories,
      grossSales: addDecimal(...relevant.filter(line => line.category === 'sales' && !line.signedAmount.startsWith('-')).map(line => line.signedAmount)),
      returnedSales: negateDecimal(addDecimal(...relevant.filter(line => line.category === 'sales' && line.signedAmount.startsWith('-')).map(line => line.signedAmount))),
      netSales: addDecimal(...relevant.filter(line => line.category === 'sales').map(line => line.signedAmount)),
      revenueBeforeOtherExpenses: addDecimal(...relevant.filter(line => ['sales','sellerSubsidies','commission','acquiring'].includes(line.category)).map(line => line.signedAmount)),
      sourcePnlContribution: addDecimal(...relevant.filter(line => line.category !== 'cashMovement' && line.category !== 'unknown').map(line => line.signedAmount)),
      controlTotal: addDecimal(...controls.filter(control => control.currency === currency).map(control => control.amount)) };
  });
  return { accountId: input.accountId, from: input.from, to: input.to, daysChecked: days.size, lines, totals,
    issues: [...new Set(issues)], sourceControlsMatched: controls.length > 0 && controls.every(control => control.matched) && issues.length === 0,
    status: !input.snapshots.length ? 'NOT_CAPTURED' as const : !lines.length && !issues.length ? 'NO_ACCRUALS_REPORTED' as const : issues.length ? 'INCOMPLETE' as const : 'SOURCE_RECONCILED' as const,
    // Source agreement cannot establish missing COGS, tax treatment, or publication completeness.
    netProfit: null as string | null, productCost: null as string | null, tax: null as string | null, accountingComplete: false as const };
}
export type OzonFinanceModel = ReturnType<typeof buildOzonFinanceModel>;
