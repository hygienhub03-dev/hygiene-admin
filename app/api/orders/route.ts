import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";
import { mapOrder } from "@/lib/services/order-mapper";

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
