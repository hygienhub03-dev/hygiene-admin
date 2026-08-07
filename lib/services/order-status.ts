/**
 * Pure order-status helpers, pulled out of app/api/orders/[id]/route.ts so
 * the "does this change deserve a customer email" logic is unit-testable
 * without mocking Supabase.
 */

export const ORDER_STATUSES = new Set([
  'waiting',
  'processing',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
  'reviewed',
])

export const SHIPMENT_STATUSES = new Set([
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'returned',
])

/**
 * The admin dashboard only exposes a single status dropdown
 * (waiting/processing/shipped/delivered/cancelled) that writes to
 * `orders.status`. There's no separate UI for `shipment_status`, so a
 * shipped/delivered order-status pick needs to imply the matching
 * shipment_status — otherwise the shipped/delivered emails never fire.
 * An explicit `shipmentStatus` in the request always wins.
 */
export function deriveShipmentStatus(
  orderStatus: string | undefined,
  explicitShipmentStatus: string | undefined,
): string | undefined {
  if (explicitShipmentStatus) return explicitShipmentStatus
  if (orderStatus === 'shipped' || orderStatus === 'delivered') return orderStatus
  return undefined
}

/** Only notify on a genuine transition, and only for statuses we email about. */
export function shouldNotifyShipmentChange(
  newShipmentStatus: string | undefined,
  previousShipmentStatus: string | null | undefined,
): boolean {
  if (!newShipmentStatus) return false
  if (newShipmentStatus !== 'shipped' && newShipmentStatus !== 'delivered') return false
  return newShipmentStatus !== previousShipmentStatus
}

/** Order statuses that warrant a customer-facing notification. */
export type NotifiableOrderStatus = 'processing' | 'shipped' | 'delivered'

const NOTIFIABLE_ORDER_STATUSES = new Set<string>([
  'processing',
  'shipped',
  'delivered',
])

/**
 * True when order.status moved into a notifiable state.
 * Shipped/delivered are usually emailed via the shipment path; processing is
 * handled separately so customers know fulfilment has started.
 */
export function shouldNotifyOrderStatusChange(
  newOrderStatus: string | undefined,
  previousOrderStatus: string | null | undefined,
): boolean {
  if (!newOrderStatus) return false
  if (!NOTIFIABLE_ORDER_STATUSES.has(newOrderStatus)) return false
  return newOrderStatus !== previousOrderStatus
}
