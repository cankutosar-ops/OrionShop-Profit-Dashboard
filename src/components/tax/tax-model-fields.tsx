"use client";

import type { CompanyVatStatus } from "@/types/database";

export type TaxModelForm = {
  tax_model: "USN_INCOME" | "USN_INCOME_MINUS_EXPENSES" | "CUSTOM";
  custom_tax_object: "USN_INCOME" | "USN_INCOME_MINUS_EXPENSES";
  custom_tax_rate: string;
  vat_status: CompanyVatStatus;
};

export const DEFAULT_TAX_MODEL_FORM: TaxModelForm = {
  tax_model: "USN_INCOME", custom_tax_object: "USN_INCOME", custom_tax_rate: "6",
  vat_status: "UNKNOWN",
};

export function TaxModelFields({ value, onChange }: {
  value: TaxModelForm;
  onChange: (value: TaxModelForm) => void;
}) {
  return (
    <>
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">Tax Model</span>
        <select required value={value.tax_model} onChange={(event) => onChange({ ...value, tax_model: event.target.value as TaxModelForm["tax_model"] })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2">
          <option value="USN_INCOME">УСН Доходы — 6%</option>
          <option value="USN_INCOME_MINUS_EXPENSES">УСН Доходы минус Расходы — 15%</option>
          <option value="CUSTOM">Custom rate</option>
        </select>
      </label>
      {value.tax_model === "CUSTOM" ? (
        <>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Custom tax object</span>
            <select value={value.custom_tax_object} onChange={(event) => onChange({ ...value, custom_tax_object: event.target.value as TaxModelForm["custom_tax_object"] })}
              className="w-full rounded-xl border border-border bg-background px-3 py-2">
              <option value="USN_INCOME">УСН Доходы</option>
              <option value="USN_INCOME_MINUS_EXPENSES">УСН Доходы минус Расходы</option>
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Rate (%)</span>
            <input type="number" required min="0.01" max="100" step="0.01" value={value.custom_tax_rate}
              onChange={(event) => onChange({ ...value, custom_tax_rate: event.target.value })}
              className="w-full rounded-xl border border-border bg-background px-3 py-2" />
          </label>
        </>
      ) : null}
      <label className="space-y-1.5 text-sm">
        <span className="font-medium">VAT Status</span>
        <select required value={value.vat_status}
          onChange={(event) => onChange({ ...value, vat_status: event.target.value as CompanyVatStatus })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2">
          <option value="UNKNOWN">Unknown / not confirmed</option>
          <option value="EXEMPT">VAT exempt</option>
          <option value="VAT_APPLICABLE">VAT applicable</option>
        </select>
      </label>
    </>
  );
}
