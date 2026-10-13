-- Read model only: no Finance writes, materialization, or formula changes.
-- Scalar JSON envelope avoids the Data API's SETOF row limit.
create or replace function public.orion_finance_period_rows(
  p_account_id bigint, p_from date, p_to date, p_product_ids bigint[] default null
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
set statement_timeout = '15s'
as $$
declare result jsonb;
begin
  if p_account_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid Finance period' using errcode = '22023';
  end if;
  with source as materialized (
    select f.id, f.marketplace_account_id, f.product_id, f.nm_id, f.operation_date,
      f.operation_type, f.amount, f.raw_amount, f.srid, f.finance_category, f.wb_source_suffix,
      f.supplier_oper_name, f.source_key, f.description,
      (f.product_id is null
       or f.finance_category in ('LOGISTICS', 'RETURN_LOGISTICS')
       or f.finance_category is null
       or coalesce(btrim(f.wb_source_suffix), '') in ('', 'for_pay')
       or coalesce(btrim(f.supplier_oper_name), '') = '') as keep_detail
    from public.wb_finance f
    where f.marketplace_account_id = p_account_id
      and f.operation_date between p_from and p_to
      and (p_product_ids is null or f.product_id = any(p_product_ids) or f.product_id is null)
  ), grouped as (
    select product_id, nm_id, operation_type, finance_category, wb_source_suffix,
      supplier_oper_name, sign(amount) as amount_sign, raw_amount is null as raw_missing,
      sum(amount) as amount, sum(raw_amount) as raw_amount, min(operation_date) as operation_date
    from source where not keep_detail
    -- Signs stay separate because existing cost readers sum magnitudes.
    -- NULL raw evidence stays separate to preserve unavailable remuneration.
    group by 1, 2, 3, 4, 5, 6, 7, 8
  ), emitted as (
    select jsonb_build_object(
      'id', id::text, 'marketplace_account_id', marketplace_account_id::text,
      'product_id', product_id::text, 'nm_id', nm_id, 'operation_date', operation_date,
      'operation_type', operation_type, 'amount', amount, 'raw_amount', raw_amount,
      'srid', srid, 'finance_category', finance_category, 'wb_source_suffix', wb_source_suffix,
      'supplier_oper_name', supplier_oper_name,
      'source_key', source_key, 'description', description
    ) as row from source where keep_detail
    union all
    select jsonb_build_object(
      'id', 'period:' || md5(jsonb_build_array(product_id, nm_id, operation_type,
        finance_category, wb_source_suffix, supplier_oper_name, amount_sign, raw_missing)::text),
      'marketplace_account_id', p_account_id::text, 'product_id', product_id::text,
      'nm_id', nm_id, 'operation_date', operation_date, 'operation_type', operation_type,
      'amount', amount, 'raw_amount', raw_amount, 'srid', null, 'source_key', null,
      'description', null, 'finance_category', finance_category,
      'wb_source_suffix', wb_source_suffix, 'supplier_oper_name', supplier_oper_name
    ) from grouped
  )
  select jsonb_build_object(
    'version', 1, 'accountId', p_account_id::text, 'from', p_from, 'to', p_to,
    'sourceRows', (select count(*) from source),
    'emittedRows', count(*), 'rows', coalesce(jsonb_agg(row), '[]'::jsonb)
  ) into result from emitted;
  return result;
end;
$$;
revoke all on function public.orion_finance_period_rows(bigint,date,date,bigint[]) from public, anon;
grant execute on function public.orion_finance_period_rows(bigint,date,date,bigint[]) to authenticated, service_role;
comment on function public.orion_finance_period_rows(bigint,date,date,bigint[]) is
  'RLS-preserving period calculation read model. Not a transaction/audit or Tax evidence source.';
