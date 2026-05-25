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
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
  SearchIcon,
  UsersIcon,
} from "./ui";

type Customer = {
  id: string;
  userName: string;
  email: string;
  role: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
};

type Order = {
  _id: string;
  orderDate?: string;
  orderStatus?: string;
  totalAmount?: number;
  cartItems?: Array<{ title?: string; quantity?: number; price?: string }>;
};

const PAGE_SIZE = 10;

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString();
}

function money(n: number) {
  if (!Number.isFinite(n)) return "R0.00";
  return `R${n.toFixed(2)}`;
}

export default function CustomersView() {
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [selected, setSelected]       = useState<Customer | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orders, setOrders]           = useState<Order[]>([]);
  const [search, setSearch]           = useState("");
  const [page, setPage]               = useState(1);

  async function loadCustomers() {
    setLoading(true);
    setError(null);

    const res = await apiFetch<{
      data?: Array<{
        _id: string;
        userName?: string;
        email?: string;
        role?: string;
        orderCount?: number;
        totalSpent?: number;
        lastOrderDate?: string | null;
      }>;
    }>("/api/admin/customers/get");

    if (!res.success) {
      setError(res.message ?? "Failed to load customers");
      setLoading(false);
      return;
    }

    const list = (res.data ?? []).map((u) => ({
      id: u._id,
      userName: u.userName ?? "—",
      email: u.email ?? "—",
      role: u.role ?? "user",
      orderCount: typeof u.orderCount === "number" ? u.orderCount : 0,
      totalSpent: typeof u.totalSpent === "number" ? u.totalSpent : 0,
      lastOrderDate: u.lastOrderDate ?? null,
    }));

    setCustomers(list);
    setLoading(false);
  }

  async function loadOrders(customer: Customer) {
    setOrdersLoading(true);
    setOrdersError(null);
    setOrders([]);

    const res = await apiFetch<{ data?: Order[] }>(`/api/admin/customers/${customer.id}/orders`);

    if (!res.success) {
      setOrdersError(res.message ?? "Failed to load purchase history");
      setOrdersLoading(false);
      return;
    }

    setOrders(res.data ?? []);
    setOrdersLoading(false);
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  const segments = useMemo(() => {
    const vip       = customers.filter((c) => c.totalSpent >= 500).length;
    const returning = customers.filter((c) => c.orderCount >= 2).length;
    const newC      = customers.filter((c) => c.orderCount === 0).length;
    return { vip, returning, newC };
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.userName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q)
    );
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 animate-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Customers</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customer profiles, purchase history, and segmentation.
          </p>
        </div>
        <Button size="md" variant="ghost" onClick={() => void loadCustomers()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Segment stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Customers",    value: customers.length, accent: "text-chart-1" },
          { label: "VIP (spent ≥ R500)", value: segments.vip,     accent: "text-success" },
          { label: "Returning (2+ orders)", value: segments.returning, accent: "text-chart-3" },
        ].map(({ label, value, accent }) => (
          <Card key={label} className="card-shine">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${accent} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted`}>
                <UsersIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name or email…"
              aria-label="Search customers"
              className="h-9 w-full rounded-md border border-border bg-input pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setPage(1); }}>
              Clear
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Customer</TableHeadCell>
                <TableHeadCell className="hidden md:table-cell">Role</TableHeadCell>
                <TableHeadCell>Orders</TableHeadCell>
                <TableHeadCell className="hidden sm:table-cell">Total spent</TableHeadCell>
                <TableHeadCell className="hidden lg:table-cell">Last order</TableHeadCell>
                <TableHeadCell className="text-right">Action</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell className="py-12 text-center text-muted-foreground col-span-6">
                    Loading customers…
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell className="py-12 text-center text-muted-foreground col-span-6">
                    {customers.length === 0 ? "No customers found" : "No customers match your search"}
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                          {(c.userName[0] ?? "?").toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold text-foreground truncate">{c.userName}</span>
                          <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={c.role === "admin" ? "success" : "outline"}>{c.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-foreground">{c.orderCount}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm font-semibold text-foreground">{money(c.totalSpent)}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-muted-foreground">{formatDate(c.lastOrderDate)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelected(c);
                          void loadOrders(c);
                        }}
                      >
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
                of <span className="font-medium text-foreground">{filtered.length}</span> customers
              </p>
              <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer detail dialog */}
      <Dialog
        open={!!selected}
        onClose={() => { setSelected(null); setOrders([]); setOrdersError(null); }}
      >
        <DialogHeader onClose={() => { setSelected(null); setOrders([]); setOrdersError(null); }}>
          <DialogTitle>Customer Profile</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selected ? `${selected.userName} · ${selected.email}` : ""}
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {selected && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Role</div>
                <div className="mt-1">
                  <Badge variant={selected.role === "admin" ? "success" : "outline"}>{selected.role}</Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Segment</div>
                <div className="mt-1">
                  <Badge variant={selected.totalSpent >= 500 ? "success" : selected.orderCount >= 2 ? "default" : "muted"}>
                    {selected.totalSpent >= 500 ? "VIP" : selected.orderCount >= 2 ? "Returning" : selected.orderCount === 0 ? "New" : "Active"}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Orders</div>
                <div className="text-sm font-semibold text-foreground mt-1">{selected.orderCount}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total spent</div>
                <div className="text-sm font-semibold text-foreground mt-1">{money(selected.totalSpent)}</div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Purchase history</h3>
              {selected && (
                <Button size="sm" variant="ghost" disabled={ordersLoading} onClick={() => void loadOrders(selected)}>
                  Refresh
                </Button>
              )}
            </div>

            {ordersError && <p className="mt-2 text-xs text-destructive">{ordersError}</p>}

            <div className="mt-2 rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeadCell>Order</TableHeadCell>
                    <TableHeadCell>Status</TableHeadCell>
                    <TableHeadCell>Total</TableHeadCell>
                    <TableHeadCell className="hidden sm:table-cell">Date</TableHeadCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ordersLoading ? (
                    <TableRow>
                      <TableCell className="py-10 text-center text-muted-foreground col-span-4">Loading orders…</TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell className="py-10 text-center text-muted-foreground col-span-4">No orders yet</TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={o._id}>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">{o._id.slice(-10)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.orderStatus === "confirmed" || o.orderStatus === "delivered" ? "success" : o.orderStatus === "pending" ? "warning" : "outline"}>
                            {o.orderStatus ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-semibold text-foreground">
                            {money(typeof o.totalAmount === "number" ? o.totalAmount : 0)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground">{formatDate(o.orderDate)}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { setSelected(null); setOrders([]); setOrdersError(null); }}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
