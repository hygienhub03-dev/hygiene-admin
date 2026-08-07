"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ArrowLeft,
  Package,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  MapPin,
  Store,
  User,
  Mail,
  Phone,
  CreditCard,
  Pencil,
} from "lucide-react"
import { apiFetch } from "@/lib/api"
import { useToast } from "@/hooks/use-toast"

interface CartItem {
  productId: string
  title: string
  image: string | null
  price: string
  quantity: number
}

interface StatusEvent {
  id: string
  status: string
  shipmentStatus: string | null
  note: string | null
  createdAt: string
}

interface DoorAddress {
  first_name: string
  last_name: string
  address: string
  city: string
  province: string
  postal_code: string
  phone: string
}

interface PaxiAddress {
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  city: string
  province: string | null
  pep_store: {
    code: string
    name: string
    address: string
    suburb: string
    city: string
    province?: string
  }
}

interface OrderDetail {
  id: string
  userEmail: string
  orderStatus: string
  shipmentStatus: string | null
  trackingNumber: string | null
  carrier: string | null
  paymentStatus: string | null
  paymentMethod: string | null
  totalAmount: number
  deliveryMethod: "door" | "paxi"
  shippingCost: number
  orderDate: string
  orderUpdateDate: string
  paymentId: string | null
  addressInfo: DoorAddress | PaxiAddress | null
  statusEvents: StatusEvent[]
  cartItems: CartItem[]
}

const STATUS_OPTIONS = [
  { label: "Pending", raw: "waiting" },
  { label: "Processing", raw: "processing" },
  { label: "Shipped", raw: "shipped" },
  { label: "Completed", raw: "delivered" },
  { label: "Cancelled", raw: "cancelled" },
]

