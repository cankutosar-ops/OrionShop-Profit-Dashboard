/**
 * Universal analytical table sorting — DESC → ASC → default.
 * Product-wide UI standard for client-side sort of loaded datasets.
 */

export type SortDirection = "asc" | "desc";

export type SortSpec<K extends string = string> = {
  key: K;
  direction: SortDirection;
};

/** `default` = screen’s original order; `active` = user override. */
export type CycleSortState<K extends string = string> =
  | { kind: "default" }
  | { kind: "active"; key: K; direction: SortDirection };

export type SortValue = string | number | null | undefined;

export function resolveSortSpec<K extends string>(
  state: CycleSortState<K>,
  defaultSort: SortSpec<K> | null
): SortSpec<K> | null {
  if (state.kind === "active") {
    return { key: state.key, direction: state.direction };
  }
  return defaultSort;
}

/**
 * Cycle: first click DESC → ASC → clear to default → …
 * Evaluated against the *effective* sort (including screen default).
 */
export function cycleSortState<K extends string>(
  state: CycleSortState<K>,
  clickedKey: K,
  defaultSort: SortSpec<K> | null
): CycleSortState<K> {
  const effective = resolveSortSpec(state, defaultSort);
  if (effective?.key === clickedKey && effective.direction === "desc") {
    return { kind: "active", key: clickedKey, direction: "asc" };
  }
  if (effective?.key === clickedKey && effective.direction === "asc") {
    return { kind: "default" };
  }
  return { kind: "active", key: clickedKey, direction: "desc" };
}

export function compareSortValues(
  a: SortValue,
  b: SortValue,
  direction: SortDirection
): number {
  const aNull = a == null || a === "";
  const bNull = b == null || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  let cmp: number;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else {
    cmp = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }
  return direction === "asc" ? cmp : -cmp;
}

export function sortRowsBySpec<T, K extends string>(
  rows: readonly T[],
  sort: SortSpec<K> | null,
  getValue: (row: T, key: K) => SortValue
): T[] {
  if (!sort) return [...rows];
  const copy = [...rows];
  copy.sort((a, b) =>
    compareSortValues(getValue(a, sort.key), getValue(b, sort.key), sort.direction)
  );
  return copy;
}

export function sortIndicator(direction: SortDirection | null | undefined): string {
  if (direction === "asc") return "↑";
  if (direction === "desc") return "↓";
  return "";
}
