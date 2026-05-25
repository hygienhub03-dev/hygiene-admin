"use client";

import { getSalesOverview, getSalesTrendData, getTopProducts, getCustomerMetrics, getInventoryTurnover, SalesOverview, SalesTrendData, ProductPerformance, CustomerMetrics } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart, Bar, XAxis as BarXAxis, YAxis as BarYAxis } from 'recharts';
import { TrendingUp, Users, Package, Receipt, DollarSign, AlertTriangle, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface InventoryMetrics {
  inventoryTurnoverRatio: number;
  daysSalesOfInventory: number;
  grossMarginReturnOnInvestment: number;
}

export default function DashboardPage() {
  const [salesOverview, setSalesOverview] = useState<SalesOverview | null>(null);
  const [salesTrendData, setSalesTrendData] = useState<SalesTrendData[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerformance[]>([]);
  const [customerMetrics, setCustomerMetrics] = useState<CustomerMetrics | null>(null);
  const [inventoryMetrics, setInventoryMetrics] = useState<InventoryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all dashboard data in parallel
      const [
        overview,
        trendData,
        products,
        metrics,
        inventory
      ] = await Promise.all([
        getSalesOverview(),
        getSalesTrendData(),
        getTopProducts(),
        getCustomerMetrics(),
        getInventoryTurnover()
      ]);

      setSalesOverview(overview);
      setSalesTrendData(trendData);
      setTopProducts(products);
      setCustomerMetrics(metrics);
      setInventoryMetrics(inventory);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to load dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((_) => (
            <Card key={_} className="h-24 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-medium text-muted-foreground">Loading...</h3>
                  <p className="text-2xl font-bold">-</p>
                </div>
              </div>
              <Badge variant="secondary">Today</Badge>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <h3 className="text-lg font-semibold">Error Loading Dashboard</h3>
        </div>
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={fetchDashboardData}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <Card>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">Total Sales</h3>
              <p className="text-2xl font-bold tracking-tight">
                {salesOverview?.totalSales != null
                  ? `R${salesOverview.totalSales.toLocaleString()}`
                  : 'R0'}
              </p>
            </div>
          </div>
          <Badge variant="secondary">{salesOverview?.growthRate != null
            ? `${salesOverview.growthRate >= 0 ? '+' : ''}${salesOverview.growthRate.toFixed(1)}%`
            : '0%'}</Badge>
        </Card>

        {/* Total Orders */}
        <Card>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">Total Orders</h3>
              <p className="text-2xl font-bold tracking-tight">
                {salesOverview?.totalOrders != null
                  ? salesOverview.totalOrders.toLocaleString()
                  : '0'}
              </p>
            </div>
          </div>
        </Card>

        {/* Average Order Value */}
        <Card>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">Average Order Value</h3>
              <p className="text-2xl font-bold tracking-tight">
                {salesOverview?.averageOrderValue != null
                  ? `R${salesOverview.averageOrderValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`
                  : 'R0.00'}
              </p>
            </div>
          </div>
        </Card>

        {/* Total Customers */}
        <Card>
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">Total Customers</h3>
              <p className="text-2xl font-bold tracking-tight">
                {customerMetrics?.totalCustomers != null
                  ? customerMetrics.totalCustomers.toLocaleString()
                  : '0'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Trend Chart */}
        <Card className="col-span-2">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Sales Trend</h3>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                7D
              </Button>
              <Button variant="outline" size="sm" className="text-muted-foreground/60">
                30D
              </Button>
              <Button variant="outline" size="sm" className="text-muted-foreground/60">
                90D
              </Button>
            </div>
          </div>
          {salesTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(date) => new Date(date).toLocaleDateString()} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="sales" stroke={('#2563eb')} strokeWidth={2} />
                <Line type="monotone" dataKey="orders" stroke={('#10b981')} strokeWidth={2} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No sales data available</p>
            </div>
          )}
        </Card>

        {/* Top Products Chart */}
        <Card>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Top Products</h3>
          </div>
          {topProducts.length > 0 ? (
            <div className="space-y-4">
              {topProducts.slice(0, 5).map((product) => (
                <div key={product.id} className="flex items-center space-x-3">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="h-8 w-8 bg-muted/50 rounded-md flex items-center justify-center">
                        {product.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-medium">{product.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {product.totalSold} sold • R${product.totalRevenue.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-x-2">
                    <div className="flex flex-col items-end">
                      <div className="w-6 h-6 bg-primary/10 rounded-lg flex items-center justify-center mb-1">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-xs font-medium text-primary">
                        R${product.totalRevenue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No product data available</p>
            </div>
          )}
        </Card>
      </div>

      {/* Customer & Inventory Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Metrics */}
        <Card>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Customer Metrics</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">New Customers</p>
                <p className="font-medium">{customerMetrics?.newCustomers}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Returning Customers</p>
                <p className="font-medium">{customerMetrics?.returningCustomers}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Customer LTV</p>
                <p className="font-medium">
                  {customerMetrics?.customerLifetimeValue != null
                    ? `R${customerMetrics.customerLifetimeValue.toFixed(2)}`
                    : 'R0.00'}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Inventory Metrics */}
        <Card>
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-semibold">Inventory Metrics</h3>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Inventory Turnover</p>
                <p className="font-medium">
                  {inventoryMetrics?.inventoryTurnoverRatio != null
                    ? inventoryMetrics.inventoryTurnoverRatio.toFixed(2)
                    : '0.00'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Days Sales of Inventory</p>
                <p className="font-medium">
                  {inventoryMetrics?.daysSalesOfInventory != null
                    ? inventoryMetrics.daysSalesOfInventory.toFixed(0)
                    : '0'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">GMROI</p>
                <p className="font-medium">
                  {inventoryMetrics?.grossMarginReturnOnInvestment != null
                    ? inventoryMetrics.grossMarginReturnOnInvestment.toFixed(2)
                    : '0.00'}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}