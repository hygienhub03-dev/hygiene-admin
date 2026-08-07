/**
 * Shapes a raw `orders` row (+ optional joined order_items/order_status_events)
 * into the camelCase DTO the dashboard UI expects.
 *
 * Was previously copy-pasted between the orders list route and the order
 * detail route — now there's one copy, so a field rename only needs to
 * happen in one place.
 */
export function mapOrder(order: any) {
  return {
    id: order.id,
    _id: order.id,
    userId: order.user_id,
    userEmail: order.user_email,
    orderStatus: order.status,
    shipmentStatus: order.shipment_status,
    trackingNumber: order.tracking_number,
    carrier: order.carrier,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    totalAmount: Number(order.total_amount ?? 0),
    deliveryMethod: order.delivery_method ?? 'door',
    shippingCost: Number(order.shipping_cost ?? 0),
    orderDate: order.created_at,
    orderUpdateDate: order.updated_at,
    paymentId: order.payment_reference,
    addressInfo: order.shipping_address,
    statusEvents: (order.order_status_events ?? []).map((event: any) => ({
      id: event.id,
      status: event.status,
      shipmentStatus: event.shipment_status,
      note: event.note,
      createdAt: event.created_at,
    })),
    cartItems: (order.order_items ?? []).map((item: any) => ({
      productId: item.product_id,
      title: item.product_name,
      image: item.product_image_url,
      price: String(item.unit_price ?? 0),
      quantity: item.quantity,
    })),
  }
}
