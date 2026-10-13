/** Client-safe scope navigation. App Router loads the selected server payload. */
type RouterLike = {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
};

export type ScopeNavigateMode = "push" | "replace";

/**
 * One navigation per selection. An additional refresh starts a second server
 * render; a 2.5s hard-navigation timer interrupts legitimate slow data loads.
 * Let App Router finish the selected request and its error boundary handle failure.
 */
export function navigateScope(
  router: RouterLike,
  href: string,
  mode: ScopeNavigateMode = "push"
): void {
  router[mode](href, { scroll: false });
}

/** A long report is an explicit document navigation, independent of cached Flight transitions. */
export function navigateDashboardDateRange(
  router: RouterLike,
  pathname: string,
  href: string,
  from: string,
  to: string
): void {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (pathname === "/" && Number.isFinite(days) && days >= 90 && typeof window !== "undefined") {
    window.location.assign(href);
    return;
  }
  navigateScope(router, href, "push");
}
