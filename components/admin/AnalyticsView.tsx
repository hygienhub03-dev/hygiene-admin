"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  BarChartIcon,
  ShoppingCartIcon,
  UsersIcon,
  PackageIcon,
} from "./ui";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type RangeKey = "7d" | "30d" | "90d";

type Order = {
  _id: string;
  orderDate?: string;
  orderStatus?: string;
  paymentStatus?: string;
  totalAmount?: number;
  userId?: string;
  cartItems?: Array<{ productId?: string; title?: string; quantity?: number; price?: string }>;
};

type Product = {
  _id: string;
  title?: string;
  category?: string;
  price?: number;
  totalStock?: number;
  unitsSold?: number;
  revenue?: number;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function money(n: number) {
  return `R${n.toFixed(2)}`;
}

function pct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`;
}

function shortMoney(n: number) {
  if (n >= 1000) return `R${(n / 1000).toFixed(1)}k`;
  return `R${n.toFixed(0)}`;
}

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  trend?: { value: number; label: string };
}) {
  return (
    <Card className="card-shine">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`${accent} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted mt-0.5`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold text-foreground truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
          {trend && (
            <div className={`text-xs font-medium mt-1 ${trend.value >= 0 ? "text-success" : "text-destructive"}`}>
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}% {trend.label}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="h-4 w-1 rounded-full bg-primary" />
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnalyticsView() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  async function loadAll() {
    setLoading(true);
    setError(null);

    const [o, p, c] = await Promise.all([
      apiFetch<{ data?: Order[] }>("/api/admin/orders/get"),
      apiFetch<{ data?: Product[] }>("/api/admin/products/get"),
      apiFetch<{ data?: Customer[] }>("/api/admin/customers/get"),
    ]);

    if (!o.success || !p.success || !c.success) {
      setError(
        (!o.success ? o.message : !p.success ? p.message : (c as any).message) ??
          "Failed to load analytics data"
      );
      setLoading(false);
      return;
    }

    setOrders((o as any).data ?? []);
    setProducts((p as any).data ?? []);
    setCustomers((c as any).data ?? []);
    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, []);

  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  const analytics = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (rangeDays - 1));
    start.setHours(0, 0, 0, 0);

    // Previous period for trend comparison
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - rangeDays);
    const prevEnd = new Date(start);

    // ── Daily buckets ──────────────────────────────────────────────────────
    const buckets = new Map<string, { date: string; revenue: number; orders: number; avgOrder: number }>();
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateOnly(d);
      buckets.set(key, { date: key, revenue: 0, orders: 0, avgOrder: 0 });
    }

    // ── Filter orders in range ─────────────────────────────────────────────
    const inRange = orders.filter((o) => {
      const d = parseDate(o.orderDate);
      return d && d >= start;
    });

    const inPrevRange = orders.filter((o) => {
      const d = parseDate(o.orderDate);
      return d && d >= prevStart && d < prevEnd;
    });

    // ── Product aggregation ────────────────────────────────────────────────
    const productRevMap = new Map<string, { name: string; units: number; revenue: number }>();
    const statusCount = new Map<string, number>();
    const hourCount = new Array(24).fill(0);
    const uniqueBuyers = new Set<string>();

    for (const o of inRange) {
      // Daily bucket
      const d = parseDate(o.orderDate);
      if (d) {
        const key = toDateOnly(d);
        const b = buckets.get(key);
        if (b) {
          b.orders += 1;
          b.revenue += typeof o.totalAmount === "number" ? o.totalAmount : 0;
        }
        hourCount[d.getHours()] += 1;
      }

      // Order status distribution
      const status = o.orderStatus ?? "unknown";
      statusCount.set(status, (statusCount.get(status) ?? 0) + 1);

      // Unique buyers
      if (o.userId) uniqueBuyers.add(o.userId);

      // Product revenue
      for (const it of o.cartItems ?? []) {
        const name = (it.title ?? "Unknown").trim() || "Unknown";
        const qty = typeof it.quantity === "number" ? it.quantity : 0;
        const price = typeof it.price === "string" ? Number(it.price) : 0;
        const rev = qty * (Number.isFinite(price) ? price : 0);
        const prev = productRevMap.get(name) ?? { name, units: 0, revenue: 0 };
        prev.units += qty;
        prev.revenue += rev;
        productRevMap.set(name, prev);
      }
    }

    // Finalise daily averages
    const series = [...buckets.values()].map((b) => ({
      ...b,
      date: b.date.slice(5), // MM-DD for display
      avgOrder: b.orders > 0 ? b.revenue / b.orders : 0,
    }));

    // ── KPIs ──────────────────────────────────────────────────────────────
    const totalRevenue = inRange.reduce((a, o) => a + (typeof o.totalAmount === "number" ? o.totalAmount : 0), 0);
    const prevRevenue  = inPrevRange.reduce((a, o) => a + (typeof o.totalAmount === "number" ? o.totalAmount : 0), 0);
    const revTrend     = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const totalOrders = inRange.length;
    const prevOrders  = inPrevRange.length;
    const orderTrend  = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;

    const aov     = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevAov = prevOrders > 0 ? inPrevRange.reduce((a, o) => a + (typeof o.totalAmount === "number" ? o.totalAmount : 0), 0) / prevOrders : 0;
    const aovTrend = prevAov > 0 ? ((aov - prevAov) / prevAov) * 100 : 0;

    const paid     = inRange.filter((o) => (o.paymentStatus ?? "").toLowerCase() === "paid");
    const paidRate = inRange.length ? paid.length / inRange.length : 0;

    // ── Customer metrics ──────────────────────────────────────────────────
    const totalCustomers   = customers.length;
    const returning        = customers.filter((c) => (c.orderCount ?? 0) >= 2).length;
    const returningRate    = totalCustomers ? returning / totalCustomers : 0;
    const vipCustomers     = customers.filter((c) => (c.totalSpent ?? 0) >= 500).length;
    const newCustomers     = customers.filter((c) => (c.orderCount ?? 0) === 0).length;
    const avgSpendPerCustomer = totalCustomers
      ? customers.reduce((a, c) => a + (c.totalSpent ?? 0), 0) / totalCustomers
      : 0;

    // Top spenders
    const topCustomers = [...customers]
      .sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0))
      .slice(0, 5);

    // ── Product metrics ───────────────────────────────────────────────────
    const topProducts = [...productRevMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const lowStock    = products.filter((p) => (p.totalStock ?? 0) > 0 && (p.totalStock ?? 0) < 10).length;
    const outOfStock  = products.filter((p) => (p.totalStock ?? 0) === 0).length;
    const totalStock  = products.reduce((a, p) => a + (p.totalStock ?? 0), 0);

    // Category revenue breakdown
    const categoryRevMap = new Map<string, number>();
    for (const p of products) {
      const cat = p.category?.trim() || "Uncategorized";
      const rev = typeof p.revenue === "number" ? p.revenue : 0;
      categoryRevMap.set(cat, (categoryRevMap.get(cat) ?? 0) + rev);
    }
    const categoryData = [...categoryRevMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // ── Order status distribution ─────────────────────────────────────────
    const statusData = [...statusCount.entries()].map(([name, value]) => ({ name, value }));

    // ── Peak hours ────────────────────────────────────────────────────────
    const hourData = hourCount.map((count, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      orders: count,
    }));

    // ── Cumulative revenue ────────────────────────────────────────────────
    let cumulative = 0;
    const cumulativeSeries = series.map((s) => {
      cumulative += s.revenue;
      return { ...s, cumulative };
    });

    return {
      series,
      cumulativeSeries,
      totalRevenue,
      revTrend,
      totalOrders,
      orderTrend,
      aov,
      aovTrend,
      paidRate,
      returningRate,
      vipCustomers,
      newCustomers,
      totalCustomers,
      avgSpendPerCustomer,
      topCustomers,
      lowStock,
      outOfStock,
      totalStock,
      topProducts,
      categoryData,
      statusData,
      hourData,
      uniqueBuyers: uniqueBuyers.size,
    };
  }, [customers, orders, products, rangeDays]);

  return (
    <div className="flex flex-col gap-6 animate-in-up">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revenue, orders, customers, and product performance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-input p-1">
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={
                  range === r
                    ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-background text-foreground shadow-sm"
                    : "px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground"
                }
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
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

      {/* ── KPI Row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Revenue" value={money(analytics.totalRevenue)} icon={BarChartIcon} accent="text-chart-1"
          trend={{ value: analytics.revTrend, label: "vs prev period" }} />
        <StatCard label="Orders" value={analytics.totalOrders} icon={ShoppingCartIcon} accent="text-chart-2"
          sub={`${analytics.uniqueBuyers} unique buyers`}
          trend={{ value: analytics.orderTrend, label: "vs prev period" }} />
        <StatCard label="Avg Order Value" value={money(analytics.aov)} icon={PackageIcon} accent="text-chart-3"
          trend={{ value: analytics.aovTrend, label: "vs prev period" }} />
        <StatCard label="Paid Rate" value={pct(analytics.paidRate)} icon={UsersIcon} accent="text-chart-4"
          sub={`${analytics.totalCustomers} customers total`} />
      </div>

      {/* ── Revenue Trend + Cumulative ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <SectionHeader title="Revenue & Orders" sub={`Daily breakdown · last ${rangeDays} days`} />
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              className="h-[260px]"
              config={{
                revenue: { label: "Revenue (R)", color: "hsl(var(--chart-1))" },
                orders:  { label: "Orders",      color: "hsl(var(--chart-2))" },
              }}
            >
              <ResponsiveContainer>
                <AreaChart data={analytics.series} margin={{ left: 8, right: 8, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 3" />
                  <XAxis dataKey="date" tickMargin={6} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left"  tickMargin={6} tickFormatter={shortMoney} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tickMargin={6} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area  yAxisId="left"  type="monotone" dataKey="revenue" stroke="var(--color-revenue)" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                  <Line  yAxisId="right" type="monotone" dataKey="orders"  stroke="var(--color-orders)"  strokeWidth={2} dot={false} />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader title="Cumulative Revenue" sub="Running total for period" />
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              className="h-[260px]"
              config={{ cumulative: { label: "Cumulative (R)", color: "hsl(var(--chart-3))" } }}
            >
              <ResponsiveContainer>
                <AreaChart data={analytics.cumulativeSeries} margin={{ left: 8, right: 8, top: 6, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 3" />
                  <XAxis dataKey="date" tickMargin={6} tick={{ fontSize: 11 }} />
                  <YAxis tickMargin={6} tickFormatter={shortMoney} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => [money(Number(v)), "Revenue"]} />} />
                  <Area type="monotone" dataKey="cumulative" stroke="var(--color-cumulative)" fill="url(#cumGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Order Status + Peak Hours ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeader title="Order Status" sub="Distribution for period" />
          </CardHeader>
          <CardContent className="pt-0 flex items-center justify-center">
            {analytics.statusData.length === 0 ? (
              <p className="py-10 text-sm text-muted-foreground">No orders in this period</p>
            ) : (
              <ChartContainer className="h-[220px] w-full" config={{}}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={analytics.statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {analytics.statusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <SectionHeader title="Peak Order Hours" sub="When customers order most" />
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              className="h-[220px]"
              config={{ orders: { label: "Orders", color: "hsl(var(--chart-4))" } }}
            >
              <ResponsiveContainer>
                <BarChart data={analytics.hourData} margin={{ left: 8, right: 8, top: 6, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 3" />
                  <XAxis dataKey="hour" tickMargin={4} tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tickMargin={6} allowDecimals={false} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="orders" fill="var(--color-orders)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Customer Health ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <SectionHeader title="Customer Health" sub="Segmentation overview" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Total Customers",    value: analytics.totalCustomers,                            good: true },
              { label: "Returning (2+ orders)", value: `${returning(analytics)} (${pct(analytics.returningRate)})`, good: analytics.returningRate >= 0.2 },
              { label: "VIP (≥ R500 spent)", value: analytics.vipCustomers,                             good: analytics.vipCustomers > 0 },
              { label: "New (0 orders)",     value: analytics.newCustomers,                              good: analytics.newCustomers < analytics.totalCustomers * 0.5 },
              { label: "Avg spend / customer", value: money(analytics.avgSpendPerCustomer),              good: analytics.avgSpendPerCustomer > 100 },
            ].map(({ label, value, good }) => (
              <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">{String(value)}</p>
                </div>
                <Badge variant={good ? "success" : "warning"}>{good ? "Good" : "Watch"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <SectionHeader title="Top Customers" sub="By total spend (all time)" />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>#</TableHeadCell>
                  <TableHeadCell>Customer</TableHeadCell>
                  <TableHeadCell>Orders</TableHeadCell>
                  <TableHeadCell className="text-right">Total Spent</TableHeadCell>
                  <TableHeadCell className="text-right">Segment</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {analytics.topCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell className="py-10 text-center text-muted-foreground col-span-5">No customers yet</TableCell>
                  </TableRow>
                ) : (
                  analytics.topCustomers.map((c, i) => (
                    <TableRow key={c._id}>
                      <TableCell>
                        <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                            {(c.userName?.[0] ?? "?").toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{c.userName ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{c.email ?? "—"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{c.orderCount ?? 0}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-semibold text-foreground">{money(c.totalSpent ?? 0)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={(c.totalSpent ?? 0) >= 500 ? "success" : (c.orderCount ?? 0) >= 2 ? "default" : "muted"}>
                          {(c.totalSpent ?? 0) >= 500 ? "VIP" : (c.orderCount ?? 0) >= 2 ? "Returning" : "New"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Product Performance ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <SectionHeader title="Top Products by Revenue" sub={`From orders in last ${rangeDays} days`} />
          </CardHeader>
          <CardContent className="pt-0">
            {analytics.topProducts.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No sales data in this period</p>
            ) : (
              <ChartContainer
                className="h-[260px]"
                config={{ revenue: { label: "Revenue (R)", color: "hsl(var(--chart-1))" } }}
              >
                <ResponsiveContainer>
                  <BarChart
                    data={analytics.topProducts}
                    layout="vertical"
                    margin={{ left: 16, right: 16, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="4 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={shortMoney} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} tickFormatter={(v) => v.length > 16 ? v.slice(0, 15) + "…" : v} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => [money(Number(v)), "Revenue"]} />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <SectionHeader title="Inventory Health" sub="Stock status" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "Total products",  value: products.length,          good: products.length > 0 },
                { label: "Total stock units", value: analytics.totalStock,   good: analytics.totalStock > 50 },
                { label: "Low stock (< 10)", value: analytics.lowStock,      good: analytics.lowStock === 0 },
                { label: "Out of stock",    value: analytics.outOfStock,      good: analytics.outOfStock === 0 },
              ].map(({ label, value, good }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
                  </div>
                  <Badge variant={good ? "success" : "destructive"}>{good ? "OK" : "Alert"}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionHeader title="Revenue by Category" sub="All-time product revenue" />
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Category</TableHeadCell>
                    <TableHeadCell className="text-right">Revenue</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analytics.categoryData.length === 0 ? (
                    <TableRow>
                      <TableCell className="py-6 text-center text-muted-foreground col-span-2">No data</TableCell>
                    </TableRow>
                  ) : (
                    analytics.categoryData.map((cat, i) => (
                      <TableRow key={cat.name}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span className="text-sm text-foreground">{cat.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-foreground">{money(cat.value)}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  );
}

// small helper to avoid inline ternary clutter
function returning(a: { returningRate: number; totalCustomers: number }) {
  return Math.round(a.returningRate * a.totalCustomers);
}
