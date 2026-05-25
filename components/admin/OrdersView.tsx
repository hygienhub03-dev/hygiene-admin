"use client";

import { useEffect, useMemo, useState } from "react";
import { localFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Pagination,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  SearchIcon,
  ShoppingCartIcon,
  ClockIcon,
  ArrowUpRightIcon,
} from "./ui";

type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "rejected"
  | "refunded"
  | string;

type PaymentStatus = "paid" | "unpaid" | "pending" | "failed" | string;

type Order = {
  id: string;
  userId?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string;
  totalAmount?: number;
  orderDate?: string;
  orderUpdateDate?: string;
  paymentId?: string;
  cartItems?: Array<{
    productId?: string;
    title?: string;
    image?: string;
    price?: string;
    quantity?: number;
  }>;
  addressInfo?: {
    address?: string;
    city?: string;
    pincode?: string;
    phone?: string;
    notes?: string;
  };
};

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "rejected",
  "refunded",
] as const;

const PAGE_SIZE = 10;

function formatDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function money(n?: number) {
  if (!Number.isFinite(n)) return "R0.00";
  return `R${Number(n).toFixed(2)}`;
}

function statusBadge(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (s === "delivered") return <Badge variant="success">Delivered</Badge>;
  if (s === "confirmed" || s === "processing") return <Badge variant="default">{status}</Badge>;
  if (s === "pending") return <Badge variant="warning">Pending</Badge>;
  if (s === "cancelled" || s === "rejected") return <Badge variant="destructive">{status}</Badge>;
  if (s === "shipped") return <Badge variant="outline">Shipped</Badge>;
  if (!status) return <Badge variant="muted">—</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

function paymentBadge(status?: string) {
  const s = (status ?? "").toLowerCase();
  if (s === "paid") return <Badge variant="success">Paid</Badge>;
  if (s === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (s === "pending") return <Badge variant="warning">Pending</Badge>;
  if (!status) return <Badge variant="muted">—</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function normalizeOrder(o: any): Order {
  return {
    id: o._id ?? o.id,
    userId: o.userId,
    orderStatus: o.orderStatus,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    totalAmount: typeof o.totalAmount === "number" ? o.totalAmount : 0,
    orderDate: o.orderDate,
    orderUpdateDate: o.orderUpdateDate,
    paymentId: o.paymentId,
    cartItems: Array.isArray(o.cartItems) ? o.cartItems : [],
    addressInfo: o.addressInfo,
  };
}

function downloadCsv(orders: Order[]) {
  const headers = ["OrderID", "Status", "Payment", "Total (R)", "Date", "UserId", "PaymentID"];
  const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
  const rows = orders.map((o) => [
    o.id,
    o.orderStatus ?? "",
    o.paymentStatus ?? "",
    Number(o.totalAmount ?? 0).toFixed(2),
    o.orderDate ? new Date(o.orderDate).toLocaleString() : "",
    o.userId ?? "",
    o.paymentId ?? "",
  ].map(escape).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Order Details Dialog ──────────────────────────────────────────────────────
function OrderDetailsDialog({
  orderId,
  open,
  onClose,
  onUpdated,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [order, setOrder]     = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("");
  const [saving, setSaving]   = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function load() {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    const res = await localFetch<{ data?: any }>(`/api/orders/${orderId}`);
    if (!res.success) {
      setError(res.message ?? "Failed to load order details");
      setLoading(false);
      return;
    }
    const normalized = normalizeOrder((res as any).data);
    setOrder(normalized);
    setNextStatus(normalized.orderStatus ?? "pending");
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    setSaveSuccess(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  async function saveStatus() {
    if (!orderId) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    const res = await localFetch<any>(`/api/orders/${orderId}`, {
      method: "PUT",
      body: { orderStatus: nextStatus },
    });
    if (!res.success) {
      setSaving(false);
      setError(res.message ?? "Failed to update order status");
      return;
    }
    setSaveSuccess(true);
    await load();
    onUpdated();
    setSaving(false);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  const itemsTotal = useMemo(() => {
    const items = order?.cartItems ?? [];
    return items.reduce((acc, it) => {
      const q = typeof it.quantity === "number" ? it.quantity : 0;
      const p = typeof it.price === "string" ? Number(it.price) : 0;
      return acc + q * (Number.isFinite(p) ? p : 0);
    }, 0);
  }, [order?.cartItems]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Order details</DialogTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          {orderId ? `#${orderId.slice(-10).toUpperCase()}` : ""}
        </p>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading || !order ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Loading…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</div>
                <div className="mt-2">{statusBadge(order.orderStatus)}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Payment</div>
                <div className="mt-2">{paymentBadge(order.paymentStatus)}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</div>
                <div className="mt-1 text-sm font-semibold text-foreground">{money(order.totalAmount)}</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Placed</div>
                <div className="mt-1 text-xs text-muted-foreground">{formatDate(order.orderDate)}</div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Customer</p>
              <p className="mt-1 text-xs text-muted-foreground">User ID: {order.userId ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Payment method: {order.paymentMethod ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Payment ID: {order.paymentId ?? "—"}</p>
            </div>

            {order.addressInfo?.address && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Shipping</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Address: {order.addressInfo.address}</div>
                  <div>City: {order.addressInfo.city ?? "—"}</div>
                  <div>Postal: {order.addressInfo.pincode ?? "—"}</div>
                  <div>Phone: {order.addressInfo.phone ?? "—"}</div>
                </div>
                {order.addressInfo.notes && (
                  <p className="mt-2 text-xs text-muted-foreground">Notes: {order.addressInfo.notes}</p>
                )}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeadCell>Item</TableHeadCell>
                      <TableHeadCell>Qty</TableHeadCell>
                      <TableHeadCell className="text-right">Price</TableHeadCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(order.cartItems ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell className="py-10 text-center text-muted-foreground col-span-3">No items</TableCell>
                      </TableRow>
                    ) : (
                      (order.cartItems ?? []).map((it, idx) => (
                        <TableRow key={`${it.productId ?? "item"}-${idx}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {it.image && (
                                <img src={it.image} alt={it.title} className="h-8 w-8 rounded-lg object-cover bg-muted flex-shrink-0" />
                              )}
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-foreground">{it.title ?? "—"}</span>
                                <span className="text-xs text-muted-foreground">{it.productId ?? ""}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium text-foreground">{it.quantity ?? 0}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-semibold text-foreground">
                              {it.price ? money(Number(it.price)) : "—"}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <span className="text-xs text-muted-foreground">Items subtotal</span>
                  <span className="text-sm font-semibold text-foreground">{money(itemsTotal)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Status update — now a dropdown */}
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Update status</p>
              <p className="mt-1 text-xs text-muted-foreground mb-3">
                Changes <span className="font-mono">orderStatus</span> immediately via the admin endpoint.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <Select
                    label="New status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    options={ORDER_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  disabled={saving || !nextStatus || nextStatus === order.orderStatus}
                  onClick={() => void saveStatus()}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
              {saveSuccess && (
                <p className="mt-2 text-xs text-success">Status updated successfully.</p>
              )}
            </div>
          </>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── OrdersView ────────────────────────────────────────────────────────────────
export default function OrdersView() {
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [page, setPage]             = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    const res = await localFetch<{ data?: any[] }>("/api/orders");
    if (!res.success) {
      setError(res.message ?? "Failed to load orders");
      setLoading(false);
      return;
    }
    const list = ((res as any).data ?? []).map(normalizeOrder).filter((o: Order) => Boolean(o.id));
    setOrders(list);
    setLoading(false);
  }

  useEffect(() => { void loadOrders(); }, []);

  const stats = useMemo(() => {
    const total     = orders.length;
    const pending   = orders.filter((o) => (o.orderStatus ?? "").toLowerCase() === "pending").length;
    const confirmed = orders.filter((o) => (o.orderStatus ?? "").toLowerCase() === "confirmed").length;
    const revenue   = orders.reduce((acc, o) => acc + (Number.isFinite(o.totalAmount) ? (o.totalAmount ?? 0) : 0), 0);
    return { total, pending, confirmed, revenue };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchSearch  = !q || o.id.toLowerCase().includes(q) || (o.userId ?? "").toLowerCase().includes(q) || (o.paymentId ?? "").toLowerCase().includes(q);
      const matchStatus  = !statusFilter || (o.orderStatus ?? "") === statusFilter;
      const matchPayment = !paymentFilter || (o.paymentStatus ?? "") === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [orders, paymentFilter, search, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => { if (o.orderStatus) set.add(o.orderStatus); });
    return [...set].sort();
  }, [orders]);

  const paymentOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => { if (o.paymentStatus) set.add(o.paymentStatus); });
    return [...set].sort();
  }, [orders]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 animate-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full order lifecycle management and fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="md"
            variant="outline"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
          >
            <ArrowUpRightIcon className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="md" variant="ghost" onClick={() => void loadOrders()} disabled={loading}>
            Refresh
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Orders", value: stats.total,          icon: ShoppingCartIcon, accent: "text-chart-1" },
          { label: "Pending",      value: stats.pending,        icon: ClockIcon,        accent: "text-warning-foreground" },
          { label: "Confirmed",    value: stats.confirmed,      icon: ShoppingCartIcon, accent: "text-success" },
          { label: "Revenue",      value: money(stats.revenue), icon: ShoppingCartIcon, accent: "text-chart-3" },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className="card-shine">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${accent} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search order ID, user ID, payment ID…"
              className="h-9 w-full rounded-md border border-border bg-input pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
            >
              <option value="">All statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
              className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors cursor-pointer"
            >
              <option value="">All payments</option>
              {paymentOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {(search || statusFilter || paymentFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setPaymentFilter(""); setPage(1); }}>
                Clear filters
              </Button>
            )}
          </div>
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Order</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Payment</TableHeadCell>
                <TableHeadCell>Total</TableHeadCell>
                <TableHeadCell className="hidden lg:table-cell">Placed</TableHeadCell>
                <TableHeadCell className="text-right">Action</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell className="py-12 text-center text-muted-foreground col-span-6">Loading orders…</TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell className="py-12 text-center text-muted-foreground col-span-6">No orders match your filters</TableCell>
                </TableRow>
              ) : (
                paged.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-foreground font-semibold">#{o.id.slice(-8).toUpperCase()}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">UID: {(o.userId ?? "—").slice(-8)}</span>
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(o.orderStatus)}</TableCell>
                    <TableCell>{paymentBadge(o.paymentStatus)}</TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold text-foreground">{money(o.totalAmount)}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{formatDate(o.orderDate)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => { setSelectedId(o.id); setDetailsOpen(true); }}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of <span className="font-medium text-foreground">{filtered.length}</span> orders
              </p>
              <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      <OrderDetailsDialog
        orderId={selectedId}
        open={detailsOpen}
        onClose={() => { setDetailsOpen(false); setSelectedId(null); }}
        onUpdated={() => void loadOrders()}
      />
    </div>
  );
}
