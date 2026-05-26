"use client"

import { useEffect, useState } from "react"
import { MetricCard } from "@/components/dashboard/metric-card"
import { PageHeader } from "@/components/dashboard/page-header"
import { ProfitChart } from "@/components/dashboard/profit-chart"
import { CustomerOrders } from "@/components/dashboard/customer-orders"
import { TopProducts } from "@/components/dashboard/top-products"
import { SalesMap } from "@/components/dashboard/sales-map"
import { Button } from "@/components/ui/button"
import { Calendar, Upload, DollarSign, ShoppingCart, Users, RotateCcw } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { getSalesOverview, getSalesTrendData, getTopProducts, type SalesOverview, type SalesTrendData, type ProductPerformance } from "@/lib/analytics"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [ov, trend, top] = await Promise.all([
        getSalesOverview(),
        getSalesTrendData(undefined, undefined, "month"),
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
      const { data: orders } = await supabase
        .from("orders")
        .select("total_amount, shipping_address")
        .in("status", ["processing", "shipped", "delivered", "paid"])

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

  // Chart data: monthly sales vs revenue
  const profitChartData = trendData.map((d) => {
    const date = new Date(d.date)
    return {
      month: date.toLocaleString("en-ZA", { month: "short" }),
      sales: d.sales,
      revenue: d.sales,
    }
  })

  const totalProfit = overview ? `R${overview.totalSales.toLocaleString()}` : "R0"

  // Total orders for customer orders card
  const totalOrdersNum = overview?.totalOrders || 0
  const totalOrdersDisplay = totalOrdersNum.toLocaleString()

  // Top products for the card
  const topProductsDisplay = topProducts.map((p) => ({
    name: p.name,
    category: "",
    price: `R${p.totalRevenue.toLocaleString()}`,
    image: "/placeholder.svg",
  }))

  // Province stats
  const topProvince = provinceData[0]?.province || "N/A"
  const topProvinceRevenue = provinceData[0] ? `R${provinceData[0].value.toLocaleString()}` : "R0"
  const totalProvinceRevenue = provinceData.reduce((sum, p) => sum + p.value, 0)

  return (
    <>
      <PageHeader
        title={`Welcome back ${profile?.first_name ? profile.first_name : ""} 👋`}
        description="An overview of customer insights, sales performance, and revenue analytics for Hygiene Hub Skincare."
      >
        <Button variant="outline" className="flex items-center gap-2 bg-transparent text-sm">
          <Calendar className="w-4 h-4" />
          This Week
        </Button>
        <Button variant="outline" className="flex items-center gap-2 bg-transparent">
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
