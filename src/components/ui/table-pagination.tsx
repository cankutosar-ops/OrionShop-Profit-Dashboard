"use client";

type Props = { page: number; pages: number; total: number; from: number; to: number; onPage: (page: number) => void };
export function TablePagination({ page, pages, total, from, to, onPage }: Props) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Table pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <span className="tabular-nums text-muted-foreground">{from}–{to} of {total}</span>
      <div className="flex items-center gap-3">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Previous</button>
        <span className="tabular-nums">{page} / {pages}</span>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </nav>
  );
}
