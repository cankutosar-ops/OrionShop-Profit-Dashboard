-- Sprint 11.2 — transit qty on historical inventory snapshots
-- Apply via Supabase SQL Editor (paste this file) or migration runner.

ALTER TABLE public.historical_inventory_snapshots
  ADD COLUMN IF NOT EXISTS in_way_to_client INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.historical_inventory_snapshots
  ADD COLUMN IF NOT EXISTS in_way_from_client INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.historical_inventory_snapshots.in_way_to_client IS
  'Units in way to client (WB Analytics inWayToClient).';
COMMENT ON COLUMN public.historical_inventory_snapshots.in_way_from_client IS
  'Units in way from client (WB Analytics inWayFromClient).';
