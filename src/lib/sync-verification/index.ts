/**
 * Sprint 9.1 — Sync Verification Layer (read-only).
 */
export type {
  OverallVerificationStatus,
  SourceVerification,
  SourceVerificationStatus,
  SyncVerificationReport,
  VerificationSourceId,
} from "./types";
export { VERIFICATION_LAG_WARN_DAYS } from "./thresholds";
export { formatVerificationSummary, buildOverallStatus, attachSummary } from "./format-summary";
