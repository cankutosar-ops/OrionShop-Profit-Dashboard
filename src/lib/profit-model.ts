/** URL key for dashboard profit model selection. */
export const PROFIT_MODEL_PARAM = "profitModel";

export type ProfitModel = "b" | "c";

const PROFIT_MODEL_LABELS: Record<ProfitModel, string> = {
  b: "Model B — Commercial Profit",
  c: "Model C — Settlement Profit",
};

const PROFIT_MODEL_SWITCHER_LABELS: Record<ProfitModel, string> = {
  b: "Model B",
  c: "Model C",
};

export function parseProfitModel(value: string | null | undefined): ProfitModel {
  if (value === "c") return "c";
  return "b";
}

export function getProfitModelLabel(model: ProfitModel): string {
  return PROFIT_MODEL_LABELS[model];
}

export function getProfitModelSwitcherLabel(model: ProfitModel): string {
  return PROFIT_MODEL_SWITCHER_LABELS[model];
}

export function isProfitModelC(model: ProfitModel): boolean {
  return model === "c";
}
