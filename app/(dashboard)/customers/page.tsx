"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Users, UserPlus, UserCheck, Mail } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import Loading from "./loading"

interface CustomerItem {
  id: string
  name: string
  email: string
  orders: number
  spent: string
  status: string
  joined: string
}

function CustomersContent() {
  const [customers, setCustomers] = useState<CustomerItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [totalCustomers, setTotalCustomers] = useState(0)
  const [newThisMonth, setNewThisMonth] = useState(0)
  const [returningCustomers, setReturningCustomers] = useState(0)
  const [avgLifetimeValue, setAvgLifetimeValue] = useState(0)

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    try {
      const supabase = createSupabaseBrowserClient()

      // Get all profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, created_at')
        .order('created_at', { ascending: false })

      if (!profiles) {
        setIsLoading(false)
        return
      }

      // Get order counts and totals per user
      const { data: orders } = await supabase
        .from('orders')
        .select('user_id, total_amount, created_at')

      const orderMap = new Map<string, { count: number; total: number }>()
      if (orders) {
        for (const order of orders as any[]) {
          const existing = orderMap.get(order.user_id) || { count: 0, total: 0 }
          existing.count += 1
          existing.total += Number(order.total_amount) || 0
          orderMap.set(order.user_id, existing)
        }
      }

      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const mapped: CustomerItem[] = profiles.map((p: any) => {
        const stats = orderMap.get(p.id) || { count: 0, total: 0 }
        const joinDate = new Date(p.created_at)
        const isNew = joinDate > thirtyDaysAgo
        const isVIP = stats.total > 5000
        const status = isVIP ? "VIP" : isNew ? "New" : stats.count > 0 ? "Active" : "Inactive"

        return {
          id: p.id,
          name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
          email: p.email || "",
          orders: stats.count,
          spent: `R${stats.total.toFixed(2)}`,
          status,
          joined: joinDate.toLocaleDateString("en-ZA", { month: "short", year: "numeric" }),
        }
      })

      setCustomers(mapped)
      setTotalCustomers(mapped.length)
      setNewThisMonth(mapped.filter(c => c.status === "New").length)
      setReturningCustomers(mapped.filter(c => c.orders > 1).length)

      const totalSpent = mapped.reduce((sum, c) => {
        const val = parseFloat(c.spent.replace("R", "").replace(",", ""))
        return sum + (isNaN(val) ? 0 : val)
      }, 0)
      setAvgLifetimeValue(mapped.length > 0 ? Math.round(totalSpent / mapped.length) : 0)
    } catch (err) {
      console.error("Failed to load customers:", err)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case "VIP":
        return "bg-amber-100 text-amber-800"
      case "Active":
        return "bg-green-100 text-green-800"
      case "New":
        return "bg-blue-100 text-blue-800"
      case "Inactive":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const customerSegments = [
    { name: "VIP Customers", count: customers.filter(c => c.status === "VIP").length, percentage: totalCustomers > 0 ? Math.round((customers.filter(c => c.status === "VIP").length / totalCustomers) * 100) : 0, color: "bg-amber-500" },
    { name: "Active Customers", count: customers.filter(c => c.status === "Active").length, percentage: totalCustomers > 0 ? Math.round((customers.filter(c => c.status === "Active").length / totalCustomers) * 100) : 0, color: "bg-[var(--color-accent)]" },
    { name: "New Customers", count: newThisMonth, percentage: totalCustomers > 0 ? Math.round((newThisMonth / totalCustomers) * 100) : 0, color: "bg-blue-500" },
    { name: "Inactive Customers", count: customers.filter(c => c.status === "Inactive").length, percentage: totalCustomers > 0 ? Math.round((customers.filter(c => c.status === "Inactive").length / totalCustomers) * 100) : 0, color: "bg-gray-400" },
  ]

  const returningPct = totalCustomers > 0 ? ((returningCustomers / totalCustomers) * 100).toFixed(1) : "0"

  return (
    <>
      <PageHeader
        title="Customers"
        description="Manage and view your customer base."
      >
        <Button className="flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90">
          <Plus className="w-4 h-4" />
          Add Customer
        </Button>
      </PageHeader>

      {/* Customer Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Customers</span>
              <div className="p-2 bg-muted rounded-lg">
                <Users className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">{totalCustomers}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">New This Month</span>
              <div className="p-2 bg-muted rounded-lg">
                <UserPlus className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">{newThisMonth}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Returning Customers</span>
              <div className="p-2 bg-muted rounded-lg">
                <UserCheck className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">{returningPct}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Avg. Lifetime Value</span>
              <div className="p-2 bg-muted rounded-lg">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <p className="text-3xl font-semibold">R{avgLifetimeValue}</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Segments & List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Segments */}
        <Card className="bg-card border border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Customer Segments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {customerSegments.map((segment) => (
                <div key={segment.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{segment.name}</span>
                    <span className="text-sm font-medium">{segment.count}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${segment.color}`}
                      style={{ width: `${segment.percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{segment.percentage}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Customer List */}
        <Card className="lg:col-span-3 bg-card border border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">All Customers</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Customer</th>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Orders</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Total Spent</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-muted-foreground">
                          No customers found
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.map((customer) => (
                        <tr key={customer.id} className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarFallback>{customer.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">{customer.name}</p>
                                <p className="text-xs text-muted-foreground">{customer.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant="secondary" className={getStatusColor(customer.status)}>
                              {customer.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-2 text-sm text-right">{customer.orders}</td>
                          <td className="py-3 px-2 text-sm text-right font-medium">{customer.spent}</td>
                          <td className="py-3 px-2 text-sm text-right text-muted-foreground">{customer.joined}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <CustomersContent />
    </Suspense>
  )
}
