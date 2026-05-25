"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  BellIcon,
  ClockIcon,
  TrashIcon,
} from "./ui";

type NotificationSeverity = "info" | "success" | "warning" | "error";

export type AdminNotification = {
  id: string;
  severity: NotificationSeverity;
  title: string;
  description?: string;
  createdAt: string;
  readAt?: string;
};

type Store = {
  notifications: AdminNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
};

const STORAGE_KEY = "admin.notifications.v2";

function severityBadgeVariant(sev: NotificationSeverity): "muted" | "success" | "warning" | "destructive" {
  switch (sev) {
    case "success": return "success";
    case "warning": return "warning";
    case "error":   return "destructive";
    default:        return "muted";
  }
}

function formatTime(iso: string) {
  const date  = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins  = Math.floor(diffMs / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function loadPersisted(): AdminNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdminNotification[]) : [];
  } catch {
    return [];
  }
}

function savePersisted(items: AdminNotification[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /**/ }
}

/** Build notifications from real order + product data */
function buildFromData(
  orders: Array<{ _id?: string; orderStatus?: string; orderDate?: string; totalAmount?: number }>,
  products: Array<{ _id?: string; title?: string; totalStock?: number }>,
  existing: AdminNotification[]
): AdminNotification[] {
  const existingIds = new Set(existing.map((n) => n.id));
  const next: AdminNotification[] = [...existing];

  // New pending orders → warning notification
  const pendingOrders = orders.filter((o) => (o.orderStatus ?? "").toLowerCase() === "pending");
  const pendingNotifId = "system:pending-orders";
  if (pendingOrders.length > 0) {
    if (!existingIds.has(pendingNotifId)) {
      next.push({
        id: pendingNotifId,
        severity: "warning",
        title: `${pendingOrders.length} order${pendingOrders.length > 1 ? "s" : ""} awaiting confirmation`,
        description: "Go to Orders → filter by Pending to review.",
        createdAt: new Date().toISOString(),
      });
    }
  } else {
    // Remove if no pending orders anymore
    const idx = next.findIndex((n) => n.id === pendingNotifId);
    if (idx !== -1) next.splice(idx, 1);
  }

  // Out-of-stock products → error notification
  const oosProducts = products.filter((p) => (p.totalStock ?? 0) === 0);
  const oosNotifId  = "system:out-of-stock";
  if (oosProducts.length > 0) {
    if (!existingIds.has(oosNotifId)) {
      next.push({
        id: oosNotifId,
        severity: "error",
        title: `${oosProducts.length} product${oosProducts.length > 1 ? "s" : ""} out of stock`,
        description: oosProducts.slice(0, 3).map((p) => p.title ?? "Unknown").join(", ") + (oosProducts.length > 3 ? ` +${oosProducts.length - 3} more` : ""),
        createdAt: new Date().toISOString(),
      });
    }
  } else {
    const idx = next.findIndex((n) => n.id === oosNotifId);
    if (idx !== -1) next.splice(idx, 1);
  }

  // Low-stock products (stock > 0 but < 10)
  const lowStock = products.filter((p) => (p.totalStock ?? 0) > 0 && (p.totalStock ?? 0) < 10);
  const lowStockNotifId = "system:low-stock";
  if (lowStock.length > 0) {
    if (!existingIds.has(lowStockNotifId)) {
      next.push({
        id: lowStockNotifId,
        severity: "warning",
        title: `${lowStock.length} product${lowStock.length > 1 ? "s" : ""} running low on stock`,
        description: lowStock.slice(0, 3).map((p) => `${p.title ?? "Unknown"} (${p.totalStock} left)`).join(", "),
        createdAt: new Date().toISOString(),
      });
    }
  } else {
    const idx = next.findIndex((n) => n.id === lowStockNotifId);
    if (idx !== -1) next.splice(idx, 1);
  }

  // Welcome message (always seed once)
  const welcomeId = "system:welcome";
  if (!existingIds.has(welcomeId)) {
    next.push({
      id: welcomeId,
      severity: "info",
      title: "Welcome to your admin dashboard",
      description: "Notifications here reflect real-time store activity.",
      createdAt: new Date(Date.now() - 60000).toISOString(),
      readAt: new Date().toISOString(), // pre-read so it doesn't inflate unread count
    });
  }

  return next;
}

export function useNotificationsStore(): Store {
  const [notifications, setNotifications] = useState<AdminNotification[]>(() => loadPersisted());
  const seededRef = useRef(false);

  // Poll real data every 30s to keep notifications fresh
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const [ordersRes, productsRes] = await Promise.all([
          apiFetch<{ data?: any[] }>("/api/admin/orders/get"),
          apiFetch<{ data?: any[] }>("/api/admin/products/get"),
        ]);

        if (cancelled) return;

        const orders   = ordersRes.success   ? ((ordersRes   as any).data ?? []) : [];
        const products = productsRes.success ? ((productsRes as any).data ?? []) : [];

        setNotifications((prev) => {
          const updated = buildFromData(orders, products, prev);
          savePersisted(updated);
          return updated;
        });

        seededRef.current = true;
      } catch {
        // Non-blocking
      }
    }

    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!seededRef.current) savePersisted(notifications);
  }, [notifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.readAt).length, [notifications]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const next = prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n));
      savePersisted(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const ts = new Date().toISOString();
    setNotifications((prev) => {
      const next = prev.map((n) => (n.readAt ? n : { ...n, readAt: ts }));
      savePersisted(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => { const next = prev.filter((n) => n.id !== id); savePersisted(next); return next; });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]); savePersisted([]);
  }, []);

  return { notifications, unreadCount, markRead, markAllRead, remove, clearAll };
}

export default function NotificationsCenter({ open, onClose, store }: { open: boolean; onClose: () => void; store: Store }) {
  const { notifications, unreadCount, markRead, markAllRead, remove, clearAll } = store;
  const [tab, setTab]     = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");

  useEffect(() => { if (open) return; setQuery(""); setTab("all"); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notifications
      .filter((n) => (tab === "unread" ? !n.readAt : true))
      .filter((n) => { if (!q) return true; const hay = `${n.title} ${n.description ?? ""}`.toLowerCase(); return hay.includes(q); })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [notifications, query, tab]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20">
              <BellIcon className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>Notifications</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={markAllRead}>Mark all read</Button>
            <Button variant="destructive" size="sm" disabled={notifications.length === 0} onClick={clearAll}>Clear all</Button>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg border border-border bg-input p-1">
            {(["all", "unread"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} type="button"
                className={t === tab ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-background text-foreground" : "px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground"}>
                {t === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
          <div className="sm:max-w-xs w-full">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notifications…" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">No notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">{tab === "unread" ? "No unread notifications." : "Nothing to show."}</p>
          </div>
        ) : (
          <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {filtered.map((n) => {
                const read = Boolean(n.readAt);
                return (
                  <li key={n.id} className={read ? "p-4" : "p-4 bg-primary/[0.06]"}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={severityBadgeVariant(n.severity)}>{n.severity.toUpperCase()}</Badge>
                          {!read && <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />New</span>}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{n.title}</p>
                        {n.description && <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{n.description}</p>}
                        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <ClockIcon className="h-3.5 w-3.5" />
                          <span>{formatTime(n.createdAt)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={read} onClick={() => markRead(n.id)}>Mark read</Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(n.id)}><TrashIcon className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{notifications.length} total</p>
          <div className="flex items-center gap-2 sm:hidden">
            <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={markAllRead}>Mark all read</Button>
            <Button variant="destructive" size="sm" disabled={notifications.length === 0} onClick={clearAll}>Clear all</Button>
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
