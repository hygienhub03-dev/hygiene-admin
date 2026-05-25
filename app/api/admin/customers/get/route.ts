import { NextRequest, NextResponse } from "next/server";
import { getAllOrders } from "@/lib/supabase/queries/orders";
import { requireAdminForApi } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  try {
    const orders = await getAllOrders();

    const customerMap = new Map();

    for (const order of orders) {
      const uid = order.userId || "anonymous";
      if (!customerMap.has(uid)) {
        customerMap.set(uid, {
          _id: uid,
          userName: uid,
          email: "",
          role: "customer",
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
        });
      }
      const c = customerMap.get(uid)!;
      c.orderCount += 1;
      c.totalSpent += Number(order.totalAmount) || 0;
      if (
        order.orderDate &&
        (!c.lastOrderDate || order.orderDate > c.lastOrderDate)
      ) {
        c.lastOrderDate = order.orderDate;
      }
    }

    const customers = Array.from(customerMap.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    return NextResponse.json({ success: true, data: customers });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}