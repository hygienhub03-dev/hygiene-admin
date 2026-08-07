"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { Bell, ChevronDown, Package, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useAuth } from "@/context/AuthContext"
import { apiFetch } from "@/lib/api"

const navItems = [
  { label: "Dashboard", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Sales", href: "/sales" },
  { label: "Customers", href: "/customers" },
  { label: "Reports", href: "/reports" },
  { label: "Orders", href: "/orders" },
  { label: "Network", href: "/network" },
  { label: "Settings", href: "/settings" },
]

interface LowStockSummary {
  threshold: number
  total: number
  outOfStock: number
  low: number
  products: {
    id: string
    title: string
    stock: number
    level: "out_of_stock" | "low" | "ok"
  }[]
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, profile, signOut } = useAuth()
  const [lowStock, setLowStock] = useState<LowStockSummary | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiFetch<{ data: LowStockSummary }>(
          "/api/products/low-stock",
        )
        if (!cancelled && res.success && "data" in res && res.data) {
          setLowStock(res.data)
        }
      } catch {
        // Non-blocking — bell stays empty if the check fails
      }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const handleLogout = async () => {
    await signOut()
    router.push("/login")
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  const alertCount = lowStock?.total ?? 0

  return (
    <header className="flex items-center justify-between mb-8">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex flex-col items-center">
          <Image
            src="/hygiene-hub-logo.png"
            alt="Hygiene Hub"
            width={40}
            height={40}
            className="h-10 w-auto"
          />
        </div>
      </Link>

      <nav className="hidden md:flex items-center bg-card rounded-full px-2 py-1.5 border border-border">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-[var(--color-accent)] text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-4">
        <Popover open={alertsOpen} onOpenChange={setAlertsOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="w-5 h-5" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Inventory alerts</p>
              <p className="text-xs text-muted-foreground">
                {alertCount === 0
                  ? "All products are above the low-stock threshold"
                  : `${lowStock?.outOfStock ?? 0} out of stock · ${lowStock?.low ?? 0} low (≤${lowStock?.threshold ?? 10})`}
              </p>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {alertCount === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-muted-foreground">
                  <Package className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No low-stock products</p>
                </div>
              ) : (
                (lowStock?.products ?? []).slice(0, 12).map((p) => (
                  <Link
                    key={p.id}
                    href="/products"
                    onClick={() => setAlertsOpen(false)}
                    className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        p.level === "out_of_stock"
                          ? "bg-[var(--color-negative)]/10 text-[var(--color-negative)]"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.level === "out_of_stock"
                          ? "Out of stock"
                          : `${p.stock} units left`}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
            {alertCount > 0 && (
              <div className="border-t border-border p-2">
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => {
                    setAlertsOpen(false)
                    router.push("/products")
                  }}
                >
                  View all products
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 cursor-pointer">
              <Avatar className="h-9 w-9">
                <AvatarImage src={profile?.avatar_url || "/professional-man-avatar.png"} />
                <AvatarFallback>
                  {profile?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
                  {profile?.last_name?.[0] || ""}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium">
                  {profile
                    ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
                      user?.email
                    : user?.email || "Admin"}
                </p>
                <p className="text-xs text-muted-foreground">{profile?.role || "Admin"}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
