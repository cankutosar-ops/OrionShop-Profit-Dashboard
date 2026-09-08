/**
 * Finance API V1 sales-reports — local mapping, token gates, and request shaping.
 *
 * Live Wildberries HTTP must only run after:
 * - FINANCE_V1_LIVE_REQUESTS_ENABLED=true
 * - Personal/Service token with Finance category (bit 13)
 * - Account 2 recovery reservation / wake preflight
 *
 * Statistics v5 reportDetailByPeriod is not used for Account 2 recovery.
 */
import { parseWbMoney } from "@/lib/cash-received";
import { mapFinanceRowsFromReport, buildFinanceSourceKey } from "@/lib/wildberries/mappers";
import type { WbApiFinanceRow } from "@/lib/wildberries/types";
import type { WbFinance } from "@/types/database";

export const WB_FINANCE_V1_DETAILED_PATH = "/api/finance/v1/sales-reports/detailed";
export const WB_FINANCE_V1_LIST_PATH = "/api/finance/v1/sales-reports/list";
export const WB_FINANCE_V1_DEFAULT_LIMIT = 100_000;
export const WB_FINANCE_V1_MAX_LIMIT = 100_000;

/** Explicit opt-in for any Finance V1 HTTP. Default: disabled. */
export const FINANCE_V1_LIVE_REQUESTS_ENV = "FINANCE_V1_LIVE_REQUESTS_ENABLED";

/** Official JWT bitmask: bit position N is set when `(s & (1 << (N - 1))) !== 0`. */
export const WB_TOKEN_BIT_STATISTICS = 5;
export const WB_TOKEN_BIT_FINANCE = 13;

export type WbFinanceV1Period = "weekly" | "daily";

export type WbFinanceV1DetailedRequest = {
  dateFrom: string;
  dateTo: string;
  limit: number;
  rrdId: number;
  period: WbFinanceV1Period;
  fields?: string[];
};

/** Official camelCase detailed row. Money fields may be string or number. */
export type WbFinanceV1DetailedRow = {
  rrdId?: number | string;
  reportId?: number | string;
  nmId?: number | string;
  vendorCode?: string;
  rrDate?: string;
  saleDt?: string;
  sellerOperName?: string;
  docTypeName?: string;
  forPay?: string | number | null;
  ppvzSalesCommission?: string | number | null;
  deliveryService?: string | number | null;
  deliveryAmount?: string | number | null;
  paidStorage?: string | number | null;
  paidAcceptance?: string | number | null;
  acquiringFee?: string | number | null;
  ppvzReward?: string | number | null;
  additionalPayment?: string | number | null;
  vw?: string | number | null;
  rebillLogisticCost?: string | number | null;
  deduction?: string | number | null;
  penalty?: string | number | null;
  srid?: string;
  quantity?: number | string | null;
  retailAmount?: string | number | null;
  sku?: string;
};

export type FinanceV1MoneyDecision =
  | "direct"
  | "transform_required"
  | "no_equivalent"
  | "uncertain";

export const FINANCE_V1_FIELD_DECISIONS: Record<string, FinanceV1MoneyDecision> = {
  rrd_id: "direct",
  realizationreport_id: "direct",
  nm_id: "direct",
  sa_name: "direct",
  rr_dt: "direct",
  sale_dt: "direct",
  supplier_oper_name: "direct",
  doc_type_name: "direct",
  ppvz_for_pay: "transform_required",
  ppvz_sales_commission: "transform_required",
  // Proven 2026-09 audit: V1 deliveryService is the money string (ex-v5 delivery_rub);
  // deliveryAmount is delivery count, not rubles. Official field map: delivery_rub → deliveryService.
  delivery_rub: "transform_required",
  storage_fee: "transform_required",
  acceptance: "transform_required",
  acquiring_fee: "transform_required",
  ppvz_reward: "transform_required",
  additional_payment: "transform_required",
  ppvz_vw: "transform_required",
  rebill_logistic_cost: "transform_required",
  deduction: "transform_required",
  penalty: "transform_required",
  srid: "direct",
};

export type WbTokenType = "base" | "test" | "personal" | "service" | "unknown";

export type WbTokenAccessClaims = {
  acc: number | null;
  for: string | null;
  t: boolean | null;
  s: number | null;
  tokenType: WbTokenType;
  hasFinanceCategory: boolean | null;
  hasStatisticsCategory: boolean | null;
  financeV1Ready: boolean;
};

export function tokenBitSet(bitmask: number | null, bitPosition: number): boolean | null {
  if (bitmask == null || !Number.isFinite(bitmask) || bitPosition < 1) return null;
  return (bitmask & (1 << (bitPosition - 1))) !== 0;
}

