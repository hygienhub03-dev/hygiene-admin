import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { requireAdminForApi } from "@/lib/admin-auth";
import { productInputSchema } from "@/lib/api-validation";
import { enforceRateLimit } from "@/lib/route-security";

// GET /api/products — list all products
export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const rateLimitError = enforceRateLimit(req, "products:get", 120, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll() {},
        },
      },
    );

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        category: categories(id, name, slug),
        images: product_images(id, url),
        combo_items(product_id, quantity, products(id, name))
      `)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    // Fetch sales data per product
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, quantity, unit_price');

    const salesMap = new Map<string, { unitsSold: number; revenue: number }>();
    if (orderItems) {
      for (const item of orderItems as any[]) {
        const existing = salesMap.get(item.product_id) || { unitsSold: 0, revenue: 0 };
        existing.unitsSold += item.quantity || 0;
        existing.revenue += (Number(item.unit_price) || 0) * (item.quantity || 0);
        salesMap.set(item.product_id, existing);
      }
    }

    // Attach sales data to products
    const enriched = (data || []).map((product: any) => {
      const sales = salesMap.get(product.id) || { unitsSold: 0, revenue: 0 };
      return {
        ...product,
        unitsSold: sales.unitsSold,
        revenue: Math.round(sales.revenue * 100) / 100,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error: any) {
    console.error("[GET /api/products]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to fetch products" },
      { status: 500 },
    );
  }
}

// POST /api/products — add a new product
export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const rateLimitError = enforceRateLimit(req, "products:post", 30, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const payload = productInputSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Validation failed",
          errors: payload.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const body = payload.data;
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll(); },
          setAll() {},
        },
      },
    );

    // Get or create category
    let categoryId = null;
    if (body.category) {
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .eq('name', body.category)
        .single();

      if (catData) {
        categoryId = catData.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({ name: body.category, slug: body.category.toLowerCase().replace(/\s+/g, '-') })
          .select('id')
          .single();
        categoryId = newCat?.id;
      }
    }

    // Generate unique slug from title
    const slug = body.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      + "-" + Date.now().toString(36);

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name: body.title,
        slug,
        description: body.description,
        price: body.price,
        category_id: categoryId,
        stock: body.totalStock,
        featured: false,
        is_combo: body.isCombo ?? false,
      })
      .select()
      .single();

    if (error) throw error;

    // If image URL provided, add to product_images
    if (body.image) {
      const { error: imgError } = await supabase
        .from('product_images')
        .insert({
          product_id: product.id,
          url: body.image,
        });
      if (imgError) throw imgError;
    }

    // If combo, insert combo_items
    if (body.isCombo && body.comboItems && body.comboItems.length > 0) {
      const rows = body.comboItems.map((ci: any) => ({
        combo_id: product.id,
        product_id: ci.product_id,
        quantity: ci.quantity ?? 1,
      }));
      const { error: ciError } = await supabase.from('combo_items').insert(rows);
      if (ciError) throw ciError;
    }

    // Re-fetch with images join so the response includes the image
    const { data: fullProduct } = await supabase
      .from('products')
      .select('*, product_images(url), combo_items(product_id, quantity, products(name))')
      .eq('id', product.id)
      .single();

    return NextResponse.json({ success: true, data: fullProduct ?? product }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/products]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to add product" },
      { status: 500 },
    );
  }
}
