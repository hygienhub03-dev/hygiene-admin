import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";
import { mapOrder } from "@/lib/services/order-mapper";
import {
  ORDER_STATUSES,
  SHIPMENT_STATUSES,
  deriveShipmentStatus,
} from "@/lib/services/order-status";
import { notifyOrderUpdate } from "@/lib/services/order-notifications";
import {
  shouldCommitInventory,
  commitOrderInventory,
} from "@/lib/services/inventory";
import { dispatchOrderWebhooks } from "@/lib/services/order-webhooks";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requireAdminForApi(request);
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
      { success: false, message: status === 404 ? "Order not found" : "Internal server error" },
      { status },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await requireAdminForApi(request);
  if (authError) return authError;
  try {
    const { id } = await params;
    const body = await request.json();
    const orderStatus = body.orderStatus ?? body.status;
    const shipmentStatus = deriveShipmentStatus(orderStatus, body.shipmentStatus);
    const trackingNumber = body.trackingNumber;
    const carrier = body.carrier;

    if (orderStatus && !ORDER_STATUSES.has(orderStatus)) {
      return NextResponse.json({ success: false, message: "Invalid order status" }, { status: 400 });
    }

    if (shipmentStatus && !SHIPMENT_STATUSES.has(shipmentStatus)) {
      return NextResponse.json({ success: false, message: "Invalid shipment status" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("user_email, status, shipment_status, tracking_number, carrier")
      .eq("id", id)
      .single();

    const updates: Record<string, unknown> = {};
    if (orderStatus) updates.status = orderStatus;
    if (shipmentStatus) updates.shipment_status = shipmentStatus;
    if (trackingNumber !== undefined) updates.tracking_number = trackingNumber;
    if (carrier !== undefined) updates.carrier = carrier;

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

    // Commit inventory once when the order first enters a fulfilment status.
    // Skips automatically if the storefront already reserved stock on create
    // (inventory_movements row present). Failures never block the status update.
    let inventory: Awaited<ReturnType<typeof commitOrderInventory>> | null = null;
    if (shouldCommitInventory(orderStatus, existingOrder?.status)) {
      const items = (data.order_items ?? []).map((item: any) => ({
        product_id: item.product_id,
        quantity: Number(item.quantity ?? 0),
        product_name: item.product_name,
      }));
      inventory = await commitOrderInventory(supabase, id, items, {
        reason: "order_fulfilment",
      });
    }

    // Customer emails on genuine status transitions (shipped / delivered / processing).
    // Failures are logged to email_events and never block the status update.
    let notifications: Awaited<ReturnType<typeof notifyOrderUpdate>> = [];
    if (existingOrder?.user_email) {
      notifications = await notifyOrderUpdate(supabase, {
        orderId: id,
        userEmail: existingOrder.user_email,
        orderStatus,
        previousOrderStatus: existingOrder.status,
        shipmentStatus,
        previousShipmentStatus: existingOrder.shipment_status,
        trackingNumber: trackingNumber ?? existingOrder.tracking_number,
        carrier: carrier ?? existingOrder.carrier,
      });
    }

    // Outgoing webhooks (ORDER_WEBHOOK_URLS). Failures never block the update.
    const webhooks = await dispatchOrderWebhooks(supabase, {
      orderId: id,
      userEmail: existingOrder?.user_email,
      orderStatus,
      previousOrderStatus: existingOrder?.status,
      shipmentStatus,
      previousShipmentStatus: existingOrder?.shipment_status,
      trackingNumber: trackingNumber ?? existingOrder?.tracking_number,
      carrier: carrier ?? existingOrder?.carrier,
      note: body.note ?? null,
    });

    return NextResponse.json({
      success: true,
      data: mapOrder(data),
      notifications,
      webhooks: webhooks.map((w) => ({
        url: w.url,
        event: w.event,
        ok: w.ok,
        status: w.status,
        error: w.error,
      })),
      inventory: inventory
        ? {
            adjusted: inventory.adjusted.length,
            lowStock: inventory.lowStock,
            becameLow: inventory.adjusted.filter((a) => a.becameLow).map((a) => ({
              id: a.productId,
              title: a.title,
              stock: a.newStock,
              level: a.level,
            })),
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
