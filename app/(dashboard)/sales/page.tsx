"use client"

import { useState, useEffect } from "react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar, Download, TrendingUp, DollarSign, ShoppingBag, CreditCard, ChevronDown } from "lucide-react"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"
import Image from "next/image"
import { getSalesOverview, getTopProducts, getSalesTrendData, type SalesOverview, type ProductPerformance, type SalesTrendData } from "@/lib/analytics"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { downloadCSV, getPeriodLabel, getPeriodDates, type Period } from "@/lib/utils/export"

const COLORS = ["#B4D4A5", "#3D3D3D", "#6B7280", "#D1D5DB"]

export default function SalesPage() {
  const [overview, setOverview] = useState<SalesOverview | null>(null)
  const [trendData, setTrendData] = useState<SalesTrendData[]>([])
  const [topProducts, setTopProducts] = useState<ProductPerformance[]>([])
  const [salesByChannel, setSalesByChannel] = useState<{ channel: string; sales: number; percentage: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("year")
  const [periodOpen, setPeriodOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    try {
      const { start, end } = getPeriodDates(period)
      const [ov, trend, top] = await Promise.all([
        getSalesOverview(start, end),
        getSalesTrendData(start, end, "month"),
        getTopProducts(4),
      ])

      setOverview(ov)
      setTrendData(trend)
      setTopProducts(top)

      // Build sales by channel from payment method breakdown
      const supabase = createSupabaseBrowserClient()
      let ordersQuery = supabase
        .from('orders')
        .select('payment_method, total_amount, created_at')
        .in('status', ['processing', 'shipped', 'delivered', 'paid'])

      if (start) ordersQuery = ordersQuery.gte('created_at', start)
      if (end) ordersQuery = ordersQuery.lte('created_at', end)

      const { data: orders } = await ordersQuery

      if (orders) {
        const methodMap = new Map<string, number>()
        let total = 0
        for (const order of orders as any[]) {
          const method = order.payment_method || "Other"
          const amount = Number(order.total_amount) || 0
          methodMap.set(method, (methodMap.get(method) || 0) + amount)
          total += amount
        }
        const channels = Array.from(methodMap.entries())
          .map(([channel, sales]) => ({
            channel,
            sales: Math.round(sales),
            percentage: total > 0 ? Math.round((sales / total) * 100) : 0,
          }))
          .sort((a, b) => b.sales - a.sales)
        setSalesByChannel(channels)
      }
    } catch (err) {
      console.error("Failed to load sales data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const chartData = trendData.map((d) => {
    const date = new Date(d.date)
    const month = date.toLocaleString("en-ZA", { month: "short" })
    return { month, sales: d.sales, revenue: d.sales }
  })

  const totalSales = overview?.totalSales || 0
  const avgOrder = overview?.averageOrderValue || 0
  const totalOrders = overview?.totalOrders || 0
  const growthRate = overview?.growthRate || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Sales Analytics"
        description="Track your sales performance and product metrics."
      >
        <div className="relative">
          <Button
            variant="outline"
            className="flex items-center gap-2 bg-transparent text-sm"
            onClick={() => setPeriodOpen(!periodOpen)}
          >
            <Calendar className="w-4 h-4" />
            {getPeriodLabel(period)}
            <ChevronDown className="w-3 h-3" />
          </Button>
          {periodOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
              {(["week", "month", "year", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${period === p ? "font-medium bg-muted" : ""}`}
                  onClick={() => { setPeriod(p); setPeriodOpen(false) }}
                >
                  {getPeriodLabel(p)}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="outline"
          className="flex items-center gap-2 bg-transparent"
          onClick={() => {
            downloadCSV(`hygienhub-sales-${period}.csv`, [
              { metric: "Total Sales", value: `R${totalSales.toLocaleString()}` },
              { metric: "Average Order Value", value: `R${avgOrder.toFixed(2)}` },
              { metric: "Total Orders", value: totalOrders.toString() },
              { metric: "Growth Rate", value: `${growthRate}%` },
              ...chartData.map((d) => ({ metric: `Revenue — ${d.month}`, value: `R${d.revenue.toLocaleString()}` })),
              ...salesByChannel.map((c) => ({ metric: `Channel — ${c.channel}`, value: `R${c.sales.toLocaleString()} (${c.percentage}%)` })),
              ...topProducts.map((p) => ({ metric: `Top Product — ${p.name}`, value: `${p.totalSold} units / R${p.totalRevenue.toLocaleString()}` })),
            ])
          }}
        >
          <Download className="w-4 h-4" />
          Export
        </Button>
      </PageHeader>

      {/* Sales Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Sales</span>
              <div className="p-2 bg-muted rounded-lg">
                <ShoppingBag className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">R{totalSales.toLocaleString()}</p>
            <p className="text-xs text-[var(--color-positive)] mt-1">
              {growthRate >= 0 ? "+" : ""}{growthRate}% vs last period
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Average Order Value</span>
              <div className="p-2 bg-muted rounded-lg">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">R{avgOrder.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{totalOrders} total orders</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Growth Rate</span>
              <div className="p-2 bg-muted rounded-lg">
                <TrendingUp className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">{growthRate >= 0 ? "+" : ""}{growthRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">vs previous 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Sales & Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                No sales data available yet
              </div>
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis axisLine={false} tickLine={false} fontSize={12} tickFormatter={(value) => `R${value / 1000}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "8px" }}
                      formatter={(value: number) => [`R${value.toLocaleString()}`, ""]}
                    />
                    <Bar dataKey="sales" fill="#B4D4A5" radius={[4, 4, 0, 0]} name="Sales" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales by Channel */}
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Sales by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            {salesByChannel.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                No channel data yet
              </div>
            ) : (
              <div className="space-y-4">
                {salesByChannel.map((item) => (
                  <div key={item.channel}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">{item.channel}</span>
                      <span className="text-sm font-medium">{item.percentage}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-accent)] rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">R{item.sales.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Table */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Top Selling Products</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No product sales data yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Product</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Units Sold</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((product, idx) => (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {idx + 1}
                          </div>
                          <div>
                            <span className="text-sm font-medium">{product.name}</span>
                            {product.averageRating > 0 && (
                              <p className="text-xs text-muted-foreground">Rating: {product.averageRating}/5</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-right">{product.totalSold.toLocaleString()}</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">R{product.totalRevenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
