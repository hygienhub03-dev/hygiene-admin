import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: (data ?? []).map(mapOrder),
    });
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
    cartItems: (order.order_items ?? []).map((item: any) => ({
      productId: item.product_id,
      title: item.product_name,
      image: item.product_image_url,
      price: String(item.unit_price ?? 0),
      quantity: item.quantity,
    })),
  };
}
