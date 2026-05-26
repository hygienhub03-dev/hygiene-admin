"use client"

import { useState, useEffect } from "react"
import { Suspense } from "react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, Filter, ShoppingCart, Package, Truck, CheckCircle, Clock, XCircle, ChevronDown } from "lucide-react"
import { apiFetch } from "@/lib/api"
import Loading from "./loading"

interface OrderItem {
  fullId: string
  id: string
  customer: string
  email: string
  items: number
  total: string
  status: string
  rawStatus: string
  date: string
  payment: string
}

const STATUS_OPTIONS = [
  { label: "Pending", raw: "waiting" },
  { label: "Processing", raw: "processing" },
  { label: "Shipped", raw: "shipped" },
  { label: "Completed", raw: "delivered" },
  { label: "Cancelled", raw: "cancelled" },
]

const capitalizeStatus = (s: string) => {
  const map: Record<string, string> = {
    waiting: "Pending",
    processing: "Processing",
    confirmed: "Processing",
    shipped: "Shipped",
    delivered: "Completed",
    cancelled: "Cancelled",
    returned: "Cancelled",
  }
  return map[s] || s.charAt(0).toUpperCase() + s.slice(1)
}

function OrdersContent() {
  const [orders, setOrders] = useState<OrderItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    try {
      const res = await apiFetch<{ data: any[] }>("/api/orders")
      if (res.success) {
        const data = (res as any).data ?? []
        setOrders(data.map((o: any) => ({
          fullId: o.id || "",
          id: o.id?.slice(0, 8).toUpperCase() || "N/A",
          customer: o.userEmail || "Unknown",
          email: o.userEmail || "",
          items: o.cartItems?.length || 0,
          total: `R${(o.totalAmount || 0).toFixed(2)}`,
          status: capitalizeStatus(o.orderStatus || "waiting"),
          rawStatus: o.orderStatus || "waiting",
          date: o.orderDate ? new Date(o.orderDate).toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" }) : "N/A",
          payment: o.paymentMethod || "N/A",
        })))
      }
    } catch (err) {
      console.error("Failed to load orders:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusChange = async (orderFullId: string, newRawStatus: string, newLabel: string) => {
    setUpdatingId(orderFullId)
    try {
      const res = await apiFetch(`/api/orders/${orderFullId}`, {
        method: "PUT",
        body: { status: newRawStatus },
      })
      if (res.success) {
        setOrders(prev =>
          prev.map(o =>
            o.fullId === orderFullId
              ? { ...o, status: newLabel, rawStatus: newRawStatus }
              : o
          )
        )
      } else {
        console.error("Failed to update order:", (res as any).message)
      }
    } catch (err) {
      console.error("Failed to update order:", err)
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = !statusFilter || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalOrders = orders.length
  const processing = orders.filter(o => o.status === "Processing").length
  const shipped = orders.filter(o => o.status === "Shipped").length
  const completed = orders.filter(o => o.status === "Completed").length

  const orderStats = [
    { label: "Total Orders", value: totalOrders.toString(), change: "", icon: ShoppingCart },
    { label: "Processing", value: processing.toString(), change: "", icon: Clock },
    { label: "Shipped", value: shipped.toString(), change: "", icon: Truck },
    { label: "Completed", value: completed.toString(), change: "", icon: CheckCircle },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-800"
      case "Processing":
        return "bg-blue-100 text-blue-800"
      case "Shipped":
        return "bg-purple-100 text-purple-800"
      case "Pending":
        return "bg-amber-100 text-amber-800"
      case "Cancelled":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Completed":
        return <CheckCircle className="w-3 h-3" />
      case "Processing":
        return <Clock className="w-3 h-3" />
      case "Shipped":
        return <Truck className="w-3 h-3" />
      case "Pending":
        return <Package className="w-3 h-3" />
      case "Cancelled":
        return <XCircle className="w-3 h-3" />
      default:
        return null
    }
  }

  return (
    <>
      <PageHeader
        title="Orders"
        description="Track and manage customer orders."
      >
        <Button variant="outline" className="flex items-center gap-2 bg-transparent">
          <Filter className="w-4 h-4" />
          Filter
        </Button>
      </PageHeader>

      {/* Order Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {orderStats.map((stat) => (
          <Card key={stat.label} className="bg-card border border-border">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <div className="p-2 bg-muted rounded-lg">
                  <stat.icon className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
              <p className="text-3xl font-semibold">{stat.value}</p>
              {stat.change && <p className="text-xs text-[var(--color-positive)] mt-1">{stat.change}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(null)}
          className={statusFilter === null ? "bg-foreground text-background" : "bg-transparent"}
        >
          All Orders
        </Button>
        {["Pending", "Processing", "Shipped", "Completed", "Cancelled"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-foreground text-background" : "bg-transparent"}
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by order ID or customer..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-card border-border"
        />
      </div>

      {/* Orders Table */}
      <Card className="bg-card border border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">ORDER ID</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">CUSTOMER</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">ITEMS</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">TOTAL</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">STATUS</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">DATE</th>
                    <th className="text-left text-muted-foreground font-medium text-sm py-3 px-4">PAYMENT</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-muted-foreground">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.fullId} className="border-b border-border hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{order.id}</td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium">{order.customer}</p>
                            <p className="text-xs text-muted-foreground">{order.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">{order.items}</td>
                        <td className="py-3 px-4 font-medium">{order.total}</td>
                        <td className="py-3 px-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                disabled={updatingId === order.fullId}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 ${getStatusColor(order.status)}`}
                              >
                                {updatingId === order.fullId ? (
                                  <div className="w-3 h-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  getStatusIcon(order.status)
                                )}
                                {order.status}
                                <ChevronDown className="w-3 h-3 ml-0.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {STATUS_OPTIONS.map((opt) => (
                                <DropdownMenuItem
                                  key={opt.raw}
                                  disabled={order.rawStatus === opt.raw}
                                  onClick={() => handleStatusChange(order.fullId, opt.raw, opt.label)}
                                  className={order.rawStatus === opt.raw ? "font-semibold" : ""}
                                >
                                  <span className={`inline-flex items-center gap-1.5 ${order.rawStatus === opt.raw ? "text-foreground" : ""}`}>
                                    {getStatusIcon(opt.label)}
                                    {opt.label}
                                    {order.rawStatus === opt.raw && <span className="text-xs text-muted-foreground ml-1">(current)</span>}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{order.date}</td>
                        <td className="py-3 px-4 text-muted-foreground">{order.payment}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OrdersContent />
    </Suspense>
  )
}
