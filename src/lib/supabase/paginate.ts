import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";

const PAGE_SIZE = 1000;

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

  const rows: T[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(filter.selectColumns ?? "*")
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

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: `sql.${table}.date_range`,
    durationMs: Date.now() - started,
    meta: {
      table,
      rows: rows.length,
      pages,
      queryName: `${table}.${filter.column}`,
      from: filter.from,
      to: filter.to,
    },
  });

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

  const rows: T[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(options?.selectColumns ?? "*")
      .range(offset, offset + PAGE_SIZE - 1);
    if (options?.marketplaceAccountId) {
      query = query.eq("marketplace_account_id", options.marketplaceAccountId);
    }
    for (const inFilter of options?.inFilters ?? []) {
      query = query.in(inFilter.column, inFilter.values);
    }
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: `sql.${table}.all_rows`,
    durationMs: Date.now() - started,
    meta: { table, rows: rows.length, pages, queryName: `${table}.all` },
  });

  return rows;
}
