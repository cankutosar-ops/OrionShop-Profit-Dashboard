# Wildberries MVP Setup

Step-by-step instructions to sync real Wildberries data into the dashboard.

---

## Prerequisites

- Node.js 18+ and npm
- A Supabase project with the existing tables (`brands`, `categories`, `products`, `wb_orders`, `wb_sales`, `wb_finance`, `wb_ads`, `product_cost_history`)
- A Wildberries seller API token with access to **Statistics** and **Content** APIs

---

## Step 1 — Install dependencies

```bash
cd /Users/cankut/OrionShop-Profit-Dashboard
npm install
```

---

## Step 2 — Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
WB_API_TOKEN=your-wildberries-token
```

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `WB_API_TOKEN` | Wildberries seller portal → Profile → Settings → API access |

> **Important:** The sync writes to Supabase using the **service role key**. Do not expose it in the browser or commit it to git.

---

## Step 3 — Allow Supabase writes (if RLS is enabled)

If Row Level Security is on and sync fails with permission errors, run this in the Supabase SQL editor for MVP:

```sql
-- MVP: allow service role full access (service role bypasses RLS by default)
-- If using anon key only, add permissive policies:
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_finance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated service" ON brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated service" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated service" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated service" ON wb_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated service" ON wb_sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated service" ON wb_finance FOR ALL USING (true) WITH CHECK (true);
```

Recommended: keep RLS enabled and use `SUPABASE_SERVICE_ROLE_KEY` for sync (bypasses RLS automatically).

---

## Step 4 — Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 5 — Run the first sync

### Option A — Sync button (UI)

1. Open the dashboard
2. Click **Sync Wildberries** in the top-right header
3. Wait for the success message (syncs last 30 days by default)
4. The page refreshes automatically

### Option B — API call

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "dateFrom": "2026-05-01",
    "dateTo": "2026-06-23",
    "entities": ["products", "orders", "sales", "finance"]
  }'
```

Check sync status:

```bash
curl http://localhost:3000/api/sync
```

---

## Step 6 — Verify data in Supabase

In Supabase Table Editor, confirm rows exist in:

| Table | Source |
|---|---|
| `brands` | Product cards + order/sale metadata |
| `categories` | Product subject names |
| `products` | Content API cards (`supplier_article`, `nm_id`) |
| `wb_orders` | Statistics API orders |
| `wb_sales` | Statistics API sales & returns |
| `wb_finance` | Realization report (commission, logistics, storage, penalties) |

---

## Step 7 — Verify the dashboard

1. Reload [http://localhost:3000](http://localhost:3000)
2. You should see the green **Live data** banner (not sample data)
3. Metrics should reflect your synced period:
   - Revenue, Net Profit, Commission, Logistics, Storage, Return Rate
   - Product profitability by `supplier_article`
   - Category profitability

Adjust the date range picker to match your synced period if metrics show zero.

---

## Step 8 — Add product costs (optional but recommended)

Net profit requires COGS in `product_cost_history`. Insert manually in Supabase:

```sql
INSERT INTO product_cost_history (product_id, cost, effective_from)
SELECT id, 500, '2026-01-01'
FROM products
WHERE supplier_article = 'YOUR-ARTICLE';
```

Without COGS, product cost will be 0 and net profit will be overstated.

---

## What gets synced

| Entity | Wildberries API | Target tables |
|---|---|---|
| Products | Content API `POST /content/v2/get/cards/list` | `products`, `brands`, `categories` |
| Orders | Statistics API `GET /api/v1/supplier/orders` | `wb_orders` |
| Sales | Statistics API `GET /api/v1/supplier/sales` | `wb_sales` |
| Finance | Statistics API `GET /api/v5/supplier/reportDetailByPeriod` | `wb_finance` |

Sync order: **products → orders → sales → finance**

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `WB_API_TOKEN is not configured` | Add token to `.env.local` and restart `npm run dev` |
| Supabase permission denied on sync | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` |
| Dashboard shows sample data | Run sync first; check date range matches synced dates |
| Empty products | Verify WB token has Content API access |
| Finance sync slow | Normal — WB rate-limits to ~1 req/min; large periods take time |
| Duplicate key on products | `supplier_article` must be unique — check for conflicting rows |

---

## Re-syncing

- **Products / orders / sales:** Upserted by `srid` or `supplier_article` — safe to re-run
- **Finance:** Deleted and re-inserted for the selected date range on each sync

To sync a different period, use the API with custom `dateFrom` / `dateTo`.
