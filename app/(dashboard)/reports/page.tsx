"use client"

import { useState, useEffect } from "react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Download,
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Clock
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { getSalesOverview, getTopProducts, getCustomerMetrics, getSalesTrendData, type SalesOverview, type CustomerMetrics, type SalesTrendData } from "@/lib/analytics"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const COLORS = ["#B4D4A5", "#3D3D3D", "#6B7280", "#D1D5DB"]

export default function ReportsPage() {
  const [overview, setOverview] = useState<SalesOverview | null>(null)
  const [customerMetrics, setCustomerMetrics] = useState<CustomerMetrics | null>(null)
  const [trendData, setTrendData] = useState<SalesTrendData[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ov, cm, trend] = await Promise.all([
        getSalesOverview(),
        getCustomerMetrics(),
        getSalesTrendData(undefined, undefined, "month"),
      ])

      setOverview(ov)
      setCustomerMetrics(cm)
      setTrendData(trend)

      // Build category breakdown from order_items
      const supabase = createSupabaseBrowserClient()
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('quantity, unit_price, product_id, products(category_id, categories(name))')

      if (orderItems) {
        const catMap = new Map<string, number>()
        let total = 0
        for (const item of orderItems as any[]) {
          const catName = (item.products?.categories as any)?.name || "Other"
          const revenue = (Number(item.unit_price) || 0) * (item.quantity || 0)
          catMap.set(catName, (catMap.get(catName) || 0) + revenue)
          total += revenue
        }
        const cats = Array.from(catMap.entries())
          .map(([name, value], i) => ({
            name,
            value: total > 0 ? Math.round((value / total) * 100) : 0,
            color: COLORS[i % COLORS.length],
          }))
          .sort((a, b) => b.value - a.value)
        setCategoryData(cats)
      }
    } catch (err) {
      console.error("Failed to load reports data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const totalSales = overview?.totalSales || 0
  const totalOrders = overview?.totalOrders || 0
  const avgOrder = overview?.averageOrderValue || 0
  const growthRate = overview?.growthRate || 0
  const totalCustomers = customerMetrics?.totalCustomers || 0
  const newCustomers = customerMetrics?.newCustomers || 0
  const returningCustomers = customerMetrics?.returningCustomers || 0
  const clv = customerMetrics?.customerLifetimeValue || 0

  const chartData = trendData.map((d) => {
    const date = new Date(d.date)
    return {
      month: date.toLocaleString("en-ZA", { month: "short" }),
      thisYear: d.sales,
      lastYear: 0,
    }
  })

  const performanceMetrics = [
    { label: "Total Revenue", value: `R${totalSales.toLocaleString()}`, change: `${growthRate >= 0 ? "+" : ""}${growthRate}%`, isPositive: growthRate >= 0 },
    { label: "Avg Order Value", value: `R${avgOrder.toFixed(2)}`, change: `${totalOrders} orders`, isPositive: true },
    { label: "Total Customers", value: totalCustomers.toString(), change: `${newCustomers} new`, isPositive: true },
    { label: "Returning Customers", value: returningCustomers.toString(), change: `R${clv.toFixed(0)} CLV`, isPositive: returningCustomers > 0 },
  ]

  const availableReports = [
    { name: "Sales Overview", description: `${totalOrders} orders totaling R${totalSales.toLocaleString()}`, date: "Live data", size: "" },
    { name: "Customer Analytics", description: `${totalCustomers} customers, ${newCustomers} new this period`, date: "Live data", size: "" },
    { name: "Top Products", description: "Top selling products by revenue", date: "Live data", size: "" },
    { name: "Category Breakdown", description: `${categoryData.length} categories analyzed`, date: "Live data", size: "" },
  ]

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
        title="Reports"
        description="Generate, view, and download detailed analytics reports."
      >
        <Button variant="outline" className="flex items-center gap-2 bg-transparent text-sm">
          <Calendar className="w-4 h-4" />
          This Period
        </Button>
        <Button className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90">
          <FileText className="w-4 h-4" />
          Generate Report
        </Button>
      </PageHeader>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {performanceMetrics.map((metric) => (
          <Card key={metric.label} className="bg-card border border-border">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-2xl font-semibold">{metric.value}</p>
                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                  metric.isPositive ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
                }`}>
                  {metric.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {metric.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 bg-card border border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Revenue Trend
                </CardTitle>
                <CardDescription>Monthly sales performance</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                No revenue data available yet
              </div>
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" tickFormatter={(v) => `R${v/1000}k`} />
                    <Tooltip
                      formatter={(value: number) => [`R${value.toLocaleString()}`, ""]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #E5E5E5",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="thisYear"
                      stroke="#B4D4A5"
                      fill="#B4D4A5"
                      fillOpacity={0.3}
                      strokeWidth={2}
                      name="Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sales by Category */}
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Sales by Category
            </CardTitle>
            <CardDescription>Distribution of revenue</CardDescription>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No category data yet
              </div>
            ) : (
              <>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {categoryData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, ""]}
                        contentStyle={{
                          backgroundColor: "white",
                          border: "1px solid #E5E5E5",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {categoryData.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs text-muted-foreground">{cat.name}</span>
                      <span className="text-xs font-medium ml-auto">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Available Reports */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">Available Reports</CardTitle>
              <CardDescription>Download or schedule automated reports</CardDescription>
            </div>
            <Button variant="outline" size="sm" className="bg-transparent">
              View All Reports
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {availableReports.map((report) => (
              <div
                key={report.name}
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-muted rounded-lg">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{report.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {report.date}
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="bg-transparent flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
