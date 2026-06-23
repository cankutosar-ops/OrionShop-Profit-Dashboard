# OrionShop — Wildberries Profit Dashboard

A modern profitability analytics dashboard for Wildberries sellers. Built with Next.js, TypeScript, Supabase, Tailwind CSS, and Recharts.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure Supabase
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Supabase is not configured or tables are empty, the dashboard shows **sample placeholder data** so you can preview the UI immediately.

## Supabase Setup

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings → API**
2. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
3. Copy **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

## Database Tables

The dashboard reads from these Supabase tables:

| Table | Purpose |
|---|---|
| `brands` | Product brands |
| `categories` | Product categories |
| `products` | Product catalog (`supplier_article` as model code) |
| `wb_orders` | Wildberries orders |
| `wb_sales` | Sales and returns |
| `wb_finance` | Commission, logistics, storage, penalties |
| `wb_ads` | Advertising spend |
| `product_cost_history` | COGS tracking over time |

See `supabase/schema-reference.sql` for the expected column schema.

## Dashboard Features

### Main Dashboard (`/`)
- Revenue, Net Profit, Advertising Cost, Commission, Logistics, Storage, Return Rate
- Revenue & profit trend chart
- Cost breakdown chart
- Product profitability table (by `supplier_article`)
- Category profitability table

### Products (`/products`)
- Charts: profit, revenue, return rate, ad spend by supplier article
- Full product profitability table

### Categories (`/categories`)
- Charts: profit and revenue by category
- Full category profitability table

## Profit Formula

```
Net Profit = Revenue
           - Product Cost
           - Commission
           - Logistics
           - Return Logistics
           - Storage
           - Advertising
           - Penalties
           - Other Expenses
```

## Project Structure

```
src/
├── app/                         # Pages
├── components/dashboard/        # Charts, tables, metrics
├── lib/
│   ├── supabase/                # Client config (server + browser)
│   ├── profit-calculator.ts     # Net profit engine
│   ├── sample-data.ts           # Placeholder data
│   └── wildberries/             # API scaffold (not connected)
├── services/
│   ├── dashboard-service.ts     # Aggregated queries + fallbacks
│   └── database-service.ts      # Per-table CRUD
└── types/database.ts            # TypeScript types
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript check |
