/**
 * Top-bar popup coordination — when one header dropdown opens, siblings dismiss.
 * Presentation only; no business meaning.
 */

export const DASHBOARD_HEADER_POPUP_OPEN_EVENT = "orionshop:dashboard-header-popup-open";

export function notifyDashboardHeaderPopupOpen(source: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(DASHBOARD_HEADER_POPUP_OPEN_EVENT, { detail: { source } })
  );
}
