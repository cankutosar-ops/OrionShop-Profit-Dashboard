-- Forward-only, additive RPCs. No existing rows, policies or prior migrations change.
BEGIN;
CREATE FUNCTION public.replace_inventory_snapshot_day(p_account_id bigint, p_snapshot_date date, p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = '' SET lock_timeout = '5s'
AS $$
DECLARE inserted integer;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 OR p_snapshot_date IS NULL
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid inventory replacement scope/payload';
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Empty inventory is not authoritative; retain existing day';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE
    jsonb_typeof(e) IS DISTINCT FROM 'object'
    OR (e->>'marketplace_account_id')::bigint IS DISTINCT FROM p_account_id
    OR (e->>'snapshot_date')::date IS DISTINCT FROM p_snapshot_date
    OR coalesce(btrim(e->>'warehouse_name'),'') = ''
    OR coalesce((e->>'nm_id')::bigint,0) <= 0
    OR coalesce((e->>'quantity')::integer,-1) < 0
    OR coalesce((e->>'in_way_to_client')::integer,-1) < 0
    OR coalesce((e->>'in_way_from_client')::integer,-1) < 0
    OR e->>'size' IS NULL OR e->>'barcode' IS NULL OR e->>'seller_article' IS NULL) THEN
    RAISE EXCEPTION 'Malformed or cross-scope inventory row';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-day:' || p_account_id || ':' || p_snapshot_date, 0));
  DELETE FROM public.historical_inventory_snapshots
    WHERE marketplace_account_id = p_account_id AND snapshot_date = p_snapshot_date;
  INSERT INTO public.historical_inventory_snapshots
    (marketplace_account_id,snapshot_date,warehouse_name,nm_id,size,barcode,seller_article,
     brand,subject,quantity,in_way_to_client,in_way_from_client)
  SELECT p_account_id,p_snapshot_date,r.warehouse_name,r.nm_id,r.size,r.barcode,r.seller_article,
    r.brand,r.subject,r.quantity,r.in_way_to_client,r.in_way_from_client
  FROM jsonb_to_recordset(p_rows) AS r(warehouse_name text,nm_id bigint,size text,barcode text,
    seller_article text,brand text,subject text,quantity integer,in_way_to_client integer,in_way_from_client integer);
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted <> jsonb_array_length(p_rows) OR inserted <> (
    SELECT count(*) FROM public.historical_inventory_snapshots
    WHERE marketplace_account_id = p_account_id AND snapshot_date = p_snapshot_date
  ) THEN RAISE EXCEPTION 'Inventory persisted count mismatch'; END IF;
  RETURN inserted;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_inventory_snapshot_day(bigint,date,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_inventory_snapshot_day(bigint,date,jsonb) TO service_role;

-- Keep the previously rehearsed RPC unchanged; guard complete datasets and verify
-- identities while holding the same account lock inside the same transaction.
CREATE FUNCTION public.replace_wb_current_stocks_verified(p_account_id bigint,p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = '' SET lock_timeout = '5s'
AS $$
DECLARE expected integer; actual integer;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid canonical replacement scope/payload';
  END IF;
  expected := jsonb_array_length(p_rows);
  IF expected = 0 THEN RAISE EXCEPTION 'Empty stock is not authoritative; retain existing stock'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE
    jsonb_typeof(e) IS DISTINCT FROM 'object'
    OR (e->>'marketplace_account_id')::bigint IS DISTINCT FROM p_account_id) THEN
    RAISE EXCEPTION 'Malformed or cross-account canonical row';
  END IF;
  PERFORM pg_advisory_xact_lock(p_account_id);
  PERFORM public.replace_wb_current_stocks(p_account_id,p_rows);
  SELECT count(*) INTO actual FROM public.wb_current_stocks WHERE marketplace_account_id=p_account_id;
  IF actual <> expected OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) r(nm_id bigint,chrt_id bigint,warehouse_key text,quantity integer)
    WHERE NOT EXISTS (SELECT 1 FROM public.wb_current_stocks s WHERE s.marketplace_account_id=p_account_id
      AND s.nm_id=r.nm_id AND s.chrt_id=r.chrt_id AND s.warehouse_key=r.warehouse_key AND s.quantity=r.quantity)
  ) THEN RAISE EXCEPTION 'Canonical persisted identity/count mismatch'; END IF;
  RETURN actual;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_wb_current_stocks_verified(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_wb_current_stocks_verified(bigint,jsonb) TO service_role;
COMMIT;
