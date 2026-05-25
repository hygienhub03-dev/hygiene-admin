"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  Badge, Button, Card, CardContent,
  Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle,
  Input, Pagination,
  ClockIcon, FilterIcon,
} from "./ui";

type AuditOutcome = "success" | "denied" | "error";

type AuditEventType =
  | "auth.login"
  | "auth.logout"
  | "product.create"
  | "product.update"
  | "product.delete"
  | "order.status_update"
  | "order.viewed"
  | "settings.update"
  | "customer.viewed"
  | "system.info";

export type AuditLogEntry = {
  id: string;
  createdAt: string;
  actor: { name: string; email: string };
  type: AuditEventType;
  summary: string;
  outcome: AuditOutcome;
  ip?: string;
  meta?: Record<string, string>;
};

type Store = {
  entries: AuditLogEntry[];
  total: number;
  log: (entry: Omit<AuditLogEntry, "id" | "createdAt">) => void;
  clearAll: () => void;
};

const STORAGE_KEY = "admin.audit_log.v2";
const MAX_ENTRIES = 200;

function outcomeBadgeVariant(outcome: AuditOutcome): "success" | "warning" | "destructive" {
  return outcome === "success" ? "success" : outcome === "denied" ? "warning" : "destructive";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function loadPersisted(): AuditLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditLogEntry[]) : [];
  } catch { return []; }
}

function savePersisted(entries: AuditLogEntry[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES))); } catch { /**/ }
}

function downloadCsv(rows: AuditLogEntry[]) {
  const header = ["createdAt", "actorName", "actorEmail", "type", "summary", "outcome", "ip"];
  const escape = (v: string) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = [
    header.join(","),
    ...rows.map((r) => [r.createdAt, r.actor.name, r.actor.email, r.type, r.summary, r.outcome, r.ip ?? ""].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function useAuditLogStore(): Store {
  const [entries, setEntries] = useState<AuditLogEntry[]>(() => loadPersisted());

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const res = await apiFetch<{ data?: AuditLogEntry[] }>("/api/admin/config/audit-logs");
      if (!res.success || cancelled) return;
      const list = Array.isArray(res.data) ? res.data : [];
      setEntries(list);
      savePersisted(list);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const log = useCallback((entry: Omit<AuditLogEntry, "id" | "createdAt">) => {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    void apiFetch("/api/admin/config/audit-logs", {
      method: "POST",
      body: { entry: newEntry },
    });
    setEntries((prev) => {
      const next = [newEntry, ...prev].slice(0, MAX_ENTRIES);
      savePersisted(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    void apiFetch("/api/admin/config/audit-logs", { method: "DELETE" });
    setEntries([]); savePersisted([]);
  }, []);

  return { entries, total: entries.length, log, clearAll };
}

// ─── Context so any component can call auditLog() ──────────────────────────
// We export a simple singleton approach via a module-level ref for cross-component use
let _logFn: ((entry: Omit<AuditLogEntry, "id" | "createdAt">) => void) | null = null;

export function setAuditLogFn(fn: (entry: Omit<AuditLogEntry, "id" | "createdAt">) => void) {
  _logFn = fn;
}

/** Call from anywhere to record an audit event */
export function auditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">) {
  _logFn?.(entry);
}

const PAGE_SIZE = 8;

export default function AuditLogCenter({ open, onClose, store }: { open: boolean; onClose: () => void; store: Store }) {
  const { entries, total, clearAll, log } = store;

  // Register the global log function
  useEffect(() => { setAuditLogFn(log); return () => { setAuditLogFn(() => {}); }; }, [log]);

  const [query, setQuery]     = useState("");
  const [outcome, setOutcome] = useState<"all" | AuditOutcome>("all");
  const [page, setPage]       = useState(1);

  useEffect(() => { if (open) return; setQuery(""); setOutcome("all"); setPage(1); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => (outcome === "all" ? true : e.outcome === outcome))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.actor.name} ${e.actor.email} ${e.type} ${e.summary} ${e.ip ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [entries, outcome, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages);
  const paged      = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => { if (pageSafe !== page) setPage(pageSafe); }, [pageSafe, page]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20">
              <ClockIcon className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>Audit Log</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Real admin action history — {total} events recorded</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={() => downloadCsv(filtered)}>Export CSV</Button>
            <Button variant="destructive" size="sm" disabled={total === 0} onClick={clearAll}>Clear</Button>
          </div>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:max-w-sm w-full">
            <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search actor, action, IP…" />
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <FilterIcon className="h-3.5 w-3.5" /> Outcome
            </span>
            <div className="inline-flex rounded-lg border border-border bg-input p-1">
              {(["all", "success", "denied", "error"] as const).map((o) => (
                <button key={o} type="button" onClick={() => { setOutcome(o); setPage(1); }}
                  className={outcome === o ? "px-3 py-1.5 text-xs font-semibold rounded-md bg-background text-foreground" : "px-3 py-1.5 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground"}>
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">No events</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {total === 0 ? "Admin actions (product edits, order updates, settings changes) will be recorded here automatically." : "No events match your filters."}
            </p>
          </div>
        ) : (
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {paged.map((e) => (
                  <div key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant={outcomeBadgeVariant(e.outcome)}>{e.outcome.toUpperCase()}</Badge>
                          <span className="text-xs font-medium text-muted-foreground truncate">{e.type}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">{e.summary}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="truncate">{e.actor.name} ({e.actor.email})</span>
                          <span>•</span>
                          <span>{formatTime(e.createdAt)}</span>
                          {e.ip && <><span>•</span><span className="font-mono">{e.ip}</span></>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-muted-foreground font-mono">{e.id.slice(-10)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {filtered.length > 0 && (
          <div className="pt-1">
            <Pagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <div className="flex w-full items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Showing {paged.length} of {filtered.length} (total {total})</p>
          <div className="flex items-center gap-2 sm:hidden">
            <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={() => downloadCsv(filtered)}>Export</Button>
            <Button variant="destructive" size="sm" disabled={total === 0} onClick={clearAll}>Clear</Button>
          </div>
          <Button variant="primary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
