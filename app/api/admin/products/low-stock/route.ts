import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdminForApi } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('products')
      .select('id, name, stock')
      .lte('stock', 5)
      .order('stock', { ascending: true });

    if (error) throw error;
    
    // Transform data to match the expected format
    const transformedData = data?.map(product => ({
      _id: product.id,
      name: product.name,
      stock: product.stock
    })) || [];

    return NextResponse.json({ success: true, data: transformedData });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
