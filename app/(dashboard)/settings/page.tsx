"use client"

import { useState } from "react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"
import {
  Database,
  FileText,
  Package,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react"

const RESET_CONFIRMATION = "CLEAR TEST DATA"

const resetItems = [
  {
    icon: Database,
    title: "Stats and analytics",
    description: "Clears orders, order items, order status events, inventory movements, reviews, carts, wishlists, subscriptions, and abandoned carts.",
  },
  {
    icon: Users,
    title: "Test users",
    description: "Removes non-admin customer profiles and their linked auth accounts after dependent records are cleared.",
  },
  {
    icon: FileText,
    title: "Generated reports",
    description: "There is no saved reports table; future CSV reports will be generated from the cleaned live data.",
  },
  {
    icon: Package,
    title: "Products preserved",
    description: "Products, categories, and product images are not deleted so the catalogue stays ready for launch.",
  },
]

export default function SettingsPage() {
  const { toast } = useToast()
  const [confirmation, setConfirmation] = useState("")
  const [isResetting, setIsResetting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleReset = async () => {
    if (confirmation !== RESET_CONFIRMATION) {
      toast({
        title: "Confirmation required",
        description: `Type ${RESET_CONFIRMATION} to continue.`,
        variant: "destructive",
      })
      return
    }

    setIsResetting(true)
    try {
      const res = await apiFetch("/api/settings/reset-test-data", {
        method: "DELETE",
        body: { confirm: RESET_CONFIRMATION },
      })

      if (!res.success) {
        throw new Error((res as any).message ?? "Failed to clear test data")
      }

      toast({
        title: "Test data cleared",
        description: "The panel is ready for launch with products preserved.",
      })
      setConfirmation("")
      setDialogOpen(false)
    } catch (error: any) {
      toast({
        title: "Reset failed",
        description: error?.message ?? "Something went wrong while clearing test data.",
        variant: "destructive",
      })
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Prepare the admin panel for launch and manage test data."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="bg-card border border-border">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <ShieldAlert className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <CardTitle>Clear testing data</CardTitle>
                <CardDescription>
                  Remove stats, test users, orders, and report source data before going live.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              This action cannot be undone. Admin users and products will be preserved.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {resetItems.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-muted-foreground" />
                    <p className="font-medium">{item.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full sm:w-auto">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear test data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all launch-prep test data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete test stats, non-admin users, orders, carts, subscriptions, reviews, and report source data.
                      Products and admin users will remain available.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Type <span className="text-destructive">{RESET_CONFIRMATION}</span> to confirm.</p>
                    <Input
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={RESET_CONFIRMATION}
                      disabled={isResetting}
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isResetting}
                      onClick={handleReset}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isResetting ? "Clearing..." : "Clear test data"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <p className="text-sm text-muted-foreground">
                Use this once before launch. After this, dashboard and report numbers start from real customer activity.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border border-border">
          <CardHeader>
            <CardTitle>Launch checklist</CardTitle>
            <CardDescription>Before going live, confirm the catalogue is ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-4 w-4 text-[var(--color-positive)]" />
              <div>
                <p className="text-sm font-medium">Products ready</p>
                <p className="text-sm text-muted-foreground">Keep products active and in stock for customers to buy.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="mt-0.5 h-4 w-4 text-[var(--color-positive)]" />
              <div>
                <p className="text-sm font-medium">Admin access preserved</p>
                <p className="text-sm text-muted-foreground">Admin profiles are not removed by the reset.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 text-[var(--color-positive)]" />
              <div>
                <p className="text-sm font-medium">Reports start clean</p>
                <p className="text-sm text-muted-foreground">Generated CSV reports will reflect only new live orders.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
