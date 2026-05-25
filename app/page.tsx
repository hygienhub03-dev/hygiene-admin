"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import AdminLayout from "@/components/admin/AdminLayout";
import DashboardView from "@/components/admin/DashboardView";
import ProductsView from "@/components/admin/ProductsView";
import CustomersView from "@/components/admin/CustomersView";
import SettingsView from "@/components/admin/SettingsView";
import OrdersView from "@/components/admin/OrdersView";
import AnalyticsView from "@/components/admin/AnalyticsView";
import { useRouter } from "next/navigation";

type View = "dashboard" | "products" | "orders" | "customers" | "analytics" | "settings";

export default function AdminApp() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const { user, profile, isLoading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/sign-in");
    }
    if (!isLoading && profile && profile.role !== 'admin') {
      // Redirect non-admins if they somehow get here
      router.push("/sign-in");
    }
  }, [user, profile, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Checking session...</p>
      </div>
    );
  }

  if (!user || (profile && profile.role !== 'admin')) {
    return null; // Will redirect via useEffect
  }

  function renderView() {
    switch (currentView) {
      case "dashboard":  return <DashboardView />;
      case "products":   return <ProductsView />;
      case "orders":     return <OrdersView />;
      case "customers":  return <CustomersView />;
      case "analytics":  return <AnalyticsView />;
      case "settings":   return <SettingsView />;
      default:           return <DashboardView />;
    }
  }

  return (
    <AdminLayout
      currentView={currentView}
      onNavigate={(v) => setCurrentView(v as View)}
      onSignOut={async () => {
        await signOut();
        router.push("/sign-in");
      }}
      userName={profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}`.trim() : user?.email ?? null}
    >
      {renderView()}
    </AdminLayout>
  );
}
