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
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ChevronDown
} from "lucide-react"
import { downloadCSV, getPeriodLabel, getPeriodDates, type Period } from "@/lib/utils/export"
import dynamic from "next/dynamic"

const ReportsCharts = dynamic(() => import("@/components/dashboard/reports-charts").then(m => m.ReportsCharts), {
  ssr: false,
  loading: () => <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6"><div className="lg:col-span-2 h-[300px] animate-pulse bg-muted rounded-lg" /><div className="h-[300px] animate-pulse bg-muted rounded-lg" /></div>,
})
import { getSalesOverview, getTopProducts, getCustomerMetrics, getSalesTrendData, type SalesOverview, type CustomerMetrics, type SalesTrendData } from "@/lib/analytics"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const COLORS = ["#B4D4A5", "#3D3D3D", "#6B7280", "#D1D5DB"]

export default function ReportsPage() {
  const [overview, setOverview] = useState<SalesOverview | null>(null)
  const [customerMetrics, setCustomerMetrics] = useState<CustomerMetrics | null>(null)
  const [trendData, setTrendData] = useState<SalesTrendData[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number; color: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<Period>("all")
  const [periodOpen, setPeriodOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    try {
      const { start, end } = getPeriodDates(period)
      const [ov, cm, trend] = await Promise.all([
        getSalesOverview(start, end),
        getCustomerMetrics(start, end),
        getSalesTrendData(start, end, "month"),
      ])

      setOverview(ov)
      setCustomerMetrics(cm)
      setTrendData(trend)

      // Build category breakdown from order_items
      const supabase = createSupabaseBrowserClient()
      let itemsQuery = supabase
        .from('order_items')
        .select('quantity, unit_price, product_id, products(category_id, categories(name)), orders!inner(created_at)')

      const { start: s, end: e } = getPeriodDates(period)
      if (s) itemsQuery = itemsQuery.gte('orders.created_at', s)
      if (e) itemsQuery = itemsQuery.lte('orders.created_at', e)

      const { data: orderItems } = await itemsQuery

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
    {
      name: "Sales Overview",
      description: `${totalOrders} orders totaling R${totalSales.toLocaleString()}`,
      date: "Live data",
      download: () => downloadCSV(`sales-overview-${period}.csv`, [
        { metric: "Total Revenue", value: `R${totalSales.toLocaleString()}` },
        { metric: "Total Orders", value: totalOrders },
        { metric: "Avg Order Value", value: `R${avgOrder.toFixed(2)}` },
        { metric: "Growth Rate", value: `${growthRate}%` },
        ...chartData.map((d) => ({ metric: d.month, value: `R${d.thisYear.toLocaleString()}` })),
      ]),
    },
    {
      name: "Customer Analytics",
      description: `${totalCustomers} customers, ${newCustomers} new this period`,
      date: "Live data",
      download: () => downloadCSV(`customer-analytics-${period}.csv`, [
        { metric: "Total Customers", value: totalCustomers },
        { metric: "New Customers", value: newCustomers },
        { metric: "Returning Customers", value: returningCustomers },
        { metric: "Customer Lifetime Value", value: `R${clv.toFixed(2)}` },
      ]),
    },
    {
      name: "Top Products",
      description: "Top selling products by revenue",
      date: "Live data",
      download: () => {
        const supabase = createSupabaseBrowserClient()
        getTopProducts(20).then((products) => {
          downloadCSV(`top-products-${period}.csv`, products.map((p) => ({
            product: p.name,
            units_sold: p.totalSold,
            revenue: `R${p.totalRevenue.toLocaleString()}`,
            rating: p.averageRating,
          })))
        })
      },
    },
    {
      name: "Category Breakdown",
      description: `${categoryData.length} categories analyzed`,
      date: "Live data",
      download: () => downloadCSV(`category-breakdown-${period}.csv`, categoryData.map((c) => ({
        category: c.name,
        percentage: `${c.value}%`,
      }))),
    },
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
          className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90"
          onClick={() => {
            downloadCSV(`hygienhub-report-${period}.csv`, [
              { section: "Overview", metric: "Total Revenue", value: `R${totalSales.toLocaleString()}` },
              { section: "Overview", metric: "Total Orders", value: totalOrders.toString() },
              { section: "Overview", metric: "Avg Order Value", value: `R${avgOrder.toFixed(2)}` },
              { section: "Overview", metric: "Growth Rate", value: `${growthRate}%` },
              { section: "Customers", metric: "Total Customers", value: totalCustomers.toString() },
              { section: "Customers", metric: "New Customers", value: newCustomers.toString() },
              { section: "Customers", metric: "Returning", value: returningCustomers.toString() },
              { section: "Customers", metric: "CLV", value: `R${clv.toFixed(2)}` },
              ...categoryData.map((c) => ({
                section: "Categories",
                metric: c.name,
                value: `${c.value}%`,
              })),
            ])
          }}
        >
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
      <ReportsCharts chartData={chartData} categoryData={categoryData} />

      {/* Available Reports */}
      <Card className="bg-card border border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-medium">Available Reports</CardTitle>
              <CardDescription>Download detailed analytics as CSV</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={() => {
                downloadCSV(`hygienhub-report-${period}.csv`, [
                  { section: "Overview", metric: "Total Revenue", value: `R${totalSales.toLocaleString()}` },
                  { section: "Overview", metric: "Total Orders", value: totalOrders.toString() },
                  { section: "Overview", metric: "Avg Order Value", value: `R${avgOrder.toFixed(2)}` },
                  { section: "Overview", metric: "Growth Rate", value: `${growthRate}%` },
                  { section: "Customers", metric: "Total Customers", value: totalCustomers.toString() },
                  { section: "Customers", metric: "New Customers", value: newCustomers.toString() },
                  { section: "Customers", metric: "Returning", value: returningCustomers.toString() },
                  { section: "Customers", metric: "CLV", value: `R${clv.toFixed(2)}` },
                  ...categoryData.map((c) => ({
                    section: "Categories",
                    metric: c.name,
                    value: `${c.value}%`,
                  })),
                ])
              }}
            >
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
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent flex items-center gap-2"
                  onClick={report.download}
                >
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
