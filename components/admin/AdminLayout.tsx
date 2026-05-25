"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import NotificationsCenter, { useNotificationsStore } from "./NotificationsCenter";
import AuditLogCenter, { useAuditLogStore } from "./AuditLogCenter";
import ProfileSettingsCenter, { initialsFromName, useProfileStore } from "./ProfileSettingsCenter";
import Security2FACenter, { useSecurity2FAStore } from "./Security2FACenter";
import { apiFetch } from "@/lib/api";
import {
  HomeIcon,
  PackageIcon,
  ShoppingCartIcon,
  UsersIcon,
  BarChartIcon,
  SettingsIcon,
  BellIcon,
  SearchIcon,
  ShieldIcon,
  ClockIcon,
  LogOutIcon,
  ChevronDownIcon,
  XIcon,
  Check2FAIcon,
  LayersIcon,
} from "./ui";

type View = "dashboard" | "products" | "orders" | "customers" | "analytics" | "settings";

type AdminShellContextValue = {
  profileStore: ReturnType<typeof useProfileStore>;
  securityStore: ReturnType<typeof useSecurity2FAStore>;
};

const AdminShellContext = createContext<AdminShellContextValue | null>(null);

export function useAdminShell() {
  const ctx = useContext(AdminShellContext);
  if (!ctx) throw new Error("useAdminShell must be used within <AdminLayout />");
  return ctx;
}

