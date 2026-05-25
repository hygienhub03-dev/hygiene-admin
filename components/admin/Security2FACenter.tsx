"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Check2FAIcon,
  ShieldIcon,
} from "./ui";

type TwoFAState = {
  enabled: boolean;
  enabledAt?: string;
  method: "authenticator";
  recoveryCodes: string[];
};

type SetupData = {
  secret: string;
  uri: string;
};

type Store = {
  state: TwoFAState;
  loading: boolean;
  setupData: SetupData | null;
  refresh: () => Promise<void>;
  startSetup: (password: string) => Promise<{ success: boolean; message?: string }>;
  verifySetup: (otp: string) => Promise<{ success: boolean; message?: string }>;
  disable: () => Promise<{ success: boolean; message?: string }>;
  regenerateRecoveryCodes: () => Promise<{ success: boolean; message?: string }>;
};

function emptyState(): TwoFAState {
  return {
    enabled: false,
    enabledAt: undefined,
    method: "authenticator",
    recoveryCodes: [],
  };
}

export function useSecurity2FAStore(): Store {
  const [state, setState] = useState<TwoFAState>(emptyState());
  const [loading, setLoading] = useState(false);
  const [setupData, setSetupData] = useState<SetupData | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ data?: Partial<TwoFAState> }>("/api/auth/mfa/status");
    if (res.success && res.data) {
      setState({
        enabled: Boolean(res.data.enabled),
        enabledAt: res.data.enabledAt,
        method: "authenticator",
        recoveryCodes: Array.isArray(res.data.recoveryCodes) ? res.data.recoveryCodes : [],
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startSetup = useCallback(async (password: string) => {
    setLoading(true);
    const res = await apiFetch<{ data?: SetupData }>("/api/auth/mfa/setup/start", {
      method: "POST",
      body: { password },
    });
    setLoading(false);

    if (!res.success) {
      return { success: false, message: res.message ?? "Failed to start setup" };
    }

    if (!res.data?.secret || !res.data?.uri) {
      return { success: false, message: "Setup payload is incomplete" };
    }

    setSetupData(res.data);
    return { success: true };
  }, []);

  const verifySetup = useCallback(async (otp: string) => {
    setLoading(true);
    const res = await apiFetch<{ data?: { recoveryCodes?: string[] } }>("/api/auth/mfa/setup/verify", {
      method: "POST",
      body: { otp },
    });
    setLoading(false);

    if (!res.success) {
      return { success: false, message: res.message ?? "Failed to verify setup" };
    }

    setSetupData(null);
    await refresh();
    return { success: true };
  }, [refresh]);

  const disable = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/auth/mfa/disable", { method: "POST" });
    setLoading(false);

    if (!res.success) {
      return { success: false, message: res.message ?? "Failed to disable 2FA" };
    }

    setSetupData(null);
    await refresh();
    return { success: true };
  }, [refresh]);

  const regenerateRecoveryCodes = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<{ data?: { recoveryCodes?: string[] } }>("/api/auth/mfa/recovery-codes/regenerate", {
      method: "POST",
    });
    setLoading(false);

    if (!res.success) {
      return { success: false, message: res.message ?? "Failed to regenerate recovery codes" };
    }

    if (Array.isArray(res.data?.recoveryCodes)) {
      setState((prev) => ({ ...prev, recoveryCodes: res.data?.recoveryCodes || [] }));
    }
    return { success: true };
  }, []);

  return { state, loading, setupData, refresh, startSetup, verifySetup, disable, regenerateRecoveryCodes };
}

