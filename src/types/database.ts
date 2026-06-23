export type Brand = {
  id: string;
  name: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  supplier_article: string;
  nm_id: number;
  name: string;
  brand_id: string;
  category_id: string;
  barcode: string | null;
  created_at: string;
};

export type WbOrder = {
  id: string;
  srid: string;
  nm_id: number;
  product_id: string;
  order_date: string;
  sale_date: string | null;
  price: number;
  quantity: number;
  status: string;
  warehouse: string | null;
};

export type WbSale = {
  id: string;
  srid: string;
  nm_id: number;
  product_id: string;
  sale_date: string;
  revenue: number;
  quantity: number;
  is_return: boolean;
  return_date: string | null;
};

export type FinanceOperationType =
  | "commission"
  | "logistics"
  | "return_logistics"
  | "storage"
  | "penalty"
  | "other";

export type WbFinance = {
  id: string;
  product_id: string | null;
  nm_id: number | null;
  operation_date: string;
  operation_type: FinanceOperationType;
  amount: number;
  description: string | null;
};

export type WbAd = {
  id: string;
  product_id: string | null;
  supplier_article: string | null;
  nm_id: number | null;
  campaign_date: string;
  spend: number;
  clicks: number;
  impressions: number;
};

export type ProductCostHistory = {
  id: string;
  product_id: string;
  cost: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type ProductWithRelations = Product & {
  brand: Brand | null;
  category: Category | null;
};

export type DateRange = {
  from: string;
  to: string;
};

export type ProfitBreakdown = {
  revenue: number;
  productCost: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
  otherExpenses: number;
  netProfit: number;
  returnRate: number;
  unitsSold: number;
  unitsReturned: number;
};

export type ProductProfitability = ProfitBreakdown & {
  productId: string;
  modelCode: string;
  productName: string;
  categoryName: string;
  brandName: string;
};

export type CategoryProfitability = {
  categoryId: string;
  categoryName: string;
  revenue: number;
  netProfit: number;
  productCount: number;
  returnRate: number;
};

export type OverviewMetrics = ProfitBreakdown & {
  dailyRevenue: { date: string; revenue: number; profit: number }[];
  costBreakdown: { name: string; value: number; color: string }[];
};

export type Database = {
  public: {
    Tables: {
      brands: {
        Row: Brand;
        Insert: Omit<Brand, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Brand>;
      };
      categories: {
        Row: Category;
        Insert: Omit<Category, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Category>;
      };
      products: {
        Row: Product;
        Insert: Omit<Product, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Product>;
      };
      wb_orders: {
        Row: WbOrder;
        Insert: Omit<WbOrder, "id"> & { id?: string };
        Update: Partial<WbOrder>;
      };
      wb_sales: {
        Row: WbSale;
        Insert: Omit<WbSale, "id"> & { id?: string };
        Update: Partial<WbSale>;
      };
      wb_finance: {
        Row: WbFinance;
        Insert: Omit<WbFinance, "id"> & { id?: string };
        Update: Partial<WbFinance>;
      };
      wb_ads: {
        Row: WbAd;
        Insert: Omit<WbAd, "id"> & { id?: string };
        Update: Partial<WbAd>;
      };
      product_cost_history: {
        Row: ProductCostHistory;
        Insert: Omit<ProductCostHistory, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<ProductCostHistory>;
      };
    };
  };
};
