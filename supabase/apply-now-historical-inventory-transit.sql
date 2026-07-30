-- =============================================================================
-- PASTE INTO Supabase SQL Editor → Run
-- Adds To Customer / From Customer fields for Inventory History (Sprint 11.2)
-- Safe to re-run.
-- =============================================================================

ALTER TABLE public.historical_inventory_snapshots
  ADD COLUMN IF NOT EXISTS in_way_to_client INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.historical_inventory_snapshots
  ADD COLUMN IF NOT EXISTS in_way_from_client INTEGER NOT NULL DEFAULT 0;
