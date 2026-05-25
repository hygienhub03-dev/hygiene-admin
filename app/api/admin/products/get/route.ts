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
      .select(`
        id,
        name,
        price,
        stock,
        categories(name)
      `)
      .order('name');

    if (error) throw error;

    const products = data?.map(product => ({
      _id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      category: (product.categories as any)?.name || '',
    })) || [];

    return NextResponse.json({ success: true, data: products });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
