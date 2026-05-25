import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Analytics utility functions for the admin dashboard
export interface SalesOverview {
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  growthRate: number;
}

export interface SalesTrendData {
  date: string;
  sales: number;
  orders: number;
}

export interface ProductPerformance {
  id: string;
  name: string;
  slug: string;
  totalSold: number;
  totalRevenue: number;
  averageRating: number;
}

export interface CustomerMetrics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  customerLifetimeValue: number;
}

/**
 * Get sales overview statistics
 */
export async function getSalesOverview(
  startDate?: string,
  endDate?: string
): Promise<SalesOverview> {
  const supabase = createSupabaseBrowserClient();

  // Get total sales and order count
  let ordersQuery = supabase
    .from('orders')
    .select('total_amount, user_id, created_at')
    .in('status', ['processing', 'shipped', 'delivered', 'paid']);

  if (startDate) ordersQuery = ordersQuery.gte('created_at', startDate);
  if (endDate) ordersQuery = ordersQuery.lte('created_at', endDate);

  const { data: orders } = await ordersQuery;

  const totalSales = orders?.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0) || 0;
  const totalOrders = orders?.length || 0;
  const averageOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

  // Get unique customers
  const uniqueCustomers = new Set(orders?.map((o: any) => o.user_id).filter(Boolean));

  // Calculate growth rate (compare last 30 days vs previous 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const recentSales = orders?.filter((o: any) => o.created_at >= thirtyDaysAgo)
    .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0) || 0;
  const previousSales = orders?.filter((o: any) => o.created_at >= sixtyDaysAgo && o.created_at < thirtyDaysAgo)
    .reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0) || 0;

  const growthRate = previousSales > 0 ? ((recentSales - previousSales) / previousSales) * 100 : 0;

  return {
    totalSales,
    totalOrders,
    averageOrderValue,
    totalCustomers: uniqueCustomers.size,
    growthRate: Math.round(growthRate * 100) / 100
  };
}

/**
 * Get sales trend data for charts
 */
export async function getSalesTrendData(
  startDate?: string,
  endDate?: string,
  interval: 'day' | 'week' | 'month' = 'day'
): Promise<SalesTrendData[]> {
  const supabase = createSupabaseBrowserClient();

  let query = supabase
    .from('orders')
    .select('total_amount, created_at')
    .in('status', ['processing', 'shipped', 'delivered', 'paid'])
    .order('created_at', { ascending: true });

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: orders } = await query;

  if (!orders || orders.length === 0) return [];

  // Group by interval
  const grouped = new Map<string, { sales: number; orders: number }>();

  for (const order of orders as any[]) {
    const date = new Date(order.created_at);
    let key: string;

    if (interval === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (interval === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const existing = grouped.get(key) || { sales: 0, orders: 0 };
    existing.sales += Number(order.total_amount) || 0;
    existing.orders += 1;
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(([date, data]) => ({
    date,
    sales: Math.round(data.sales * 100) / 100,
    orders: data.orders
  }));
}

/**
 * Get top performing products
 */
export async function getTopProducts(limit: number = 10): Promise<ProductPerformance[]> {
  const supabase = createSupabaseBrowserClient();

  // Get order items with product info
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(`
      product_id,
      quantity,
      unit_price,
      products ( id, name, slug, average_review )
    `);

  if (!orderItems) return [];

  // Aggregate by product
  const productMap = new Map<string, { name: string; slug: string; totalSold: number; totalRevenue: number; averageRating: number }>();

  for (const item of orderItems as any[]) {
    const productId = item.product_id;
    const existing = productMap.get(productId) || {
      name: item.products?.name || 'Unknown',
      slug: item.products?.slug || '',
      totalSold: 0,
      totalRevenue: 0,
      averageRating: Number(item.products?.average_review) || 0
    };

    existing.totalSold += item.quantity || 0;
    existing.totalRevenue += (Number(item.unit_price) || 0) * (item.quantity || 0);
    productMap.set(productId, existing);
  }

  return Array.from(productMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, limit)
    .map(p => ({
      ...p,
      totalRevenue: Math.round(p.totalRevenue * 100) / 100,
      averageRating: Math.round(p.averageRating * 100) / 100
    }));
}

/**
 * Get customer metrics
 */
export async function getCustomerMetrics(
  startDate?: string,
  endDate?: string
): Promise<CustomerMetrics> {
  const supabase = createSupabaseBrowserClient();

  // Get all orders to analyze customer behavior
  let query = supabase
    .from('orders')
    .select('user_id, total_amount, created_at')
    .order('created_at', { ascending: true });

  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data: orders } = await query;

  if (!orders || orders.length === 0) {
    return { totalCustomers: 0, newCustomers: 0, returningCustomers: 0, customerLifetimeValue: 0 };
  }

  // Count orders per customer
  const customerOrders = new Map<string, { count: number; totalSpent: number; firstOrder: string }>();

  for (const order of orders as any[]) {
    const userId = order.user_id;
    if (!userId) continue;

    const existing = customerOrders.get(userId) || { count: 0, totalSpent: 0, firstOrder: order.created_at };
    existing.count += 1;
    existing.totalSpent += Number(order.total_amount) || 0;
    if (order.created_at < existing.firstOrder) existing.firstOrder = order.created_at;
    customerOrders.set(userId, existing);
  }

  const totalCustomers = customerOrders.size;
  const returningCustomers = Array.from(customerOrders.values()).filter(c => c.count > 1).length;
  const newCustomers = totalCustomers - returningCustomers;
  const totalSpent = Array.from(customerOrders.values()).reduce((sum, c) => sum + c.totalSpent, 0);
  const customerLifetimeValue = totalCustomers > 0 ? totalSpent / totalCustomers : 0;

  return {
    totalCustomers,
    newCustomers,
    returningCustomers,
    customerLifetimeValue: Math.round(customerLifetimeValue * 100) / 100
  };
}

/**
 * Get inventory turnover metrics
 */
export async function getInventoryTurnover(): Promise<{
  inventoryTurnoverRatio: number;
  daysSalesOfInventory: number;
  grossMarginReturnOnInvestment: number;
}> {
  const supabase = createSupabaseBrowserClient();

  // Get current inventory value
  const { data: products } = await supabase
    .from('products')
    .select('stock, price');

  const totalInventoryValue = (products as any[])?.reduce(
    (sum: number, p: any) => sum + (p.stock || 0) * (Number(p.price) || 0), 0
  ) || 0;

  // Get last 30 days sales
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentItems } = await supabase
    .from('order_items')
    .select('quantity, unit_price')
    .gte('created_at', thirtyDaysAgo);

  const costOfGoodsSold = (recentItems as any[])?.reduce(
    (sum: number, item: any) => sum + (Number(item.unit_price) || 0) * (item.quantity || 0), 0
  ) || 0;

  const annualizedCOGS = costOfGoodsSold * 12; // Approximate annual from monthly
  const inventoryTurnoverRatio = totalInventoryValue > 0 ? annualizedCOGS / totalInventoryValue : 0;
  const daysSalesOfInventory = inventoryTurnoverRatio > 0 ? 365 / inventoryTurnoverRatio : 0;

  return {
    inventoryTurnoverRatio: Math.round(inventoryTurnoverRatio * 100) / 100,
    daysSalesOfInventory: Math.round(daysSalesOfInventory),
    grossMarginReturnOnInvestment: 0 // Requires cost data not in schema
  };
}