const capitalizeStatus = (s: string) => {
  const map: Record<string, string> = {
    waiting: "Pending",
    processing: "Processing",
    confirmed: "Processing",
    shipped: "Shipped",
    delivered: "Completed",
    cancelled: "Cancelled",
    returned: "Cancelled",
  }
  return map[s] || s.charAt(0).toUpperCase() + s.slice(1)
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Completed":
      return "bg-green-100 text-green-800"
    case "Processing":
      return "bg-blue-100 text-blue-800"
    case "Shipped":
      return "bg-purple-100 text-purple-800"
    case "Pending":
      return "bg-amber-100 text-amber-800"
    case "Cancelled":
      return "bg-red-100 text-red-800"
    default:
      return "bg-gray-100 text-gray-800"
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Completed":
      return <CheckCircle className="w-3 h-3" />
    case "Processing":
      return <Clock className="w-3 h-3" />
    case "Shipped":
      return <Truck className="w-3 h-3" />
    case "Pending":
      return <Package className="w-3 h-3" />
    case "Cancelled":
      return <XCircle className="w-3 h-3" />
    default:
      return null
  }
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { toast } = useToast()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shipDialogOpen, setShipDialogOpen] = useState(false)
  const [shipDialogMode, setShipDialogMode] = useState<"set-shipped" | "edit-tracking">("set-shipped")
  const [trackingNumberInput, setTrackingNumberInput] = useState("")
  const [carrierInput, setCarrierInput] = useState("")

  useEffect(() => {
    loadOrder()
  }, [id])

  const loadOrder = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await apiFetch<{ data: OrderDetail }>(`/api/orders/${id}`)
      if (res.success) {
        setOrder((res as any).data)
      } else {
        setError((res as any).message || "Failed to load order")
      }
    } catch (err) {
      setError("Failed to load order")
    } finally {
      setIsLoading(false)
    }
  }

  const showUpdateFeedback = (res: any) => {
    const notifications: { type: string; sent: boolean; error?: string }[] =
      res.notifications ?? []
    const sent = notifications.filter((n) => n.sent)
    const failed = notifications.filter((n) => !n.sent)

    if (sent.length > 0) {
      const labels = sent.map((n) => {
        if (n.type === "order_shipped") return "shipped"
        if (n.type === "order_delivered") return "delivered"
        if (n.type === "order_processing") return "processing"
        return n.type
      })
      toast({
        title: "Customer notified",
        description: `Email sent for: ${labels.join(", ")}`,
      })
    }
    if (failed.length > 0) {
      toast({
        title: "Email failed",
        description: failed.map((n) => n.error || n.type).join("; "),
        variant: "destructive",
      })
    }

    const becameLow: { title: string; stock: number; level: string }[] =
      res.inventory?.becameLow ?? []
    if (becameLow.length > 0) {
      toast({
        title: "Low stock after fulfilment",
        description: becameLow
          .map((p) =>
            p.level === "out_of_stock"
              ? `${p.title} is out of stock`
              : `${p.title} has ${p.stock} left`,
          )
          .join(" · "),
        variant: "destructive",
      })
    } else if (res.inventory?.adjusted > 0) {
      toast({
        title: "Inventory updated",
        description: `Stock reduced for ${res.inventory.adjusted} product(s)`,
      })
    }
  }

  const handleStatusChange = async (
    newRawStatus: string,
    extra?: { trackingNumber?: string; carrier?: string },
  ) => {
    if (!order) return
    setUpdating(true)
    try {
      const res = await apiFetch<{
        data: OrderDetail
        notifications?: { type: string; sent: boolean; error?: string }[]
        inventory?: {
          adjusted: number
          becameLow: { title: string; stock: number; level: string }[]
        } | null
      }>(`/api/orders/${id}`, {
        method: "PUT",
        body: { status: newRawStatus, ...extra },
      })
      if (res.success) {
        setOrder((res as any).data)
        showUpdateFeedback(res)
      } else {
        toast({
          title: "Update failed",
          description: (res as any).message ?? "Could not update order status",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Failed to update order:", err)
      toast({
        title: "Update failed",
        description: "Could not update order status",
        variant: "destructive",
      })
    } finally {
      setUpdating(false)
    }
  }

  const handleTrackingUpdate = async (trackingNumber: string, carrier: string) => {
    if (!order) return
    setUpdating(true)
    try {
      // Deliberately no `status` field here — this only updates the tracking
      // fields, it doesn't re-trigger the shipped/delivered email (that only
      // fires on a genuine shipment_status transition).
      const res = await apiFetch<{ data: OrderDetail }>(`/api/orders/${id}`, {
        method: "PUT",
        body: { trackingNumber, carrier },
      })
      if (res.success) {
        setOrder((res as any).data)
        toast({
          title: "Tracking updated",
          description: "Tracking details saved (email not re-sent)",
        })
      } else {
        toast({
          title: "Update failed",
          description: (res as any).message ?? "Could not update tracking",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Failed to update tracking info:", err)
      toast({
        title: "Update failed",
        description: "Could not update tracking",
        variant: "destructive",
      })
    } finally {
      setUpdating(false)
    }
  }

  const openMarkShippedDialog = () => {
    if (!order) return
    setTrackingNumberInput(order.trackingNumber || "")
    setCarrierInput(order.carrier || "")
    setShipDialogMode("set-shipped")
    setShipDialogOpen(true)
  }

  const openEditTrackingDialog = () => {
    if (!order) return
    setTrackingNumberInput(order.trackingNumber || "")
    setCarrierInput(order.carrier || "")
    setShipDialogMode("edit-tracking")
    setShipDialogOpen(true)
  }

  const handleShipDialogConfirm = async () => {
    setShipDialogOpen(false)
    if (shipDialogMode === "set-shipped") {
      await handleStatusChange("shipped", {
        trackingNumber: trackingNumberInput.trim() || undefined,
        carrier: carrierInput.trim() || undefined,
      })
    } else {
      await handleTrackingUpdate(trackingNumberInput.trim(), carrierInput.trim())
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground">{error || "Order not found"}</p>
        <Link href="/orders">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Orders
          </Button>
        </Link>
      </div>
    )
  }

  const status = capitalizeStatus(order.orderStatus)
  const isPaxi = order.deliveryMethod === "paxi"
  const addr = order.addressInfo as any

  return (
    <>
      <div className="mb-4">
        <Link href="/orders" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Orders
        </Link>
      </div>

      <PageHeader
        title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
        description={`Placed ${new Date(order.orderDate).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={updating}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50 ${getStatusColor(status)}`}
            >
              {updating ? (
                <div className="w-3.5 h-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                getStatusIcon(status)
              )}
              {status}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATUS_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.raw}
                disabled={order.orderStatus === opt.raw}
                onClick={() => {
                  if (opt.raw === "shipped") {
                    openMarkShippedDialog()
                  } else {
                    handleStatusChange(opt.raw)
                  }
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {getStatusIcon(opt.label)}
                  {opt.label}
                  {order.orderStatus === opt.raw && <span className="text-xs text-muted-foreground ml-1">(current)</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: items + status history */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Items ({order.cartItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                {order.cartItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 py-3">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-medium">R{(Number(item.price) * item.quantity).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-2 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Shipping ({isPaxi ? "PEP Pickup" : "Door to Door"})</span>
                  <span>R{order.shippingCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>Total</span>
                  <span>R{order.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">Status History</CardTitle>
            </CardHeader>
            <CardContent>
              {order.statusEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No status events recorded.</p>
              ) : (
                <div className="space-y-3">
                  {order.statusEvents
                    .slice()
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((event) => (
                      <div key={event.id} className="flex items-start gap-3 text-sm">
                        <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(capitalizeStatus(event.status))}`}>
                          {capitalizeStatus(event.status)}
                        </span>
                        <div className="flex-1">
                          {event.note && <p className="text-foreground">{event.note}</p>}
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: customer + delivery + payment */}
        <div className="space-y-4">
          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">
                {addr?.first_name} {addr?.last_name}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="w-3.5 h-3.5" />
                {isPaxi ? addr?.email : order.userEmail}
              </p>
              {addr?.phone && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  {addr.phone}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                {isPaxi ? <Store className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                {isPaxi ? "PEP Pickup Point" : "Delivery Address"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {isPaxi ? (
                addr?.pep_store ? (
                  <>
                    <p className="font-medium">{addr.pep_store.name}</p>
                    <p className="text-muted-foreground">Store code: {addr.pep_store.code}</p>
                    <p className="text-muted-foreground">{addr.pep_store.address}</p>
                    <p className="text-muted-foreground">
                      {addr.pep_store.suburb}, {addr.pep_store.city}
                      {addr.pep_store.province ? `, ${addr.pep_store.province}` : ""}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">No PEP store info captured for this order.</p>
                )
              ) : (
                <>
                  <p className="text-muted-foreground">{addr?.address}</p>
                  <p className="text-muted-foreground">
                    {addr?.city}, {addr?.province} {addr?.postal_code}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Shipping &amp; Tracking
              </CardTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openEditTrackingDialog}>
                <Pencil className="w-3.5 h-3.5" />
                <span className="sr-only">Edit tracking info</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tracking number</span>
                <span className={order.trackingNumber ? "font-mono text-xs" : "text-muted-foreground"}>
                  {order.trackingNumber || "Not set"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Carrier</span>
                <span className={order.carrier ? "font-medium" : "text-muted-foreground"}>
                  {order.carrier || "Not set"}
                </span>
              </div>
              {!order.trackingNumber && (
                <p className="text-xs text-muted-foreground pt-1">
                  Added tracking info is included in the customer's shipped-order email.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method</span>
                <span className="font-medium capitalize">{order.paymentMethod || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="capitalize">
                  {order.paymentStatus || "N/A"}
                </Badge>
              </div>
              {order.paymentId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-xs">{order.paymentId}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {shipDialogMode === "set-shipped" ? "Mark order as shipped" : "Edit tracking info"}
            </DialogTitle>
            <DialogDescription>
              {shipDialogMode === "set-shipped"
                ? "Tracking details are optional, but including them here means the customer's shipped-order email will show them."
                : "Update the tracking number or carrier. This won't re-send the shipped email."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tracking-number">Tracking number</Label>
              <Input
                id="tracking-number"
                placeholder="e.g. CJ123456789ZA"
                value={trackingNumberInput}
                onChange={(e) => setTrackingNumberInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="carrier">Carrier (optional)</Label>
              <Input
                id="carrier"
                placeholder="e.g. Courier Guy, PostNet, PEP Paxi"
                value={carrierInput}
                onChange={(e) => setCarrierInput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleShipDialogConfirm} disabled={updating}>
              {shipDialogMode === "set-shipped" ? "Mark as Shipped" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
