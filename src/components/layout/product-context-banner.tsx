"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildChangeProductHref,
  formatProductContextLabel,
  isProductContextPath,
  readProductContext,
  stripProductContextParams,
} from "@/lib/product-context";

/**
 * Compact product context banner for cross-module workflows (Sprint 6.46.6).
 * Reads context from URL only — no duplicated business logic.
 */
export function ProductContextBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (!isProductContextPath(pathname)) return null;

  const context = readProductContext(searchParams);
  if (!context) return null;

  const label = formatProductContextLabel(context);
  const changeHref = buildChangeProductHref(searchParams);

  function clearContext() {
    const params = new URLSearchParams(searchParams.toString());
    stripProductContextParams(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Current Product
        </p>
        <p className="mt-0.5 truncate font-medium text-foreground" title={label}>
          {label}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link
          href={changeHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-card-hover"
        >
          Change Product
        </Link>
        <button
          type="button"
          onClick={clearContext}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
        >
          Clear Context
        </button>
      </div>
    </div>
  );
}
