-- =============================================================================
-- Rollback reference (manual — run only if migration needs reverting)
-- =============================================================================
-- WARNING: Rollback will lose unpivoted wb_finance tall rows and renamed columns.
-- Restore from Supabase backup instead when possible.
-- =============================================================================

-- This file is documentation-only. Do not run unless you understand the impact.

-- To rollback permissions only:
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM service_role;

-- Full schema rollback requires restoring from backup because:
--   - wb_finance wide → tall conversion is lossy in reverse
--   - products.cost_price moved to product_cost_history
--   - column renames (brand_name, category_name, model_code) are one-way
