"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import { MetricCard } from "@/components/dashboard/metric-card"
import { PageHeader } from "@/components/dashboard/page-header"
import { TopProducts } from "@/components/dashboard/top-products"
import { Button } from "@/components/ui/button"
import { Calendar, Upload, DollarSign, ShoppingCart, Users, RotateCcw, ChevronDown } from "lucide-react"
import { downloadCSV, getPeriodLabel, getPeriodDates, type Period } from "@/lib/utils/export"
import { useAuth } from "@/context/AuthContext"
import { getSalesOverview, getSalesTrendData, getTopProducts, type SalesOverview, type SalesTrendData, type ProductPerformance } from "@/lib/analytics"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

const ProfitChart = dynamic(() => import("@/components/dashboard/profit-chart").then(m => m.ProfitChart), { ssr: false, loading: () => <div className="h-[280px] animate-pulse bg-muted rounded-lg" /> })
const CustomerOrders = dynamic(() => import("@/components/dashboard/customer-orders").then(m => m.CustomerOrders), { ssr: false, loading: () => <div className="h-[280px] animate-pulse bg-muted rounded-lg" /> })
const SalesMap = dynamic(() => import("@/components/dashboard/sales-map").then(m => m.SalesMap), { ssr: false, loading: () => <div className="h-[280px] animate-pulse bg-muted rounded-lg" /> })

const PROVINCE_COLORS = ["#3b82f6", "#22c55e", "#8b5cf6", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#6366f1"]

interface ProvinceData {
  province: string
  value: number
  color: string
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const [overview, setOverview] = useState<SalesOverview | null>(null)
  const [trendData, setTrendData] = useState<SalesTrendData[]>([])
  const [topProducts, setTopProducts] = useState<ProductPerformance[]>([])
  const [provinceData, setProvinceData] = useState<ProvinceData[]>([])
  const [orderTrendData, setOrderTrendData] = useState<{ month: string; orders: number }[]>([])
  const [period, setPeriod] = useState<Period>("all")
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

      // Build order trend from trend data
      setOrderTrendData(
        trend.map((d) => ({
          month: new Date(d.date).toLocaleString("en-ZA", { month: "short" }),
          orders: d.orders,
        }))
      )

      // Build province breakdown from orders with shipping_address
      const supabase = createSupabaseBrowserClient()
      let ordersQuery = supabase
        .from("orders")
        .select("total_amount, shipping_address")
        .in("status", ["processing", "shipped", "delivered", "paid"])

      const { start: s, end: e } = getPeriodDates(period)
      if (s) ordersQuery = ordersQuery.gte("created_at", s)
      if (e) ordersQuery = ordersQuery.lte("created_at", e)

      const { data: orders } = await ordersQuery

      if (orders) {
        const provinceMap = new Map<string, number>()
        for (const order of orders as any[]) {
          const province =
            order.shipping_address?.province ||
            order.shipping_address?.state ||
            "Unknown"
          const amount = Number(order.total_amount) || 0
          provinceMap.set(province, (provinceMap.get(province) || 0) + amount)
        }
        const sorted = Array.from(provinceMap.entries())
          .sort(([, a], [, b]) => b - a)
          .slice(0, 6)
        setProvinceData(
          sorted.map(([province, value], i) => ({
            province,
            value: Math.round(value),
            color: PROVINCE_COLORS[i % PROVINCE_COLORS.length],
          }))
        )
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err)
    }
  }

  const revenue = overview ? `R${overview.totalSales.toLocaleString()}` : "R0"
  const ordersCount = overview ? overview.totalOrders.toLocaleString() : "0"
  const customers = overview ? overview.totalCustomers.toLocaleString() : "0"
  const growthRate = overview?.growthRate || 0
  const growth = `${growthRate >= 0 ? "+" : ""}${growthRate}%`

  const profitChartData = useMemo(() => trendData.map((d) => {
    const date = new Date(d.date)
    return {
      month: date.toLocaleString("en-ZA", { month: "short" }),
      sales: d.sales,
      revenue: d.sales,
    }
  }), [trendData])

  const totalProfit = overview ? `R${overview.totalSales.toLocaleString()}` : "R0"
  const totalOrdersNum = overview?.totalOrders || 0
  const totalOrdersDisplay = totalOrdersNum.toLocaleString()

  const topProductsDisplay = useMemo(() => topProducts.map((p) => ({
    name: p.name,
    category: "",
    price: `R${p.totalRevenue.toLocaleString()}`,
    image: p.image,
  })), [topProducts])

  const topProvince = provinceData[0]?.province || "N/A"
  const topProvinceRevenue = provinceData[0] ? `R${provinceData[0].value.toLocaleString()}` : "R0"
  const totalProvinceRevenue = provinceData.reduce((sum, p) => sum + p.value, 0)

  const handleExport = useCallback(() => {
    downloadCSV(`hygienhub-dashboard-${period}.csv`, [
      { metric: "Total Revenue", value: revenue },
      { metric: "Total Orders", value: ordersCount },
      { metric: "Active Customers", value: customers },
      { metric: "Growth Rate", value: growth },
      ...topProducts.map((p) => ({
        metric: `Product: ${p.name}`,
        value: `R${p.totalRevenue.toLocaleString()}`,
      })),
      ...provinceData.map((p) => ({
        metric: `Province: ${p.province}`,
        value: `R${p.value.toLocaleString()}`,
      })),
    ])
  }, [period, revenue, ordersCount, customers, growth, topProducts, provinceData])

  return (
    <>
      <PageHeader
        title={`Welcome back ${profile?.first_name ? profile.first_name : ""} 👋`}
        description="An overview of customer insights, sales performance, and revenue analytics for Hygiene Hub Skincare."
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
          onClick={handleExport}
        >
          <Upload className="w-4 h-4" />
          Export Report
        </Button>
      </PageHeader>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Total Revenue" value={revenue} change={growth} isPositiveOutcome={growthRate >= 0} icon={DollarSign} />
        <MetricCard title="Total Orders" value={ordersCount} change={growth} isPositiveOutcome={growthRate >= 0} icon={ShoppingCart} />
        <MetricCard title="Active Customers" value={customers} change={growth} isPositiveOutcome={growthRate >= 0} icon={Users} />
        <MetricCard title="Refund Rate" value="0%" change="0%" isPositiveOutcome={true} icon={RotateCcw} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ProfitChart
            data={profitChartData}
            totalProfit={totalProfit}
            growth={growth}
            growthPositive={growthRate >= 0}
          />
        </div>
        <div>
          <TopProducts products={topProductsDisplay} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-full">
          <CustomerOrders
            data={orderTrendData}
            totalOrders={totalOrdersDisplay}
            growth={growth}
            growthPositive={growthRate >= 0}
          />
        </div>
        <div className="lg:col-span-2 h-full">
          <SalesMap
            provinceData={provinceData}
            topProvince={topProvince}
            topProvinceRevenue={topProvinceRevenue}
            totalRevenue={`R${totalProvinceRevenue.toLocaleString()}`}
          />
        </div>
      </div>
    </>
  )
}
