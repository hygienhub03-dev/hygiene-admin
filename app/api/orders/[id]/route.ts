import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";

const ORDER_STATUSES = new Set([
  "waiting",
  "processing",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "reviewed",
]);

const SHIPMENT_STATUSES = new Set([
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returned",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminForApi(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), order_status_events(*)")
      .eq("id", id)
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: mapOrder(data) });
  } catch (error: any) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      { success: false, message: status === 404 ? "Order not found" : error.message },
      { status },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminForApi(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    const body = await request.json();
    const orderStatus = body.orderStatus ?? body.status;
    const shipmentStatus = body.shipmentStatus;
    const trackingNumber = body.trackingNumber;
    const carrier = body.carrier;

    if (orderStatus && !ORDER_STATUSES.has(orderStatus)) {
      return NextResponse.json({ success: false, message: "Invalid order status" }, { status: 400 });
    }

    if (shipmentStatus && !SHIPMENT_STATUSES.has(shipmentStatus)) {
      return NextResponse.json({ success: false, message: "Invalid shipment status" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (orderStatus) updates.status = orderStatus;
    if (shipmentStatus) updates.shipment_status = shipmentStatus;
    if (trackingNumber !== undefined) updates.tracking_number = trackingNumber;
    if (carrier !== undefined) updates.carrier = carrier;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select("*, order_items(*), order_status_events(*)")
      .single();

    if (error) throw error;

    if (orderStatus || shipmentStatus) {
      await supabase.from("order_status_events").insert({
        order_id: id,
        status: orderStatus ?? data.status,
        shipment_status: shipmentStatus ?? data.shipment_status,
        note: body.note ?? "Status updated by admin",
      });
    }

    return NextResponse.json({ success: true, data: mapOrder(data) });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 },
    );
  }
}

function mapOrder(order: any) {
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
    deliveryMethod: order.delivery_method ?? "door",
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
  };
}
