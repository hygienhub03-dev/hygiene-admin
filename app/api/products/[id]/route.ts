import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { requireAdminForApi } from "@/lib/admin-auth";
import { idParamSchema, productUpdateSchema } from "@/lib/api-validation";
import { enforceRateLimit, enforceTrustedOrigin } from "@/lib/route-security";

function getSupabase(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const originError = enforceTrustedOrigin(req);
  if (originError) return originError;
  const rateLimitError = enforceRateLimit(req, "products:put", 40, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const idPayload = idParamSchema.safeParse(await params);
    if (!idPayload.success) {
      return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
    }

    const payload = productUpdateSchema.safeParse(await req.json());
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

    const { id } = idPayload.data;
    const body = payload.data;
    const supabase = getSupabase(req);

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.name = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.price !== undefined) updates.price = body.price;
    if (body.totalStock !== undefined) updates.stock = body.totalStock;

    if (body.category !== undefined) {
      const { data: catData } = await supabase
        .from('categories')
        .select('id')
        .eq('name', body.category)
        .single();

      if (catData) {
        updates.category_id = catData.id;
      } else {
        const { data: newCat } = await supabase
          .from('categories')
          .insert({ name: body.category, slug: body.category.toLowerCase().replace(/\s+/g, '-') })
          .select('id')
          .single();
        if (newCat) updates.category_id = newCat.id;
      }
    }

    if (Object.keys(updates).length === 0) {
      const { data: existing, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, data: existing });
    }

    const { data: updated, error } = await supabase
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (body.image !== undefined) {
      await supabase
        .from('product_images')
        .upsert({ product_id: id, url: body.image, is_primary: true }, { onConflict: 'product_id' });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("[PUT /api/products/:id]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to update product" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const originError = enforceTrustedOrigin(req);
  if (originError) return originError;
  const rateLimitError = enforceRateLimit(req, "products:delete", 20, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const idPayload = idParamSchema.safeParse(await params);
    if (!idPayload.success) {
      return NextResponse.json({ success: false, message: "Invalid product id" }, { status: 400 });
    }

    const { id } = idPayload.data;
    const supabase = getSupabase(req);

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: "Product deleted" });
  } catch (error: any) {
    console.error("[DELETE /api/products/:id]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Failed to delete product" },
      { status: 500 },
    );
  }
}
