import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1000;

type RangeFilter = {
  column: string;
  from: string;
  to: string;
};

/**
 * Fetches all rows matching date-range filters, paginating past Supabase's 1000-row default limit.
 */
export async function fetchAllInDateRange<T>(
  supabase: SupabaseClient,
  table: string,
  filter: RangeFilter
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .gte(filter.column, filter.from)
      .lte(filter.column, filter.to)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

/** Fetches all rows from a table, paginating past Supabase's 1000-row default limit. */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    let query = supabase.from(table).select("*").range(offset, offset + PAGE_SIZE - 1);
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}
