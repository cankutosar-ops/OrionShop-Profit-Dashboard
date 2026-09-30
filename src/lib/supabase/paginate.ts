import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { getReadBudgetRequestId } from "./read-budget";

const PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 4;
const SLOW_QUERY_MS = 3_000;

type Page<T> = { data: T[] | null; count: number | null; error: { message: string } | null };

async function readPages<T>(table: string, query: (offset: number, size: number, count?: boolean) => PromiseLike<Page<T>>) {
  const first = await query(0, PAGE_SIZE, true);
  if (first.error) throw new Error(`Failed to fetch ${table}: ${first.error.message}`);
  const rows = [...(first.data ?? [])];
  const total = first.count !== null && Number.isFinite(first.count) ? first.count : null;
  // Respect a lower PostgREST row cap instead of skipping to offset 1,000.
  const size = rows.length;
  let pages = 1;
  if (total !== null) {
    if (size === 0 && total > 0) throw new Error(`Incomplete result for ${table}`);
    for (let offset = size; offset < total; offset += size * PAGE_CONCURRENCY) {
      const batchOffsets = Array.from({ length: Math.min(PAGE_CONCURRENCY, Math.ceil((total - offset) / size)) }, (_, index) => offset + index * size);
      const batch = await Promise.all(batchOffsets.map((start) => query(start, Math.min(size, total - start))));
      for (let index = 0; index < batch.length; index++) {
        const result = batch[index];
        if (result.error) throw new Error(`Failed to fetch ${table}: ${result.error.message}`);
        const page = result.data ?? [];
        if (page.length !== Math.min(size, total - batchOffsets[index])) {
          throw new Error(`Incomplete result for ${table}; data changed while loading`);
        }
        rows.push(...page);
        pages++;
      }
    }
    if (rows.length !== total) throw new Error(`Incomplete result for ${table}`);
  } else if (size > 0) {
    // Without a count, read through an empty/short page even with a lower cap.
    let offset = size;
    while (true) {
      const result = await query(offset, size);
      if (result.error) throw new Error(`Failed to fetch ${table}: ${result.error.message}`);
      const page = result.data ?? [];
      rows.push(...page);
      pages++;
      if (page.length < size) break;
      offset += size;
    }
  }
  return { rows, pages };
}

function logSlowQuery(table: string, durationMs: number, rows: number, pages: number): void {
  if (durationMs < SLOW_QUERY_MS) return;
  console.warn("[db-performance] slow paginated query", {
    requestId: getReadBudgetRequestId(),
    table,
    durationMs,
    rows,
    pages,
  });
}

type RangeFilter = {
  column: string;
  from: string;
  to: string;
  marketplaceAccountId?: string;
  selectColumns?: string;
  inFilters?: Array<{ column: string; values: Array<string | number> }>;
  /** Restrict to rows where the column value is SQL NULL. */
  isNullFilters?: string[];
  orderBy?: { column: string; ascending?: boolean };
};

/**
 * Fetches all rows matching date-range filters, paginating past Supabase's 1000-row default limit.
 */
export async function fetchAllInDateRange<T>(
  supabase: SupabaseClient,
  table: string,
  filter: RangeFilter
): Promise<T[]> {
  const started = Date.now();
  if (filter.inFilters?.some((f) => f.values.length === 0)) {
    recordPerfEvent({
      category: "sql",
      name: `sql.${table}.date_range`,
      durationMs: 0,
      meta: { table, rows: 0, queryName: `${table} empty-in-filter` },
    });
    return [];
  }

  const buildQuery = (offset: number, size: number, withCount = false) => {
    let query = supabase
      .from(table)
      .select(filter.selectColumns ?? "*", withCount ? { count: "exact" } : undefined)
      .gte(filter.column, filter.from)
      .lte(filter.column, filter.to);

    if (filter.marketplaceAccountId) {
      query = query.eq("marketplace_account_id", filter.marketplaceAccountId);
    }
    for (const inFilter of filter.inFilters ?? []) {
      query = query.in(inFilter.column, inFilter.values);
    }
    for (const nullColumn of filter.isNullFilters ?? []) {
      query = query.is(nullColumn, null);
    }

    const orderColumn = filter.orderBy?.column ?? filter.column;
    query = query.order(orderColumn, { ascending: filter.orderBy?.ascending ?? true });
    if (orderColumn !== "id") {
      query = query.order("id", { ascending: true });
    }

    return query.range(offset, offset + size - 1);
  };

  const { rows, pages } = await readPages<T>(table, buildQuery as (offset: number, size: number, count?: boolean) => PromiseLike<Page<T>>);

  const durationMs = Date.now() - started;
  recordPerfEvent({
    category: "sql",
    name: `sql.${table}.date_range`,
    durationMs,
    meta: {
      table,
      rows: rows.length,
      pages,
      queryName: `${table}.${filter.column}`,
      from: filter.from,
      to: filter.to,
    },
  });
  logSlowQuery(table, durationMs, rows.length, pages);

  return rows;
}

/** Fetches all rows from a table, paginating past Supabase's 1000-row default limit. */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  options?: {
    marketplaceAccountId?: string;
    orderBy?: { column: string; ascending?: boolean };
    inFilters?: Array<{ column: string; values: Array<string | number> }>;
    eqFilters?: Array<{ column: string; value: string | number }>;
    selectColumns?: string;
  }
): Promise<T[]> {
  const started = Date.now();
  if (options?.inFilters?.some((f) => f.values.length === 0)) {
    recordPerfEvent({
      category: "sql",
      name: `sql.${table}.all_rows`,
      durationMs: 0,
      meta: { table, rows: 0, queryName: `${table} empty-in-filter` },
    });
    return [];
  }

  const buildQuery = (offset: number, size: number, withCount = false) => {
    let query = supabase
      .from(table)
      .select(options?.selectColumns ?? "*", withCount ? { count: "exact" } : undefined)
      .range(offset, offset + size - 1);
    if (options?.marketplaceAccountId) {
      query = query.eq("marketplace_account_id", options.marketplaceAccountId);
    }
    for (const inFilter of options?.inFilters ?? []) {
      query = query.in(inFilter.column, inFilter.values);
    }
    for (const eqFilter of options?.eqFilters ?? []) {
      query = query.eq(eqFilter.column, eqFilter.value);
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }
    if (options?.orderBy?.column !== "id") {
      query = query.order("id", { ascending: true });
    }

    return query;
  };

  const { rows, pages } = await readPages<T>(table, buildQuery as (offset: number, size: number, count?: boolean) => PromiseLike<Page<T>>);

  const durationMs = Date.now() - started;
  recordPerfEvent({
    category: "sql",
    name: `sql.${table}.all_rows`,
    durationMs,
    meta: { table, rows: rows.length, pages, queryName: `${table}.all` },
  });
  logSlowQuery(table, durationMs, rows.length, pages);

  return rows;
}
