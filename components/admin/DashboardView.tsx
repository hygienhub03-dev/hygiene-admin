"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge,
  Button,
  Table, TableHead, TableBody, TableRow, TableHeadCell, TableCell,
  ShoppingCartIcon,
  UsersIcon,
  PackageIcon,
  BarChartIcon,
  ArrowUpRightIcon,
} from "./ui";
import { useAdminShell } from "./AdminLayout";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import LowStockAlert from "./LowStockAlert";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

type Order = {
  _id: string;
  userId?: string;
  cartItems?: Array<{ title?: string; quantity?: number; price?: string }>;
  orderStatus?: string;
  paymentStatus?: string;
  totalAmount?: number;
  orderDate?: string;
};

type Customer = {
  _id: string;
  userName?: string;
  email?: string;
  role?: string;
  orderCount?: number;
  totalSpent?: number;
  lastOrderDate?: string | null;
};

type ProductAgg = { name: string; units: number; revenue: number };

function toDateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n: number) {
  return `R${n.toFixed(2)}`;
}

function pct(n: number) {
  if (!Number.isFinite(n)) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

function safeParseDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function statusVariant(s?: string): "success" | "warning" | "default" | "muted" | "destructive" {
  const v = (s ?? "").toLowerCase();
  if (v.includes("deliver") || v.includes("complete")) return "success";
  if (v.includes("confirm") || v.includes("process")) return "default";
  if (v.includes("pending")) return "warning";
  if (v.includes("cancel") || v.includes("reject") || v.includes("fail") || v.includes("refund")) return "destructive";
  return "muted";
}

function downloadCsv(orders: Order[], customers: Customer[]) {
  // Build customer lookup for real names
  const customerMap = new Map(customers.map((c) => [c._id, c]));

  const headers = ["OrderID", "Customer", "Email", "Status", "Payment", "Total (R)", "Items", "Date"];
  const escape  = (v: string) => `"${String(v).replaceAll('"', '""')}"`;

  const rows = orders.map((o) => {
    const cust    = customerMap.get(o.userId ?? "");
    const name    = cust?.userName ?? `User ${(o.userId ?? "").slice(-6)}`;
    const email   = cust?.email ?? "";
    const items   = (o.cartItems ?? []).map((i) => `${i.title ?? "?"} x${i.quantity ?? 0}`).join("; ");
    return [
      o._id,
      name,
      email,
      o.orderStatus ?? "",
      o.paymentStatus ?? "",
      Number(o.totalAmount ?? 0).toFixed(2),
      items,
      o.orderDate ? new Date(o.orderDate).toLocaleString() : "",
    ].map(escape).join(",");
  });

  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DashboardView() {
  const { profileStore } = useAdminShell();

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load(initial = false) {
      if (initial) { setLoading(true); setError(null); }

      const [o, c] = await Promise.all([
        apiFetch<{ data?: Order[] }>("/api/admin/orders/get"),
        apiFetch<{ data?: Customer[] }>("/api/admin/customers/get"),
      ]);

      if (cancelled) return;

      if (!o.success) {
        const msg = o.message ?? "Failed to load orders";
        if (msg.toLowerCase().includes("no orders")) {
          setOrders([]);
        } else {
          setError(msg);
          if (initial) setLoading(false);
          return;
        }
      } else {
        setOrders(o.data ?? []);
      }

      if (!c.success) {
        setError(c.message ?? "Failed to load customers");
        if (initial) setLoading(false);
        return;
      } else {
        setError(null);
        setCustomers(c.data ?? []);
      }

      if (initial) setLoading(false);
    }

    void load(true);
    const interval = setInterval(() => void load(false), 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const greetingName = useMemo(() => {
    const raw = profileStore.profile.fullName?.trim();
    return raw && raw.length > 0 ? raw.split(" ")[0] : "Admin";
  }, [profileStore.profile.fullName]);

  // Build customer lookup map for real names in the table
  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c._id, c])),
    [customers]
  );

  const computed = useMemo(() => {
    const now = new Date();
    const startCurrent = new Date(now);
    startCurrent.setDate(startCurrent.getDate() - 29);
    startCurrent.setHours(0, 0, 0, 0);

    const startPrev = new Date(startCurrent);
    startPrev.setDate(startPrev.getDate() - 30);

    // Use $createdAt as fallback since orderDate is client-supplied and may differ
    const orderTime = (o: Order) => safeParseDate((o as any).$createdAt) ?? safeParseDate(o.orderDate);

    const currentOrders = orders.filter((o) => {
      const d = orderTime(o);
      return d && d >= startCurrent;
    });
    const prevOrders = orders.filter((o) => {
      const d = orderTime(o);
      return d && d >= startPrev && d < startCurrent;
    });

    const revenueCurrent = currentOrders.reduce((acc, o) => acc + (typeof o.totalAmount === "number" ? o.totalAmount : 0), 0);
    const revenuePrev    = prevOrders.reduce((acc, o) => acc + (typeof o.totalAmount === "number" ? o.totalAmount : 0), 0);
    const ordersCurrent  = currentOrders.length;
    const ordersPrev     = prevOrders.length;
    const aovCurrent     = ordersCurrent ? revenueCurrent / ordersCurrent : 0;
    const aovPrev        = ordersPrev ? revenuePrev / ordersPrev : 0;

    const activeCustomersCurrent = customers.filter((c) => {
      const d = safeParseDate(c.lastOrderDate ?? undefined);
      return d && d >= startCurrent;
    }).length;
    const activeCustomersPrev = customers.filter((c) => {
      const d = safeParseDate(c.lastOrderDate ?? undefined);
      return d && d >= startPrev && d < startCurrent;
    }).length;

    const change = (cur: number, prev: number) => {
      if (prev <= 0) return cur > 0 ? 1 : 0;
      return (cur - prev) / prev;
    };

    const revChange  = change(revenueCurrent, revenuePrev);
    const ordChange  = change(ordersCurrent, ordersPrev);
    const custChange = change(activeCustomersCurrent, activeCustomersPrev);
    const aovChange  = change(aovCurrent, aovPrev);

    // Revenue/orders time series
    const days = 30;
    const buckets = new Map<string, { date: string; revenue: number; orders: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(startCurrent);
      d.setDate(startCurrent.getDate() + i);
      const key = toDateOnly(d);
      buckets.set(key, { date: key, revenue: 0, orders: 0 });
    }
    for (const o of currentOrders) {
      const d = orderTime(o);
      if (!d) continue;
      const key = toDateOnly(d);
      const b = buckets.get(key);
      if (!b) continue;
      b.orders  += 1;
      b.revenue += typeof o.totalAmount === "number" ? o.totalAmount : 0;
    }
    const series = [...buckets.values()];

    // Top products with real units sold/revenue from order data
    const productMap = new Map<string, ProductAgg>();
    for (const o of currentOrders) {
      for (const it of o.cartItems ?? []) {
        const name  = (it.title ?? "Unknown").trim() || "Unknown";
        const qty   = typeof it.quantity === "number" ? it.quantity : 0;
        const price = typeof it.price === "string" ? Number(it.price) : 0;
        const rev   = qty * (Number.isFinite(price) ? price : 0);
        const prev  = productMap.get(name) ?? { name, units: 0, revenue: 0 };
        prev.units  += qty;
        prev.revenue += rev;
        productMap.set(name, prev);
      }
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const recentOrders = orders
      .slice()
      .sort((a, b) => {
        const ad = a.orderDate ? new Date(a.orderDate).getTime() : 0;
        const bd = b.orderDate ? new Date(b.orderDate).getTime() : 0;
        return bd - ad;
      })
      .slice(0, 12);

    return {
      revenueCurrent, ordersCurrent, activeCustomersCurrent, aovCurrent,
      revChange, ordChange, custChange, aovChange,
      series, topProducts, recentOrders,
    };
  }, [customers, orders]);

  return (
    <div className="flex flex-col gap-6 animate-in-up">
      {/* Welcome banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">
            Good morning, {greetingName}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here is what is happening with your store today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => downloadCsv(orders, customers)}
            disabled={orders.length === 0}
          >
            <ArrowUpRightIcon className="h-3.5 w-3.5" />
            Export Report
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Total Revenue",    value: money(computed.revenueCurrent),             change: pct(computed.revChange),  icon: BarChartIcon,      accent: "text-chart-1" },
          { title: "Total Orders",     value: computed.ordersCurrent.toLocaleString(),    change: pct(computed.ordChange),  icon: ShoppingCartIcon,  accent: "text-chart-2" },
          { title: "Active Customers", value: computed.activeCustomersCurrent.toLocaleString(), change: pct(computed.custChange), icon: UsersIcon, accent: "text-chart-3" },
          { title: "Avg Order Value",  value: money(computed.aovCurrent),                change: pct(computed.aovChange),  icon: PackageIcon,       accent: "text-chart-4" },
        ].map(({ title, value, change, icon: Icon, accent }) => (
          <Card key={title} className="card-shine transition-all duration-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{title}</span>
                  <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={"flex items-center gap-0.5 text-xs font-semibold " + (change.startsWith("-") ? "text-destructive" : "text-success")}>
                      {change}
                    </span>
                    <span className="text-xs text-muted-foreground">vs last 30d</span>
                  </div>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Alerts & Insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LowStockAlert />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Revenue & Orders</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Daily comparison — last 30 days</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-1 inline-block" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-2 inline-block" /> Orders</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4 px-4">
            <ChartContainer className="h-[220px]" config={{ revenue: { label: "Revenue", color: "hsl(var(--chart-1))" }, orders: { label: "Orders", color: "hsl(var(--chart-2))" } }}>
              <ResponsiveContainer>
                <LineChart data={computed.series} margin={{ left: 8, right: 8, top: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 3" />
                  <XAxis dataKey="date" tickMargin={6} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis yAxisId="left" tickMargin={6} tickFormatter={(v) => `R${v}`} />
                  <YAxis yAxisId="right" orientation="right" tickMargin={6} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="var(--color-orders)" strokeWidth={2} dot={false} />
                  <ChartLegend content={<ChartLegendContent />} />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Order Volume</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Daily orders — last 30 days</p>
          </CardHeader>
          <CardContent>
            <ChartContainer className="h-[220px]" config={{ orders: { label: "Orders", color: "hsl(var(--chart-2))" } }}>
              <ResponsiveContainer>
                <BarChart data={computed.series} margin={{ left: 8, right: 8, top: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 3" />
                  <XAxis dataKey="date" tickMargin={6} tickFormatter={(v) => String(v).slice(5)} />
                  <YAxis tickMargin={6} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders + Top Products */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle>Recent Orders</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Latest {computed.recentOrders.length} transactions</p>
              </div>
              <div className="text-xs text-muted-foreground">{loading ? "Loading…" : ""}</div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>Order</TableHeadCell>
                  <TableHeadCell>Customer</TableHeadCell>
                  <TableHeadCell className="hidden md:table-cell">Product</TableHeadCell>
                  <TableHeadCell>Amount</TableHeadCell>
                  <TableHeadCell>Status</TableHeadCell>
                  <TableHeadCell className="hidden sm:table-cell">Date</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>Loading…</TableCell></TableRow>
                ) : computed.recentOrders.length === 0 ? (
                  <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={6}>No orders found</TableCell></TableRow>
                ) : (
                  computed.recentOrders.map((order) => {
                    const count      = order.cartItems?.reduce((acc, i) => acc + (i.quantity ?? 0), 0) ?? 0;
                    const firstTitle = order.cartItems?.[0]?.title ?? "";
                    const product    = firstTitle ? `${firstTitle}${count > 1 ? ` (+${count - 1})` : ""}` : `${count} item${count === 1 ? "" : "s"}`;
                    const amount     = typeof order.totalAmount === "number" ? money(order.totalAmount) : money(0);
                    const date       = safeParseDate(order.orderDate)?.toLocaleString() ?? "";
                    const status     = order.orderStatus ?? "pending";
                    // Use real customer name from customer list
                    const cust       = customerMap.get(order.userId ?? "");
                    const displayName = cust?.userName ?? `User ${(order.userId ?? "").slice(-6)}`;
                    const initials   = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

                    return (
                      <TableRow key={order._id}>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">#{order._id.slice(-8).toUpperCase()}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
                              {initials}
                            </div>
                            <span className="text-xs font-medium text-foreground">{displayName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="max-w-[140px] truncate text-xs text-muted-foreground block">{product}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-foreground">{amount}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(status)}>{status}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{date}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Top products — derived from real order data */}
        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">By revenue (last 30 days)</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : computed.topProducts.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center">
                <p className="text-sm font-medium text-foreground">No product data yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Once orders exist, top products will appear here.</p>
              </div>
            ) : (
              computed.topProducts.map((p, i) => {
                const max   = computed.topProducts[0]?.revenue || 1;
                const share = Math.max(6, Math.min(100, (p.revenue / max) * 100));
                return (
                  <div key={p.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-primary bg-primary/10">
                          {i + 1}
                        </span>
                        <span className="truncate text-xs font-medium text-foreground">{p.name}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-xs font-semibold text-foreground">{money(p.revenue)}</span>
                        <span className="text-[10px] text-muted-foreground">{p.units} sold</span>
                      </div>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${share}%`, transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