interface NavItem {
  id: View;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

function cn(...c: (string | undefined | false | null)[]) {
  return c.filter(Boolean).join(" ");
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({
  currentView,
  onNavigate,
  collapsed,
  onClose,
  onSignOut,
  profile,
  initials,
  navItems,
}: {
  currentView: View;
  onNavigate: (v: View) => void;
  collapsed: boolean;
  onClose: () => void;
  onSignOut?: () => void;
  profile: { fullName: string; title?: string };
  initials: string;
  navItems: NavItem[];
}) {
  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-0 overflow-hidden lg:w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        {collapsed ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-light-32x32.png" alt="HH" width={24} height={24} className="object-contain" />
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-sidebar.png"
              alt="Hygiene Hub"
              width={120}
              height={36}
              className="object-contain object-left h-9 w-auto"
            />
            <div className="flex flex-col leading-none ml-1">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-accent-foreground">Admin Portal</span>
            </div>
          </div>
        )}
        <button onClick={onClose} className="ml-auto flex lg:hidden items-center justify-center text-sidebar-accent-foreground hover:text-sidebar-foreground transition-colors" aria-label="Close sidebar">
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pb-1 pt-5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-accent-foreground">Main Menu</span>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {navItems.map((item) => {
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                "transition-all duration-150 cursor-pointer w-full text-left",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-accent-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary" />}
              <item.icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-sidebar-accent-foreground group-hover:text-sidebar-foreground")} />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold ring-2 ring-primary/30">
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-success" />
          </div>
          {!collapsed && (
            <>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="truncate text-xs font-semibold text-sidebar-foreground">{profile.fullName}</span>
                <span className="truncate text-[10px] text-sidebar-accent-foreground">{profile.title ?? "Admin"}</span>
              </div>
              <button className="text-sidebar-accent-foreground hover:text-sidebar-foreground transition-colors" aria-label="Sign out" onClick={onSignOut}>
                <LogOutIcon className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({
  currentView,
  onToggleSidebar,
  onSignOut,
  profileStore,
  securityStore,
  navItems,
}: {
  currentView: View;
  onToggleSidebar: () => void;
  onSignOut?: () => void;
  profileStore: ReturnType<typeof useProfileStore>;
  securityStore: ReturnType<typeof useSecurity2FAStore>;
  navItems: NavItem[];
}) {
  const [searchValue, setSearchValue]             = useState("");
  const [profileOpen, setProfileOpen]             = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [auditOpen, setAuditOpen]                 = useState(false);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [securityOpen, setSecurityOpen]           = useState(false);
  const notificationsStore = useNotificationsStore();
  const auditStore         = useAuditLogStore();
  const initials           = initialsFromName(profileStore.profile.fullName);
  const title = navItems.find((n) => n.id === currentView)?.label ?? "Dashboard";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-topbar-border bg-topbar px-4">
      <button onClick={onToggleSidebar} aria-label="Toggle sidebar" className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <h1 className="hidden sm:block text-sm font-semibold text-foreground font-serif">{title}</h1>
      <span className="hidden sm:block text-border-strong">/</span>
      <span className="hidden sm:block text-xs text-muted-foreground">
        {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </span>

      <div className="relative ml-auto flex-1 max-w-xs">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search anything…" aria-label="Global search" className="h-8 w-full rounded-md border border-border bg-input pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
      </div>

      {/* 2FA status chip */}
      <div className={securityStore.state.enabled
        ? "hidden sm:flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
        : "hidden sm:flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning-foreground"
      }>
        <Check2FAIcon className="h-3 w-3" />
        {securityStore.state.enabled ? "2FA On" : "2FA Off"}
      </div>

      <button className="hidden md:flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors" onClick={() => setAuditOpen(true)}>
        <ClockIcon className="h-3 w-3" />
        Audit Log
      </button>

      <button aria-label="Notifications" className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" onClick={() => setNotificationsOpen(true)}>
        <BellIcon className="h-4 w-4" />
        {notificationsStore.unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground ring-2 ring-topbar">
            {notificationsStore.unreadCount > 99 ? "99+" : notificationsStore.unreadCount}
          </span>
        ) : (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary/60 ring-1 ring-topbar" />
        )}
      </button>

      <NotificationsCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} store={notificationsStore} />
      <AuditLogCenter open={auditOpen} onClose={() => setAuditOpen(false)} store={auditStore} />
      <ProfileSettingsCenter open={profileSettingsOpen} onClose={() => setProfileSettingsOpen(false)} store={profileStore} />
      <Security2FACenter open={securityOpen} onClose={() => setSecurityOpen(false)} store={securityStore} />

      {/* Avatar dropdown */}
      <div className="relative">
        <button onClick={() => setProfileOpen((o) => !o)} aria-haspopup="true" aria-expanded={profileOpen} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-bold ring-1 ring-primary/30">{initials}</div>
          <span className="hidden sm:block">{profileStore.profile.fullName}</span>
          <ChevronDownIcon className="h-3 w-3 text-muted-foreground" />
        </button>
        {profileOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} aria-hidden="true" />
            <div className="absolute right-0 top-full z-50 mt-1.5 w-52 animate-in-up rounded-xl border border-border bg-popover shadow-2xl py-1">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs font-semibold text-foreground">{profileStore.profile.fullName}</p>
                <p className="text-[11px] text-muted-foreground truncate">{profileStore.profile.email}</p>
              </div>
              {[
                { label: "Profile Settings", icon: SettingsIcon },
                { label: "Security & 2FA",   icon: ShieldIcon   },
                { label: "Audit Log",        icon: ClockIcon    },
              ].map(({ label, icon: Icon }) => (
                <button key={label} className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors" onClick={() => {
                  setProfileOpen(false);
                  if (label === "Profile Settings") setProfileSettingsOpen(true);
                  if (label === "Security & 2FA")   setSecurityOpen(true);
                  if (label === "Audit Log")         setAuditOpen(true);
                }}>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {label}
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors" onClick={() => { setProfileOpen(false); onSignOut?.(); }}>
                  <LogOutIcon className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// ─── AdminLayout ──────────────────────────────────────────────────────────────
export default function AdminLayout({
  children,
  currentView,
  onNavigate,
  onSignOut,
  userName,
}: {
  children: React.ReactNode;
  currentView: View;
  onNavigate: (v: View) => void;
  onSignOut?: () => void;
  userName?: string | null;
}) {
  const [sidebarOpen, setSidebarOpen]           = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const profileStore  = useProfileStore();
  const securityStore = useSecurity2FAStore();

  // Sync user name into the local profile store
  useEffect(() => {
    if (userName && profileStore.profile.fullName === "Admin") {
      profileStore.updateProfile({ ...profileStore.profile, fullName: userName });
    }
  }, [userName]); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = initialsFromName(profileStore.profile.fullName);

  // ── Dynamic badge counts ───────────────────────────────────────────────────
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [outOfStockCount, setOutOfStockCount]       = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCounts() {
      try {
        const [ordersRes, productsRes] = await Promise.all([
          apiFetch<{ data?: Array<{ orderStatus?: string }> }>("/api/admin/orders/get"),
          apiFetch<{ data?: Array<{ totalStock?: number }> }>("/api/admin/products/get"),
        ]);

        if (cancelled) return;

        if (ordersRes.success) {
          const pending = ((ordersRes as any).data ?? []).filter(
            (o: any) => (o.orderStatus ?? "").toLowerCase() === "pending"
          ).length;
          setPendingOrdersCount(pending);
        }

        if (productsRes.success) {
          const oos = ((productsRes as any).data ?? []).filter(
            (p: any) => (p.totalStock ?? 0) === 0
          ).length;
          setOutOfStockCount(oos);
        }
      } catch {
        // Non-blocking — badges fall back to 0 silently
      }
    }

    void loadCounts();
    const interval = setInterval(() => void loadCounts(), 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const navItems: NavItem[] = useMemo(() => [
    { id: "dashboard",  label: "Dashboard",  icon: HomeIcon },
    { id: "products",   label: "Products",   icon: PackageIcon,      ...(outOfStockCount > 0 ? { badge: outOfStockCount } : {}) },
    { id: "orders",     label: "Orders",     icon: ShoppingCartIcon, ...(pendingOrdersCount > 0 ? { badge: pendingOrdersCount } : {}) },
    { id: "customers",  label: "Customers",  icon: UsersIcon },
    { id: "analytics",  label: "Analytics",  icon: BarChartIcon },
    { id: "settings",   label: "Settings",   icon: SettingsIcon },
  ], [pendingOrdersCount, outOfStockCount]);

  const shellValue = useMemo(() => ({ profileStore, securityStore }), [profileStore, securityStore]);

  return (
    <AdminShellContext.Provider value={shellValue}>
      <div className="flex h-screen overflow-hidden bg-background">
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileSidebarOpen(false)} aria-hidden="true" />
        )}

        {/* Mobile sidebar */}
        <div className={cn("fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300", mobileSidebarOpen ? "translate-x-0" : "-translate-x-full")}>
          <Sidebar
            currentView={currentView}
            onNavigate={(v) => { onNavigate(v); setMobileSidebarOpen(false); }}
            collapsed={false}
            onClose={() => setMobileSidebarOpen(false)}
            onSignOut={onSignOut}
            profile={profileStore.profile}
            initials={initials}
            navItems={navItems}
          />
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex shrink-0">
          <Sidebar
            currentView={currentView}
            onNavigate={onNavigate}
            collapsed={!sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            onSignOut={onSignOut}
            profile={profileStore.profile}
            initials={initials}
            navItems={navItems}
          />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            currentView={currentView}
            onToggleSidebar={() => { setSidebarOpen((o) => !o); setMobileSidebarOpen((o) => !o); }}
            onSignOut={onSignOut}
            profileStore={profileStore}
            securityStore={securityStore}
            navItems={navItems}
          />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </AdminShellContext.Provider>
  );
}
