-- Finance Reports/V1 incremental lease. Additive; no cursor or finance data rewrite.
-- All functions are service_role only and use the existing per-account state row.
-- Apply before deploying the new incremental worker, with old workers quiesced.
BEGIN;

ALTER TABLE public.finance_incremental_sync_state
  ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.orion_finance_incremental_acquire_lease(
  p_account_id BIGINT, p_owner TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_row public.finance_incremental_sync_state%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_owner IS NULL OR p_owner = '' THEN
    RAISE EXCEPTION 'Invalid finance incremental lease identity';
  END IF;
  INSERT INTO public.finance_incremental_sync_state AS s
    (marketplace_account_id, lock_owner, lock_started_at, lock_heartbeat_at,
     lock_expires_at, updated_at)
  VALUES (p_account_id, p_owner, clock_timestamp(), clock_timestamp(),
          clock_timestamp() + INTERVAL '2 hours', clock_timestamp())
  ON CONFLICT (marketplace_account_id) DO UPDATE SET
    lock_owner = EXCLUDED.lock_owner,
    lock_started_at = clock_timestamp(),
    lock_heartbeat_at = clock_timestamp(),
    lock_expires_at = clock_timestamp() + INTERVAL '2 hours',
    updated_at = clock_timestamp()
  WHERE s.lock_owner IS NULL
     OR COALESCE(s.lock_expires_at, s.lock_heartbeat_at + INTERVAL '2 hours',
                 s.lock_started_at + INTERVAL '2 hours', '-infinity'::TIMESTAMPTZ)
        <= clock_timestamp()
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN NULL; END IF; -- LEASE_BUSY; no state mutation
  RETURN to_jsonb(v_row);
END; $$;

CREATE OR REPLACE FUNCTION public.orion_finance_incremental_renew_lease(
  p_account_id BIGINT, p_owner TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.finance_incremental_sync_state AS s
  SET lock_heartbeat_at = clock_timestamp(),
      lock_expires_at = clock_timestamp() + INTERVAL '2 hours'
  WHERE s.marketplace_account_id = p_account_id AND s.lock_owner = p_owner
    AND s.lock_expires_at > clock_timestamp();
  RETURN FOUND;
END; $$;

-- Fenced state mutation. The same row lock serializes lease replacement and
-- cursor/week updates; a former owner cannot overwrite a newer owner's state.
CREATE OR REPLACE FUNCTION public.orion_finance_incremental_commit_lease(
  p_account_id BIGINT, p_owner TEXT, p_state JSONB, p_release BOOLEAN
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v public.finance_incremental_sync_state%ROWTYPE;
BEGIN
  IF p_state IS NULL OR p_release IS NULL OR
     (p_state->>'marketplace_account_id')::BIGINT IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'Invalid finance incremental state identity';
  END IF;
  SELECT * INTO v FROM jsonb_populate_record(NULL::public.finance_incremental_sync_state, p_state);
  UPDATE public.finance_incremental_sync_state AS s SET
    mode = v.mode, week_status = v.week_status,
    active_week_from = v.active_week_from, active_week_to = v.active_week_to,
    last_persisted_rrd_id = v.last_persisted_rrd_id,
    overlap_revalidate_queue = v.overlap_revalidate_queue,
    completed_weeks = v.completed_weeks,
    reports_last_request_at = v.reports_last_request_at,
    reports_next_request_not_before = v.reports_next_request_not_before,
    reports_server_retry_until = v.reports_server_retry_until,
    reports_last_rate_limit_snapshot = v.reports_last_rate_limit_snapshot,
    latest_successful_data_date = v.latest_successful_data_date,
    last_http_status = v.last_http_status, last_wake_at = v.last_wake_at,
    last_error = v.last_error, last_cursor_before = v.last_cursor_before,
    last_cursor_after = v.last_cursor_after,
    last_rows_received = v.last_rows_received,
    last_rows_persisted = v.last_rows_persisted,
    last_has_more = v.last_has_more, updated_at = clock_timestamp(),
    lock_owner = CASE WHEN p_release THEN NULL ELSE s.lock_owner END,
    lock_started_at = CASE WHEN p_release THEN NULL ELSE s.lock_started_at END,
    lock_heartbeat_at = CASE WHEN p_release THEN NULL ELSE s.lock_heartbeat_at END,
    lock_expires_at = CASE WHEN p_release THEN NULL ELSE s.lock_expires_at END
  WHERE s.marketplace_account_id = p_account_id AND s.lock_owner = p_owner
    AND s.lock_expires_at > clock_timestamp();
  RETURN FOUND;
END; $$;

-- Each batch is authorized and persisted under one row lock/transaction. A
-- partial page remains retryable because the cursor is committed separately.
CREATE OR REPLACE FUNCTION public.orion_finance_incremental_upsert_batch(
  p_account_id BIGINT, p_owner TEXT, p_lines JSONB
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_owner TEXT; v_expires TIMESTAMPTZ; v_count INTEGER;
BEGIN
  SELECT s.lock_owner, s.lock_expires_at INTO v_owner, v_expires
  FROM public.finance_incremental_sync_state AS s
  WHERE s.marketplace_account_id = p_account_id FOR UPDATE;
  IF v_owner IS DISTINCT FROM p_owner OR v_expires IS NULL OR
     v_expires <= clock_timestamp() THEN
    RAISE EXCEPTION 'FINANCE_LEASE_LOST';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR
     EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) AS x
             WHERE (x->>'marketplace_account_id')::BIGINT IS DISTINCT FROM p_account_id
                OR NULLIF(x->>'source_key', '') IS NULL) THEN
    RAISE EXCEPTION 'Invalid account/source key in finance batch';
  END IF;
  INSERT INTO public.wb_finance AS existing
    (marketplace_account_id, product_id, nm_id, operation_date, operation_type,
     amount, source_key, description, srid, finance_category, wb_source_suffix,
     supplier_oper_name, finance_nature, realizationreport_id, rrd_id, rr_dt)
  SELECT p_account_id, x.product_id, x.nm_id, x.operation_date, x.operation_type,
         x.amount, x.source_key, x.description, x.srid, x.finance_category,
         x.wb_source_suffix, x.supplier_oper_name, x.finance_nature,
         x.realizationreport_id, x.rrd_id, x.rr_dt
  FROM jsonb_populate_recordset(NULL::public.wb_finance, p_lines) AS x
  WHERE TRUE
  ON CONFLICT (marketplace_account_id, source_key) DO UPDATE SET
    product_id = EXCLUDED.product_id, nm_id = EXCLUDED.nm_id,
    operation_date = EXCLUDED.operation_date,
    operation_type = EXCLUDED.operation_type, amount = EXCLUDED.amount,
    description = EXCLUDED.description, srid = EXCLUDED.srid,
    finance_category = EXCLUDED.finance_category,
    wb_source_suffix = EXCLUDED.wb_source_suffix,
    supplier_oper_name = EXCLUDED.supplier_oper_name,
    finance_nature = EXCLUDED.finance_nature,
    realizationreport_id = EXCLUDED.realizationreport_id,
    rrd_id = EXCLUDED.rrd_id, rr_dt = EXCLUDED.rr_dt;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.orion_finance_incremental_acquire_lease(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orion_finance_incremental_renew_lease(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orion_finance_incremental_commit_lease(BIGINT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orion_finance_incremental_upsert_batch(BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orion_finance_incremental_acquire_lease(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_finance_incremental_renew_lease(BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_finance_incremental_commit_lease(BIGINT, TEXT, JSONB, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.orion_finance_incremental_upsert_batch(BIGINT, TEXT, JSONB) TO service_role;
COMMIT;
