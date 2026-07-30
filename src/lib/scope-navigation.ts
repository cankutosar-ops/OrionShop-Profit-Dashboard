/**
 * Sprint 6.35.4 / 6.37.1+ — Scope navigation that keeps URL and Dashboard RSC in sync.
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

/** Max time to wait for soft-nav to commit before hard navigation fallback. */
const URL_COMMIT_WAIT_MS = 2_500;
const URL_POLL_MS = 32;

function locationMatchesHref(href: string): boolean {
  try {
    const target = new URL(href, window.location.href);
    const current = new URL(window.location.href);
    if (current.pathname !== target.pathname) return false;
    // Compare as URLSearchParams so key order does not matter.
    return current.searchParams.toString() === target.searchParams.toString();
  } catch {
    return false;
  }
}

/**
 * Update the URL, then force a Server Component refetch.
 *
 * Refresh must wait until the browser URL actually reflects `href`. A same-tick
 * or setTimeout(0) refresh() can race/cancel the pending soft-nav on Next 15,
 * leaving useSearchParams unmatched (account-switch timeout) with stale KPIs.
 * If soft-nav never commits, fall back to hard assign so scope cannot stick.
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

  if (typeof window === "undefined") {
    router.refresh();
    return;
  }

  const absolute = new URL(href, window.location.href).href;
  const started = Date.now();
  let done = false;

  const finishWithRefresh = () => {
    if (done) return;
    done = true;
    router.refresh();
  };

  const tick = () => {
    if (done) return;

    if (locationMatchesHref(href)) {
      finishWithRefresh();
      return;
    }

    if (Date.now() - started >= URL_COMMIT_WAIT_MS) {
      // Soft-nav stalled (likely cancelled by an earlier refresh race). Hard
      // navigation guarantees URL + full RSC for the selected account.
      done = true;
      window.location.assign(absolute);
      return;
    }

    window.setTimeout(tick, URL_POLL_MS);
  };

  window.setTimeout(tick, 0);
}
