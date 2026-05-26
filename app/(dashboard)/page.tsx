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
import { getSalesOverview, type SalesOverview } from "@/lib/analytics"

export default function DashboardPage() {
  const { profile } = useAuth()
  const [overview, setOverview] = useState<SalesOverview | null>(null)

  useEffect(() => {
    getSalesOverview().then(setOverview).catch(console.error)
  }, [])

  const revenue = overview ? `R${overview.totalSales.toLocaleString()}` : "R0"
  const orders = overview ? overview.totalOrders.toLocaleString() : "0"
  const customers = overview ? overview.totalCustomers.toLocaleString() : "0"
  const growth = overview ? `${overview.growthRate >= 0 ? "+" : ""}${overview.growthRate}%` : "0%"

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
        <MetricCard title="Total Revenue" value={revenue} change={growth} isPositiveOutcome={true} icon={DollarSign} />
        <MetricCard title="Total Orders" value={orders} change={growth} isPositiveOutcome={true} icon={ShoppingCart} />
        <MetricCard title="Active Customers" value={customers} change={growth} isPositiveOutcome={true} icon={Users} />
        <MetricCard title="Refund Rate" value="1.5%" change="-0.6%" isPositiveOutcome={true} icon={RotateCcw} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <ProfitChart />
        </div>
        <div>
          <TopProducts />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-full">
          <CustomerOrders />
        </div>
        <div className="lg:col-span-2 h-full">
          <SalesMap />
        </div>
      </div>
    </>
  )
}
