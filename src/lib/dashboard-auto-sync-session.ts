import { invalidateDashboardCompaniesCache } from "@/lib/dashboard-lifecycle";

const SESSION_KEY_PREFIX = "dashboard-auto-sync:";

/** In-memory guard against duplicate concurrent auto-sync attempts (e.g. Strict Mode remounts). */
const autoSyncAttempts = new Set<string>();

export function hasOperationalAutoSyncTriggered(accountId: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(`${SESSION_KEY_PREFIX}${accountId}`) === "1";
}

export function markOperationalAutoSyncTriggered(accountId: string): void {
  sessionStorage.setItem(`${SESSION_KEY_PREFIX}${accountId}`, "1");
}

/** Claim a one-time auto-sync attempt for this account; returns false if already claimed or done. */
export function claimAutoSyncAttempt(accountId: string): boolean {
  if (hasOperationalAutoSyncTriggered(accountId)) return false;
  if (autoSyncAttempts.has(accountId)) return false;
  autoSyncAttempts.add(accountId);
  return true;
}

export function releaseAutoSyncAttempt(accountId: string): void {
  autoSyncAttempts.delete(accountId);
}

export const DASHBOARD_SYNC_COMPLETE_EVENT = "dashboard-sync-complete";

export function notifyDashboardSyncComplete(): void {
  invalidateDashboardCompaniesCache();
  window.dispatchEvent(new CustomEvent(DASHBOARD_SYNC_COMPLETE_EVENT));
}