export function classifyWbTokenType(input: {
  acc: number | null;
  for: string | null;
  t: boolean | null;
}): WbTokenType {
  if (input.acc === 4) return "service";
  if (input.acc === 3) return "personal";
  if (input.acc === 2 || input.t === true) return "test";
  if (input.acc === 1) return "base";
  if (input.for == null && input.acc == null) return "unknown";
  if (input.for == null) return "base";
  if (String(input.for).startsWith("asid:")) return "service";
  if (input.for === "self") return "personal";
  return "unknown";
}

export function inspectWbTokenAccessClaims(
  payload: Record<string, unknown>
): WbTokenAccessClaims {
  const acc = typeof payload.acc === "number" ? payload.acc : null;
  const forValue = typeof payload.for === "string" ? payload.for : payload.for == null ? null : String(payload.for);
  const t = typeof payload.t === "boolean" ? payload.t : null;
  const s = typeof payload.s === "number" ? payload.s : null;
  const tokenType = classifyWbTokenType({ acc, for: forValue, t });
  const hasFinanceCategory = tokenBitSet(s, WB_TOKEN_BIT_FINANCE);
  const hasStatisticsCategory = tokenBitSet(s, WB_TOKEN_BIT_STATISTICS);
  const financeV1Ready =
    (tokenType === "personal" || tokenType === "service") && hasFinanceCategory === true;
  return {
    acc,
    for: forValue,
    t,
    s,
    tokenType,
    hasFinanceCategory,
    hasStatisticsCategory,
    financeV1Ready,
  };
}

/** Decode JWT payload only (no signature verify, no network). Never log the token. */
export function decodeWbJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = String(token ?? "").split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function isFinanceV1LiveRequestsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env[FINANCE_V1_LIVE_REQUESTS_ENV]?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Fail closed before any Finance V1 HTTP. Live calls require an explicit env
 * opt-in so offline verification and accidental resume cannot hit Wildberries.
 */
export function assertFinanceV1LiveAllowed(
  env: NodeJS.ProcessEnv = process.env
): void {
  if (!isFinanceV1LiveRequestsEnabled(env)) {
    throw new Error(
      `${FINANCE_V1_LIVE_REQUESTS_ENV} is not true — Finance V1 HTTP is blocked (offline / pre-live safety)`
    );
  }
}

/**
 * Fail closed when the JWT is Base/Test or Finance category is missing/unproven.
 * Does not call Wildberries.
 */
export function assertFinanceV1TokenReady(token: string): WbTokenAccessClaims {
  const payload = decodeWbJwtPayload(token);
  if (!payload) {
    throw new Error("Finance V1 token JWT payload could not be decoded — fail closed, no HTTP");
  }
  const claims = inspectWbTokenAccessClaims(payload);
  if (claims.tokenType === "base" || claims.tokenType === "test") {
    throw new Error(
      `Finance V1 rejected: token type=${claims.tokenType} (Personal or Service required) — no HTTP`
    );
  }
  if (claims.hasFinanceCategory !== true) {
    throw new Error(
      "Finance V1 rejected: Finance category (bit 13) not proven on token — no HTTP"
    );
  }
  if (!claims.financeV1Ready) {
    throw new Error("Finance V1 rejected: token is not Personal/Service + Finance — no HTTP");
  }
  return claims;
}

export type FinanceV1ListRequest = {
  dateFrom: string;
  dateTo: string;
  period: WbFinanceV1Period;
  limit: number;
  offset: number;
};

