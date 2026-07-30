"use client";

import { useCallback, useMemo, useState } from "react";
import {
  cycleSortState,
  resolveSortSpec,
  sortRowsBySpec,
  type CycleSortState,
  type SortDirection,
  type SortSpec,
  type SortValue,
} from "@/lib/ui/table-sort";

export function useCycleSort<K extends string>(defaultSort: SortSpec<K> | null = null) {
  const [state, setState] = useState<CycleSortState<K>>({ kind: "default" });

  const sort = useMemo(
    () => resolveSortSpec(state, defaultSort),
    [state, defaultSort]
  );

  const onSort = useCallback(
    (key: K) => {
      setState((prev) => cycleSortState(prev, key, defaultSort));
    },
    [defaultSort]
  );

  const directionFor = useCallback(
    (key: K): SortDirection | null => (sort?.key === key ? sort.direction : null),
    [sort]
  );

  const isActive = useCallback((key: K) => sort?.key === key, [sort]);

  return { sort, state, onSort, directionFor, isActive };
}

export function useSortedRows<T, K extends string>(
  rows: readonly T[],
  sort: SortSpec<K> | null,
  getValue: (row: T, key: K) => SortValue
): T[] {
  return useMemo(() => sortRowsBySpec(rows, sort, getValue), [rows, sort, getValue]);
}
