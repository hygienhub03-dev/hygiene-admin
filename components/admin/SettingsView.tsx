"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { apiFetch } from "@/lib/api";
import { auditLog } from "./AuditLogCenter";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from "./ui";

type SettingsTab = "store" | "team" | "billing" | "integrations";

type StoreSettings = {
  storeName: string;
  supportEmail: string;
  currency: "ZAR" | "USD" | "EUR";
  timezone: string;
  orderPrefix: string;
};

type TeamRole   = "owner" | "admin" | "staff" | "viewer";
type TeamMember = { id: string; name: string; email: string; role: TeamRole; status: "active" | "invited"; invitedAt?: string };
type BillingSettings     = { plan: "starter" | "pro" | "enterprise"; billingEmail: string; autoRenew: boolean };
type IntegrationsSettings = { apiEnabled: boolean; webhookUrl: string; webhookSecret: string; allowTestEvents: boolean };

type SettingsState = {
  store: StoreSettings;
  team: { members: TeamMember[] };
  billing: BillingSettings;
  integrations: IntegrationsSettings;
};

const STORAGE_KEY = "admin.settings.v1";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function seed(): SettingsState {
  return {
    store: { storeName: "Hygiene Hub", supportEmail: "hygienhub@gmail.com", currency: "ZAR", timezone: "Africa/Johannesburg", orderPrefix: "HH" },
    team: {
      members: [
        { id: "mem_owner", name: "Hygiene Hub Admin", email: "hygienhub@gmail.com", role: "owner", status: "active" },
      ],
    },
    billing: { plan: "pro", billingEmail: "hygienhub@gmail.com", autoRenew: true },
    integrations: { apiEnabled: true, webhookUrl: "", webhookSecret: "", allowTestEvents: true },
  };
}

function loadInitial(): SettingsState {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return seed();
    return parsed as SettingsState;
  } catch { return seed(); }
}

function toggleInputClass(checked: boolean) {
  return checked
    ? "bg-primary/15 border-primary/25 text-primary"
    : "bg-input border-border text-muted-foreground";
}