function formatEnabledAt(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Security2FACenter({
  open,
  onClose,
  store,
}: {
  open: boolean;
  onClose: () => void;
  store: Store;
}) {
  const { state, loading, setupData, startSetup, verifySetup, disable, regenerateRecoveryCodes } = store;

  const [mode, setMode] = useState<"overview" | "enable">("overview");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("overview");
    setPassword("");
    setVerifyCode("");
    setError(null);
    setSuccess(null);
  }, [open]);

  const canVerify = useMemo(() => !!setupData && verifyCode.trim().length >= 6, [setupData, verifyCode]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20">
              <ShieldIcon className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>Security and 2FA</DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Protect your admin account with two-factor authentication.
              </p>
            </div>
          </div>
          <Badge variant={state.enabled ? "success" : "warning"}>
            {state.enabled ? "2FA enabled" : "2FA disabled"}
          </Badge>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        {mode === "overview" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {state.enabled ? "Two-factor authentication is on" : "Two-factor authentication is off"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Method: <span className="font-medium text-foreground">{state.method}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enabled: <span className="font-medium text-foreground">{formatEnabledAt(state.enabledAt)}</span>
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    {state.enabled ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          setError(null);
                          setSuccess(null);
                          const result = await disable();
                          if (!result.success) setError(result.message || "Failed to disable 2FA");
                          if (result.success) setSuccess("2FA disabled");
                        }}
                        disabled={loading}
                      >
                        Disable 2FA
                      </Button>
                    ) : (
                      <Button variant="primary" size="sm" onClick={() => setMode("enable")}>
                        Enable 2FA
                      </Button>
                    )}
                  </div>
                </div>

                <div className="sm:hidden flex items-center gap-2">
                  {state.enabled ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        setError(null);
                        setSuccess(null);
                        const result = await disable();
                        if (!result.success) setError(result.message || "Failed to disable 2FA");
                        if (result.success) setSuccess("2FA disabled");
                      }}
                      disabled={loading}
                    >
                      Disable 2FA
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" onClick={() => setMode("enable")}>
                      Enable 2FA
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recovery codes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Store these recovery codes securely. Each code can be used once.
                </p>

                {state.enabled && state.recoveryCodes.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {state.recoveryCodes.map((c) => (
                      <div
                        key={c}
                        className="rounded-md border border-border bg-input px-2.5 py-2 text-[11px] font-mono text-foreground text-center"
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-medium text-foreground">No recovery codes</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enable 2FA to generate recovery codes.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!state.enabled || loading}
                    onClick={async () => {
                      setError(null);
                      setSuccess(null);
                      const result = await regenerateRecoveryCodes();
                      if (!result.success) setError(result.message || "Failed to regenerate codes");
                      if (result.success) setSuccess("Recovery codes regenerated");
                    }}
                  >
                    Regenerate codes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Enable 2FA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-emerald-600">{success}</p>}

              <Input
                label="Current password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />

              <Button
                variant="outline"
                size="sm"
                disabled={loading || password.trim().length < 8}
                onClick={async () => {
                  setError(null);
                  setSuccess(null);
                  const result = await startSetup(password);
                  if (!result.success) {
                    setError(result.message || "Could not start setup");
                    return;
                  }
                  setSuccess("Authenticator setup generated. Add it to your app, then verify.");
                }}
              >
                Generate authenticator setup
              </Button>

              {setupData && (
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Authenticator details</p>
                  <p className="text-xs text-muted-foreground break-all">
                    Secret: <span className="font-mono text-foreground">{setupData.secret}</span>
                  </p>
                  <p className="text-xs text-muted-foreground break-all">
                    URI: <span className="font-mono text-foreground">{setupData.uri}</span>
                  </p>
                </div>
              )}

              <Input
                label="Verification code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Enter authenticator code"
              />

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMode("overview");
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canVerify || loading}
                  onClick={async () => {
                    setError(null);
                    setSuccess(null);
                    const result = await verifySetup(verifyCode);
                    if (!result.success) {
                      setError(result.message || "Could not verify setup");
                      return;
                    }
                    setSuccess("2FA enabled successfully");
                    setMode("overview");
                    setPassword("");
                    setVerifyCode("");
                  }}
                >
                  <Check2FAIcon className="h-4 w-4" />
                  Verify and enable
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {error && mode === "overview" && <p className="text-sm text-destructive">{error}</p>}
        {success && mode === "overview" && <p className="text-sm text-emerald-600">{success}</p>}
      </DialogBody>

      <DialogFooter>
        <Button variant="primary" size="sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
