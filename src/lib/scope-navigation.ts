/**
 * Sprint 6.35.4 — Scope navigation that keeps URL and Dashboard RSC in sync.
 *
 * Soft `push`/`replace` alone can update useSearchParams (and success UI) while
 * leaving the previous Server Component payload on screen. Always pair URL
 * updates with `router.refresh()` for Dashboard scope changes.
 *
 * Client-safe: do not import server-only modules here.
 */

type RouterLike = {
  push: (href: string, options?: { scroll?: boolean }) => void;
  replace: (href: string, options?: { scroll?: boolean }) => void;
  refresh: () => void;
};

export type ScopeNavigateMode = "push" | "replace";

/**
 * Update the URL, then force a Server Component refetch.
 */
export function navigateScope(
  router: RouterLike,
  href: string,
  mode: ScopeNavigateMode = "push"
): void {
  if (mode === "replace") {
    router.replace(href, { scroll: false });
  } else {
    router.push(href, { scroll: false });
  }
  // Required: same-pathname searchParam soft-nav can leave stale RSC payload.
  router.refresh();
}