export function buildFinanceV1ListRequest(input: {
  dateFrom: string;
  dateTo: string;
  period?: WbFinanceV1Period;
  limit?: number;
  offset?: number;
}): FinanceV1ListRequest {
  const limit = input.limit ?? 1000;
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`Invalid Finance V1 list limit: ${String(input.limit)}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error(`Invalid Finance V1 list offset: ${String(input.offset)}`);
  }
  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    period: input.period ?? "weekly",
    limit,
    offset,
  };
}

/**
 * Offline reconciliation scaffold: compare list forPaySum control total to
 * Σ detailed forPay lines. Does not invent rows from list data.
 */
export function reconcileFinanceV1ForPayTotals(input: {
  listForPaySum: number | null;
  detailedForPaySum: number;
  toleranceRub?: number;
}): {
  ok: boolean;
  delta: number | null;
  status: "match" | "mismatch" | "list_unavailable";
} {
  const tolerance = input.toleranceRub ?? 0.01;
  if (input.listForPaySum == null || !Number.isFinite(input.listForPaySum)) {
    return { ok: false, delta: null, status: "list_unavailable" };
  }
  const delta = input.detailedForPaySum - input.listForPaySum;
  const ok = Math.abs(delta) <= tolerance;
  return { ok, delta, status: ok ? "match" : "mismatch" };
}

export function buildFinanceV1DetailedRequest(input: {
  dateFrom: string;
  dateTo: string;
  rrdId?: number;
  limit?: number;
  period?: WbFinanceV1Period;
}): WbFinanceV1DetailedRequest {
  const rrdId = input.rrdId ?? 0;
  const limit = input.limit ?? WB_FINANCE_V1_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(rrdId) || rrdId < 0) {
    throw new Error(`Invalid Finance V1 rrdId: ${String(input.rrdId)}`);
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > WB_FINANCE_V1_MAX_LIMIT) {
    throw new Error(`Invalid Finance V1 limit: ${String(input.limit)}`);
  }
  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    limit,
    rrdId,
    period: input.period ?? "weekly",
  };
}

/** 204 / empty page: official “repeat until 204” / no data. */
export function isFinanceV1DetailedEmpty(rows: unknown): boolean {
  return rows == null || (Array.isArray(rows) && rows.length === 0);
}

export function parseFinanceV1Money(
  value: string | number | null | undefined
): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = parseWbMoney(value);
  return parsed === 0 && (value === 0 || value === "0" || value === "0.0") ? 0 : parsed;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Convert a V1 detailed row into the v5-shaped record the existing mapper
 * understands.
 *
 * delivery_rub ← deliveryService (money string). Empirically confirmed on Account 2
 * Reports/V1 rows (e.g. deliveryService="223.91", deliveryAmount=1 = count).
 * Matches official v5→v1 rename: delivery_rub → deliveryService.
 * Do NOT use deliveryAmount as rubles.
 */
export function normalizeFinanceV1DetailedRow(
  row: WbFinanceV1DetailedRow
): WbApiFinanceRow {
  const rrdId = asFiniteNumber(row.rrdId);
  if (rrdId == null || !Number.isSafeInteger(rrdId)) {
    throw new Error("Finance V1 row is missing a safe integer rrdId");
  }
  return {
    rrd_id: rrdId,
    realizationreport_id: asFiniteNumber(row.reportId),
    nm_id: asFiniteNumber(row.nmId),
    sa_name: row.vendorCode,
    rr_dt: row.rrDate,
    sale_dt: row.saleDt,
    supplier_oper_name: row.sellerOperName,
    doc_type_name: row.docTypeName,
    ppvz_for_pay: parseFinanceV1Money(row.forPay),
    ppvz_sales_commission: parseFinanceV1Money(row.ppvzSalesCommission),
    delivery_rub: parseFinanceV1Money(row.deliveryService),
    storage_fee: parseFinanceV1Money(row.paidStorage),
    acceptance: parseFinanceV1Money(row.paidAcceptance),
    acquiring_fee: parseFinanceV1Money(row.acquiringFee),
    ppvz_reward: parseFinanceV1Money(row.ppvzReward),
    additional_payment: parseFinanceV1Money(row.additionalPayment),
    ppvz_vw: parseFinanceV1Money(row.vw),
    rebill_logistic_cost: parseFinanceV1Money(row.rebillLogisticCost),
    deduction: parseFinanceV1Money(row.deduction),
    penalty: parseFinanceV1Money(row.penalty),
    srid: row.srid,
    // sku / quantity / retailAmount are accepted on the V1 type for audit but
    // are not written onto wb_finance lines by mapFinanceRowsFromReport today.
    retail_amount: parseFinanceV1Money(row.retailAmount),
  };
}

export function mapFinanceRowsFromV1Detailed(
  row: WbFinanceV1DetailedRow,
  productId: string | null
): Omit<WbFinance, "id" | "marketplace_account_id">[] {
  return mapFinanceRowsFromReport(normalizeFinanceV1DetailedRow(row), productId);
}

export function nextFinanceV1Cursor(input: {
  rows: Array<{ rrdId?: number | string }>;
  currentRrdId: number;
}): { isEmpty: boolean; hasMore: boolean; nextRrdId: number } {
  if (input.rows.length === 0) {
    return { isEmpty: true, hasMore: false, nextRrdId: input.currentRrdId };
  }
  const last = asFiniteNumber(input.rows[input.rows.length - 1]?.rrdId);
  if (last == null || !Number.isSafeInteger(last)) {
    throw new Error("Finance V1 page is missing a safe last rrdId");
  }
  const hasMore = last !== input.currentRrdId;
  return {
    isEmpty: false,
    hasMore,
    nextRrdId: hasMore ? last : input.currentRrdId,
  };
}

export function v1SourceKey(rrdId: number, suffix: string): string {
  return buildFinanceSourceKey(rrdId, suffix);
}
