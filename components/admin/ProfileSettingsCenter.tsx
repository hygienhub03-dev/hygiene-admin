"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { auditLog } from "./AuditLogCenter";
import {
  Button, Card, CardContent, CardHeader, CardTitle,
  Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle,
  Input, Badge,
} from "./ui";

type Profile = {
  fullName: string;
  email: string;
  title?: string;
  timezone?: string;
};

type Store = {
  profile: Profile;
  updateProfile: (next: Profile) => void;
};

const STORAGE_KEY = "admin.profile.v1";

function loadInitial(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Partial<Profile>;
    if (typeof p.fullName !== "string" || typeof p.email !== "string") return null;
    return {
      fullName: p.fullName,
      email: p.email,
      title: typeof p.title === "string" ? p.title : undefined,
      timezone: typeof p.timezone === "string" ? p.timezone : undefined,
    };
  } catch {
    return null;
  }
}

function seedIfEmpty(existing: Profile | null): Profile {
  if (existing) return existing;
  return {
    fullName: "Admin",
    email: "admin@hygienhub.co.za",
    title: "Super Admin",
    timezone: "Africa/Johannesburg",
  };
}

export function initialsFromName(name: string) {
  const parts = name.split(" ").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "AA";
  const first = parts[0]?.[0] ?? "A";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1] ?? "A";
  return `${first}${last}`.toUpperCase();
}

export function useProfileStore(): Store {
  const [profile, setProfile] = useState<Profile>(() => seedIfEmpty(loadInitial()));

  useEffect(() => {
    apiFetch<{ data?: { fullName?: string; email?: string; title?: string; timezone?: string } }>(
      "/api/admin/config/profile",
    )
      .then((res) => {
        if (!res.success) return;
        const data = res.data;
        if (!data) return;

        setProfile((prev) => {
          const next = {
            ...prev,
            fullName: data.fullName ?? prev.fullName,
            email: data.email ?? prev.email,
            title: data.title ?? prev.title,
            timezone: data.timezone ?? prev.timezone,
          };

          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
              return prev;
            }
          }

          return next;
        });
      })
      .catch(() => {
        return;
      });
  }, []);

  const updateProfile = useCallback((next: Profile) => {
    setProfile(next);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        return;
      }
    }
  }, []);

  return { profile, updateProfile };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function ProfileSettingsCenter({ open, onClose, store }: { open: boolean; onClose: () => void; store: Store }) {
  const { profile, updateProfile } = store;

  const [draft, setDraft] = useState<Profile>(profile);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setTouched(false);
    setSaveMsg(null);
  }, [open, profile]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!draft.fullName.trim()) e.fullName = "Full name is required";
    if (!draft.email.trim()) e.email = "Email is required";
    else if (!isValidEmail(draft.email)) e.email = "Enter a valid email";
    return e;
  }, [draft]);

  const canSave = useMemo(() => Object.keys(errors).length === 0 && touched && !saving, [errors, touched, saving]);

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    const res = await apiFetch<any>("/api/admin/config/profile", {
      method: "PUT",
      body: {
        fullName: draft.fullName.trim(),
        title: draft.title?.trim() || "",
        timezone: draft.timezone?.trim() || "",
      },
    }).catch(() => ({ success: false }));

    const next: Profile = {
      fullName: draft.fullName.trim(),
      email: draft.email.trim(),
      title: draft.title?.trim() || undefined,
      timezone: draft.timezone?.trim() || undefined,
    };

    updateProfile(next);

    auditLog({
      actor: { name: next.fullName, email: next.email },
      type: "settings.update",
      summary: "Updated admin profile settings",
      outcome: "success",
    });

    setSaveMsg({ ok: true, text: `Profile saved${res.success ? " and synced." : " locally (sync failed)."}` });
    setSaving(false);
    setTimeout(() => setSaveMsg(null), 4000);
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <DialogTitle>Profile settings</DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Update your admin display name and preferences.</p>
          </div>
          <Badge variant="outline">Admin profile</Badge>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Identity</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input label="Display name" id="fullName" value={draft.fullName} onChange={(e) => { setTouched(true); setDraft((p) => ({ ...p, fullName: e.target.value })); }} />
              {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>}
            </div>
            <div className="sm:col-span-2">
              <Input label="Email" id="email" type="email" value={draft.email} onChange={(e) => { setTouched(true); setDraft((p) => ({ ...p, email: e.target.value })); }} />
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
              <p className="mt-1 text-[10px] text-muted-foreground">Email changes require a dedicated email-update flow.</p>
            </div>
            <Input label="Title" id="title" value={draft.title ?? ""} onChange={(e) => { setTouched(true); setDraft((p) => ({ ...p, title: e.target.value })); }} placeholder="e.g. Store Manager" />
            <Input label="Timezone" id="timezone" value={draft.timezone ?? ""} onChange={(e) => { setTouched(true); setDraft((p) => ({ ...p, timezone: e.target.value })); }} placeholder="e.g. Africa/Johannesburg" />
          </CardContent>
        </Card>

        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Preview</p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold ring-1 ring-primary/30">
              {initialsFromName(draft.fullName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{draft.fullName || "-"}</p>
              <p className="text-xs text-muted-foreground truncate">{draft.title || "Admin"}</p>
            </div>
          </div>
        </div>

        {saveMsg && (
          <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${saveMsg.ok ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {saveMsg.text}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={() => { setDraft(profile); setTouched(false); }} disabled={!touched}>Reset</Button>
        <Button variant="primary" size="sm" disabled={!canSave} onClick={handleSave}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
