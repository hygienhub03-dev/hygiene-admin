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
        images: product_images(id, url)
      `)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    return NextResponse.json({ success: true, data });
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

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name: body.title,
        description: body.description,
        price: body.price,
        category_id: categoryId,
        stock: body.totalStock,
        featured: false,
      })
      .select()
      .single();

    if (error) throw error;

    // If image URL provided, add to product_images
    if (body.image) {
      await supabase
        .from('product_images')
        .insert({
          product_id: product.id,
          url: body.image,
          is_primary: true
        });
    }

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/products]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to add product" },
      { status: 500 },
    );
  }
}
