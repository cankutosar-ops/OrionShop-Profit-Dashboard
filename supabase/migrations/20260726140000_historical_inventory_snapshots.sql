-- Sprint 10 — Historical Inventory snapshots (read model for Inventory History).
-- Lightweight: one row per account + date + warehouse + nm + size (+ article).

CREATE TABLE IF NOT EXISTS public.historical_inventory_snapshots (
  id BIGSERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  marketplace_account_id BIGINT NOT NULL
    REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE,
  warehouse_name TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  seller_article TEXT NOT NULL DEFAULT '',
  nm_id BIGINT NOT NULL,
  barcode TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hist_inv_snap_grain UNIQUE (
    marketplace_account_id,
    snapshot_date,
    warehouse_name,
    nm_id,
    size,
    seller_article,
    barcode
  )
);

CREATE INDEX IF NOT EXISTS idx_hist_inv_snap_date
  ON public.historical_inventory_snapshots (snapshot_date);

CREATE INDEX IF NOT EXISTS idx_hist_inv_snap_account_date
  ON public.historical_inventory_snapshots (marketplace_account_id, snapshot_date);

COMMENT ON TABLE public.historical_inventory_snapshots IS
  'Sprint 10 — historical warehouse inventory snapshots (Warehouse+SKU+Size). Import from archived STOCK_HISTORY_DAILY_CSV; app reads DB only.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.historical_inventory_snapshots TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.historical_inventory_snapshots_id_seq TO anon, authenticated, service_role;
