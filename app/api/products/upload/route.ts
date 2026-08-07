import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { requireAdminForApi } from "@/lib/admin-auth";
import { allowedUploadMime, MAX_UPLOAD_BYTES } from "@/lib/api-validation";
import { enforceRateLimit } from "@/lib/route-security";

export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const rateLimitError = enforceRateLimit(req, "products:upload", 30, 60_000);
  if (rateLimitError) return rateLimitError;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file provided" },
        { status: 400 },
      );
    }

    if (!allowedUploadMime.has(file.type)) {
      return NextResponse.json(
        { success: false, message: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, message: "File too large (max 5MB)" },
        { status: 400 },
      );
    }

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

    const ext = file.name.split('.').pop() || 'jpg';
    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(data.path);

    return NextResponse.json({ success: true, url: urlData.publicUrl });
  } catch (error: any) {
    console.error("[POST /api/products/upload]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Upload failed" },
      { status: 500 },
    );
  }
}
