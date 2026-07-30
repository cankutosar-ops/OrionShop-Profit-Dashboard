import { createServerClient } from "@/lib/supabase/server";
import type {
  Brand,
  Category,
  Product,
  ProductCostHistory,
  WbAd,
  WbFinance,
  WbOrder,
  WbSale,
} from "@/types/database";

async function getClient() {
  return createServerClient();
}

export const brandsService = {
  async getAll(): Promise<Brand[]> {
    const { data, error } = await (await getClient()).from("brands").select("*").order("name");
    if (error) throw new Error(`Failed to fetch brands: ${error.message}`);
    return data ?? [];
  },

  async getById(id: string): Promise<Brand | null> {
    const { data, error } = await (await getClient()).from("brands").select("*").eq("id", id).single();
    if (error) return null;
    return data;
  },
};

export const categoriesService = {
  async getAll(): Promise<Category[]> {
    const { data, error } = await (await getClient()).from("categories").select("*").order("name");
    if (error) throw new Error(`Failed to fetch categories: ${error.message}`);
    return data ?? [];
  },

  async getById(id: string): Promise<Category | null> {
    const { data, error } = await (await getClient())
      .from("categories")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return null;
    return data;
  },
};

export const productsService = {
  async getAll(): Promise<Product[]> {
    const { data, error } = await (await getClient()).from("products").select("*").order("name");
    if (error) throw new Error(`Failed to fetch products: ${error.message}`);
    return data ?? [];
  },

  async getBySupplierArticle(supplierArticle: string): Promise<Product | null> {
    const { data, error } = await (await getClient())
      .from("products")
      .select("*")
      .eq("supplier_article", supplierArticle)
      .single();
    if (error) return null;
    return data;
  },

  async getByNmId(nmId: number): Promise<Product | null> {
    const { data, error } = await (await getClient())
      .from("products")
      .select("*")
      .eq("nm_id", nmId)
      .single();
    if (error) return null;
    return data;
  },
};

export const ordersService = {
  async getByDateRange(from: string, to: string): Promise<WbOrder[]> {
    const { data, error } = await (await getClient())
      .from("wb_orders")
      .select("*")
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date", { ascending: false });
    if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
    return data ?? [];
  },
};

export const salesService = {
  async getByDateRange(from: string, to: string): Promise<WbSale[]> {
    const { data, error } = await (await getClient())
      .from("wb_sales")
      .select("*")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: false });
    if (error) throw new Error(`Failed to fetch sales: ${error.message}`);
    return data ?? [];
  },
};

export const financeService = {
  async getByDateRange(from: string, to: string): Promise<WbFinance[]> {
    const { data, error } = await (await getClient())
      .from("wb_finance")
      .select("*")
      .gte("operation_date", from)
      .lte("operation_date", to)
      .order("operation_date", { ascending: false });
    if (error) throw new Error(`Failed to fetch finance: ${error.message}`);
    return data ?? [];
  },
};

export const adsService = {
  async getByDateRange(from: string, to: string): Promise<WbAd[]> {
    const { data, error } = await (await getClient())
      .from("wb_ads")
      .select("*")
      .gte("campaign_date", from)
      .lte("campaign_date", to)
      .order("campaign_date", { ascending: false });
    if (error) throw new Error(`Failed to fetch ads: ${error.message}`);
    return data ?? [];
  },
};

export const costHistoryService = {
  async getByProductId(productId: string): Promise<ProductCostHistory[]> {
    const { data, error } = await (await getClient())
      .from("product_cost_history")
      .select("*")
      .eq("product_id", productId)
      .order("effective_from", { ascending: false });
    if (error) throw new Error(`Failed to fetch cost history: ${error.message}`);
    return data ?? [];
  },

  async getAll(): Promise<ProductCostHistory[]> {
    const { data, error } = await (await getClient())
      .from("product_cost_history")
      .select("*")
      .order("effective_from", { ascending: false });
    if (error) throw new Error(`Failed to fetch cost history: ${error.message}`);
    return data ?? [];
  },
};
