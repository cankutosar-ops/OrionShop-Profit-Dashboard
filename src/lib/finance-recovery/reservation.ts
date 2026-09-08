/**
 * Production-wide reservation of the Account 2 Wildberries Finance request quota.
 *
 * Deployed cron/API instances cannot read an operator workstation's recovery
 * progress JSON, so the local file alone can never prove that recovery owns the
 * quota. The deployed environment variable is therefore authoritative, and any
 * state that cannot be resolved is treated as reserved (fail closed).
 *
 * Configure ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE in Vercel:
 * Project → Settings → Environment Variables → Production (and Preview if
 * cron/API run there). Also set it in the operator .env.local before a wake.
 */

import { existsSync, readFileSync } from "fs";

export const FINANCE_RESERVATION_ENV_VAR =
  "ACCOUNT2_FINANCE_RECOVERY_CAMPAIGN_ACTIVE";

/** Only Account 2 is under historical Finance recovery; Account 1 is never gated. */
export const FINANCE_RESERVED_ACCOUNT_IDS = ["2"] as const;

/**
 * Vercel sets VERCEL=1 on every cron and serverless invocation. Those
 * processes cannot see an operator workstation progress file, so they must
 * not consult one.
 */
export function isDeployedFinanceRuntime(): boolean {
  const vercel = process.env.VERCEL?.trim().toLowerCase();
  return vercel === "1" || vercel === "true";
}

export type FinanceReservationSource =
  | "not_reserved_account"
  | "environment"
  | "progress_file"
  | "fail_closed";

export type FinanceReservationDecision = {
  /** True when a non-recovery Finance caller must not touch this account. */
  reserved: boolean;
  source: FinanceReservationSource;
  /** True only when the deployed environment answered explicitly. */
  productionAuthoritative: boolean;
  detail: string;
};

function readEnvReservation(): "true" | "false" | null {
  const raw = process.env[FINANCE_RESERVATION_ENV_VAR];
  if (raw == null) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return "true";
  if (normalized === "false" || normalized === "0") return "false";
  return null;
}

function readCampaignStatusFromFile(
  marketplaceAccountId: string,
  progressPath: string
): string | null {
  if (!existsSync(progressPath)) return null;
  try {
    const state = JSON.parse(readFileSync(progressPath, "utf8")) as {
      accountId?: unknown;
      campaignStatus?: unknown;
    };
    if (String(state.accountId ?? "") !== String(marketplaceAccountId)) return null;
    const raw = state.campaignStatus;
    return typeof raw === "string" ? raw : "inactive";
  } catch {
    return null;
  }
}

/**
 * Resolve whether the Account 2 Finance quota is reserved for historical recovery.
 * Resolution order: reserved-account filter → deployed env → (local only)
 * progress file → fail closed. Deployed Vercel processes never trust a
 * progress file: they fail closed unless the env var is an explicit boolean.
 */
export function resolveFinanceRecoveryReservation(
  marketplaceAccountId: string,
  progressPath: string
): FinanceReservationDecision {
  const accountId = String(marketplaceAccountId);
  if (!FINANCE_RESERVED_ACCOUNT_IDS.includes(accountId as "2")) {
    return {
      reserved: false,
      source: "not_reserved_account",
      productionAuthoritative: true,
      detail: `Account ${accountId} is not under Finance recovery reservation`,
    };
  }

  const envReservation = readEnvReservation();
  if (envReservation === "true") {
    return {
      reserved: true,
      source: "environment",
      productionAuthoritative: true,
      detail: `${FINANCE_RESERVATION_ENV_VAR}=true reserves Account ${accountId} Finance for recovery`,
    };
  }
  if (envReservation === "false") {
    return {
      reserved: false,
      source: "environment",
      productionAuthoritative: true,
      detail: `${FINANCE_RESERVATION_ENV_VAR}=false releases Account ${accountId} Finance`,
    };
  }

  if (isDeployedFinanceRuntime()) {
    return {
      reserved: true,
      source: "fail_closed",
      productionAuthoritative: false,
      detail: `Deployed runtime has no usable ${FINANCE_RESERVATION_ENV_VAR}; blocking Account ${accountId} Finance to protect the seller quota`,
    };
  }

  const campaignStatus = readCampaignStatusFromFile(accountId, progressPath);
  if (campaignStatus != null) {
    const reserved = campaignStatus === "active";
    return {
      reserved,
      source: "progress_file",
      productionAuthoritative: false,
      detail: `Local campaignStatus=${campaignStatus} (not visible to deployed instances)`,
    };
  }

  return {
    reserved: true,
    source: "fail_closed",
    productionAuthoritative: false,
    detail: `Reservation for Account ${accountId} is undeterminable; blocking Finance to protect the seller quota`,
  };
}

/**
 * Recovery may consume the Finance quota only when the deployed environment
 * confirms the reservation. A local-only campaign cannot stop production callers.
 */
export function assertFinanceRecoveryOwnsQuota(
  marketplaceAccountId: string,
  progressPath: string
): { ok: true; decision: FinanceReservationDecision } | { ok: false; reason: string } {
  const decision = resolveFinanceRecoveryReservation(marketplaceAccountId, progressPath);
  if (decision.reserved && decision.productionAuthoritative) {
    return { ok: true, decision };
  }
  if (decision.source === "environment" && !decision.reserved) {
    return {
      ok: false,
      reason: `${FINANCE_RESERVATION_ENV_VAR}=false — production still allows competing Account ${marketplaceAccountId} Finance callers`,
    };
  }
  return {
    ok: false,
    reason: `Recovery cannot prove it owns the Account ${marketplaceAccountId} Finance quota (${decision.detail}). Set ${FINANCE_RESERVATION_ENV_VAR}=true in every deployed environment and locally.`,
  };
}
