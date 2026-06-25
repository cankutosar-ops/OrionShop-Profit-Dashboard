# Database Migration Guide

Align your Supabase database with the schema expected by the Wildberries sync service **without changing any integration code**.

---

## What these migrations do

| Migration file | Purpose |
|---|---|
| `20260623170000_align_schema_to_sync_service.sql` | Renames columns, migrates data, unpivots `wb_finance` |
| `20260623170001_grant_service_role_permissions.sql` | Grants `service_role` full table access |
| `20260623170002_rollback_notes.sql` | Documentation only — use backup to rollback |

### Data preserved

| Old | New | How |
|---|---|---|
| `brands.brand_name` | `brands.name` | Column rename |
| `categories.category_name` | `categories.name` | Column rename |
| `products.model_code` | `products.supplier_article` | Copy + drop old |
| `products.product_name` | `products.name` | Copy + drop old |
| `products.cost_price` | `product_cost_history.cost` | Insert then drop |
| `wb_orders.supplier_article` | `wb_orders.product_id` | FK lookup |
| `wb_sales.sale_price` | `wb_sales.revenue` | Copy + drop old |
| `wb_finance` wide columns | `wb_finance` tall rows | Unpivot (6 rows per old row) |

---

## Step 1 — Back up your database

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Database → Backups**
4. Confirm a recent backup exists, or create a manual backup

> If anything goes wrong, restore from backup rather than running rollback SQL.

---

## Step 2 — Preflight: detect type mismatches (before migration)

Your live schema uses **BIGINT** primary keys, not UUID. Run locally:

```bash
node scripts/preflight-schema.mjs
node scripts/introspect-schema.mjs
```

This reports missing columns and UUID/BIGINT FK conflicts before you run SQL.

---

## Step 3 — Review migration scripts locally

```bash
cat supabase/migrations/20260623170000_align_schema_to_sync_service.sql
cat supabase/migrations/20260623170001_grant_service_role_permissions.sql
```

---

## Step 4 — Run migration 1 (schema alignment)

1. Supabase Dashboard → **SQL Editor**
2. Click **New query**
3. Paste the full contents of `supabase/migrations/20260623170000_align_schema_to_sync_service.sql`
4. Click **Run**
5. Confirm output shows `Success`

---

## Step 5 — Run migration 2 (permissions)

1. SQL Editor → **New query**
2. Paste the full contents of `supabase/migrations/20260623170001_grant_service_role_permissions.sql`
3. Click **Run**

---

## Step 6 — Verify schema (post-migration)

```bash
node scripts/preflight-schema.mjs   # should exit 0
```

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('brands', 'categories', 'products', 'wb_orders', 'wb_sales', 'wb_finance')
ORDER BY table_name, ordinal_position;
```

Expected: `brands.name`, `products.supplier_article`, `wb_sales.revenue`, `wb_finance.operation_type`, etc.

---

## Step 6 — Verify permissions

```sql
SELECT grantee, privilege_type, table_name
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee = 'service_role'
  AND table_name IN ('brands', 'products', 'wb_orders', 'wb_sales', 'wb_finance')
ORDER BY table_name, privilege_type;
```

---

## Step 7 — Restart dev server

```bash
npm run dev
```

---

## Step 8 — Run automated verification

```bash
node scripts/verify-sync.mjs
```

---

## Step 9 — Verify dashboard

Open [http://localhost:3000](http://localhost:3000) and confirm **Live data** banner with real metrics.

---

## Step 10 — Manual sync (optional)

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{"dateFrom":"2026-05-01","dateTo":"2026-06-23","entities":["products","orders","sales","finance"]}'
```

---

## Supabase CLI alternative

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```