export default function SettingsView() {
  const [tab, setTab]     = useState<SettingsTab>("store");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<SettingsState>(() => loadInitial());
  const [draft, setDraft] = useState<SettingsState>(() => loadInitial());

  useEffect(() => { setDraft(state); }, [state]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromServer() {
      const res = await apiFetch<{ data?: SettingsState | null }>("/api/admin/config/settings");
      if (!res.success || cancelled) return;
      if (res.data) {
        setState(res.data);
        setDraft(res.data);
      }
    }

    void hydrateFromServer();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state), [draft, state]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.store.storeName.trim()) e.storeName = "Store name is required";
    if (!draft.store.supportEmail.trim()) e.supportEmail = "Support email is required";
    else if (!isValidEmail(draft.store.supportEmail)) e.supportEmail = "Enter a valid email";
    if (!draft.billing.billingEmail.trim()) e.billingEmail = "Billing email is required";
    else if (!isValidEmail(draft.billing.billingEmail)) e.billingEmail = "Enter a valid email";
    if (draft.integrations.webhookUrl.trim().length > 0) {
      try {
        const u = new URL(draft.integrations.webhookUrl.trim());
        if (u.protocol !== "https:") e.webhookUrl = "Webhook URL must be https";
      } catch { e.webhookUrl = "Webhook URL must be a valid URL"; }
    }
    if (draft.integrations.apiEnabled && draft.integrations.webhookSecret.trim().length > 0 && draft.integrations.webhookSecret.trim().length < 12) {
      e.webhookSecret = "Webhook secret must be at least 12 characters";
    }
    return e;
  }, [draft]);

  const canSave = useMemo(() => dirty && Object.keys(errors).length === 0, [dirty, errors]);

  const persist = useCallback(async (next: SettingsState) => {
    const saveRes = await apiFetch("/api/admin/config/settings", {
      method: "PUT",
      body: { adminSettings: next },
    });
    if (!saveRes.success) return;

    setState(next);
    setSavedAt(new Date().toISOString());
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { return; }
    }
    // Emit to audit log
    auditLog({
      actor:   { name: "Admin", email: next.store.supportEmail },
      type:    "settings.update",
      summary: `Updated ${tab} settings`,
      outcome: "success",
    });
  }, [tab]);

  const onReset = useCallback(() => { setDraft(state); }, [state]);
  const onSave  = useCallback(() => { void persist(draft); }, [draft, persist]);

  const tabButton = (id: SettingsTab, label: string) => (
    <button type="button" onClick={() => setTab(id)}
      className={tab === id
        ? "px-3 py-2 text-xs font-semibold rounded-lg bg-background text-foreground border border-border"
        : "px-3 py-2 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground"}>
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">Configure store preferences, team access, billing, and integrations.</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty ? <Badge variant="warning">Unsaved changes</Badge> : <Badge variant="muted">Up to date</Badge>}
          {savedAt && <span className="text-[11px] text-muted-foreground">Saved {new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      </div>

      {/* Persistence note */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-start gap-2">
        <span className="text-xs text-muted-foreground mt-0.5">ℹ️</span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Settings are persisted via <span className="font-mono">/api/admin/config/settings</span> with
          local fallback for resilience. All saves are recorded in the Audit Log.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        {tabButton("store", "Store")}
        {tabButton("team", "Team")}
        {tabButton("billing", "Billing")}
        {tabButton("integrations", "Integrations")}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onReset} disabled={!dirty}>Reset</Button>
          <Button variant="primary" size="sm" onClick={onSave} disabled={!canSave}>Save</Button>
        </div>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <p className="text-sm font-semibold text-foreground">Fix these issues before saving</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </div>
      )}

      {tab === "store" && (
        <Card>
          <CardHeader><CardTitle>Store</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input label="Store name" value={draft.store.storeName} onChange={(e) => setDraft((p) => ({ ...p, store: { ...p.store, storeName: e.target.value } }))} />
              {errors.storeName && <p className="mt-1 text-xs text-destructive">{errors.storeName}</p>}
            </div>
            <Input label="Support email" type="email" value={draft.store.supportEmail} onChange={(e) => setDraft((p) => ({ ...p, store: { ...p.store, supportEmail: e.target.value } }))} />
            {errors.supportEmail && <p className="-mt-2 text-xs text-destructive md:col-span-1">{errors.supportEmail}</p>}
            <Select label="Currency" value={draft.store.currency}
              onChange={(e) => setDraft((p) => ({ ...p, store: { ...p.store, currency: e.target.value as StoreSettings["currency"] } }))}
              options={[{ value: "ZAR", label: "ZAR — South African Rand" }, { value: "USD", label: "USD — US Dollar" }, { value: "EUR", label: "EUR — Euro" }]}
            />
            <Input label="Timezone" value={draft.store.timezone} onChange={(e) => setDraft((p) => ({ ...p, store: { ...p.store, timezone: e.target.value } }))} />
            <Input label="Order prefix" value={draft.store.orderPrefix} onChange={(e) => setDraft((p) => ({ ...p, store: { ...p.store, orderPrefix: e.target.value } }))} placeholder="e.g. HH" />
            <div className="md:col-span-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Preview</p>
              <p className="mt-1 text-xs text-muted-foreground">New orders will be labeled like <span className="font-mono text-foreground">{draft.store.orderPrefix || "—"}-10231</span></p>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "team" && <TeamSettings draft={draft} setDraft={setDraft} />}

      {tab === "billing" && (
        <Card>
          <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Plan" value={draft.billing.plan}
              onChange={(e) => setDraft((p) => ({ ...p, billing: { ...p.billing, plan: e.target.value as BillingSettings["plan"] } }))}
              options={[{ value: "starter", label: "Starter" }, { value: "pro", label: "Pro" }, { value: "enterprise", label: "Enterprise" }]}
            />
            <Input label="Billing email" type="email" value={draft.billing.billingEmail} onChange={(e) => setDraft((p) => ({ ...p, billing: { ...p.billing, billingEmail: e.target.value } }))} />
            {errors.billingEmail && <p className="-mt-2 text-xs text-destructive md:col-span-1">{errors.billingEmail}</p>}
            <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Auto-renew</p>
                <p className="mt-1 text-xs text-muted-foreground">Renew subscription automatically.</p>
              </div>
              <button type="button" onClick={() => setDraft((p) => ({ ...p, billing: { ...p.billing, autoRenew: !p.billing.autoRenew } }))}
                className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${toggleInputClass(draft.billing.autoRenew)}`}>
                {draft.billing.autoRenew ? "On" : "Off"}
              </button>
            </div>
            <div className="md:col-span-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Invoices</p>
              <p className="mt-1 text-xs text-muted-foreground">Connect a billing provider to fetch real invoices.</p>
              <div className="mt-3 space-y-2">
                {[
                  { id: "inv_1001", date: "2026-02-01", amount: "R499.00", status: "Paid" },
                  { id: "inv_0991", date: "2026-01-01", amount: "R499.00", status: "Paid" },
                ].map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border bg-input px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{inv.id}</p>
                      <p className="text-[11px] text-muted-foreground">{inv.date}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">{inv.status}</Badge>
                      <span className="text-xs font-semibold text-foreground">{inv.amount}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "integrations" && (
        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">API access</p>
                <p className="mt-1 text-xs text-muted-foreground">Enable admin API features for integrations.</p>
              </div>
              <button type="button" onClick={() => setDraft((p) => ({ ...p, integrations: { ...p.integrations, apiEnabled: !p.integrations.apiEnabled } }))}
                className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${toggleInputClass(draft.integrations.apiEnabled)}`}>
                {draft.integrations.apiEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Webhook URL (https)" value={draft.integrations.webhookUrl} onChange={(e) => setDraft((p) => ({ ...p, integrations: { ...p.integrations, webhookUrl: e.target.value } }))} placeholder="https://example.com/webhooks" />
              {errors.webhookUrl && <p className="-mt-2 text-xs text-destructive md:col-span-1">{errors.webhookUrl}</p>}
              <Input label="Webhook secret" value={draft.integrations.webhookSecret} onChange={(e) => setDraft((p) => ({ ...p, integrations: { ...p.integrations, webhookSecret: e.target.value } }))} placeholder="Leave blank to disable signature verification" />
              {errors.webhookSecret && <p className="-mt-2 text-xs text-destructive md:col-span-1">{errors.webhookSecret}</p>}
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Allow test events</p>
                <p className="mt-1 text-xs text-muted-foreground">Deliver test webhooks for staging workflows.</p>
              </div>
              <button type="button" onClick={() => setDraft((p) => ({ ...p, integrations: { ...p.integrations, allowTestEvents: !p.integrations.allowTestEvents } }))}
                className={`h-8 rounded-md border px-3 text-xs font-semibold transition-colors ${toggleInputClass(draft.integrations.allowTestEvents)}`}>
                {draft.integrations.allowTestEvents ? "On" : "Off"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TeamSettings({ draft, setDraft }: { draft: SettingsState; setDraft: Dispatch<SetStateAction<SettingsState>> }) {
  const [inviteName, setInviteName]   = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<TeamRole>("staff");
  const [error, setError]             = useState<string | null>(null);

  const members = draft.team.members;

  const onInvite = () => {
    setError(null);
    const name  = inviteName.trim();
    const email = inviteEmail.trim().toLowerCase();
    if (!name) return setError("Name is required");
    if (!email) return setError("Email is required");
    if (!isValidEmail(email)) return setError("Enter a valid email");
    if (members.some((m) => m.email.toLowerCase() === email)) return setError("That email is already in the team");

    const newMember: TeamMember = { id: `mem_${Math.random().toString(16).slice(2)}`, name, email, role: inviteRole, status: "invited", invitedAt: new Date().toISOString() };
    setDraft((p) => ({ ...p, team: { members: [newMember, ...p.team.members] } }));
    setInviteName(""); setInviteEmail(""); setInviteRole("staff");

    auditLog({ actor: { name: "Admin", email: "admin" }, type: "settings.update", summary: `Invited ${name} (${email}) as ${inviteRole}`, outcome: "success" });
  };

  const updateRole = (id: string, role: TeamRole) => {
    setDraft((p) => ({ ...p, team: { members: p.team.members.map((m) => (m.id === id ? { ...m, role } : m)) } }));
  };

  const removeMember = (id: string) => {
    const member = members.find((m) => m.id === id);
    setDraft((p) => ({ ...p, team: { members: p.team.members.filter((m) => m.id !== id) } }));
    if (member) auditLog({ actor: { name: "Admin", email: "admin" }, type: "settings.update", summary: `Removed team member ${member.name}`, outcome: "success" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Invite member</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {error && <div className="md:col-span-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3"><p className="text-xs text-muted-foreground">{error}</p></div>}
          <Input label="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
          <Input label="Email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <Select label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as TeamRole)}
            options={[{ value: "owner", label: "Owner" }, { value: "admin", label: "Admin" }, { value: "staff", label: "Staff" }, { value: "viewer", label: "Viewer" }]} />
          <div className="md:col-span-3 flex items-center justify-end">
            <Button variant="primary" size="sm" onClick={onInvite}>Send invite</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Team members</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {members.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm font-medium text-foreground">No members</p>
              <p className="mt-1 text-xs text-muted-foreground">Invite your first team member.</p>
            </div>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-border bg-input p-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={m.status === "active" ? "success" : "warning"}>{m.status === "active" ? "Active" : "Invited"}</Badge>
                    <Badge variant="muted">{m.role}</Badge>
                    {m.invitedAt && <span className="text-[11px] text-muted-foreground">Invited {new Date(m.invitedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={m.role} onChange={(e) => updateRole(m.id, e.target.value as TeamRole)}
                    options={[{ value: "owner", label: "Owner" }, { value: "admin", label: "Admin" }, { value: "staff", label: "Staff" }, { value: "viewer", label: "Viewer" }]} />
                  <Button variant="destructive" size="sm" onClick={() => removeMember(m.id)} disabled={m.role === "owner"}>Remove</Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
