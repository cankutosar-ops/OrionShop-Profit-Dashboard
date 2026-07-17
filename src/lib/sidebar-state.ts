/** Persisted sidebar collapse state — layout only, no business logic. */

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "orionshop.sidebar.collapsed";

export const SIDEBAR_WIDTH_EXPANDED_CLASS = "w-64";
export const SIDEBAR_WIDTH_COLLAPSED_CLASS = "w-16";
export const MAIN_OFFSET_EXPANDED_CLASS = "pl-64";
export const MAIN_OFFSET_COLLAPSED_CLASS = "pl-16";

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}
