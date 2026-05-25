import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { requireAdminForApi } from "@/lib/admin-auth";
import { allowedUploadMime, MAX_UPLOAD_BYTES } from "@/lib/api-validation";
import { enforceRateLimit, enforceTrustedOrigin } from "@/lib/route-security";

export async function POST(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  const originError = enforceTrustedOrigin(req);
  if (originError) return originError;
  const rateLimitError = enforceRateLimit(req, "products:upload", 20, 60_000);
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
        { success: false, message: "Invalid file type" },
        { status: 400 },
      );
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, message: "File is too large (max 5MB)" },
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

    const fileBuffer = await file.arrayBuffer();
    const fileName = `${crypto.randomUUID()}-${file.name}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (error: any) {
    console.error("[POST /api/products/upload]", error);
    return NextResponse.json(
      { success: false, message: error?.message ?? "Image upload failed" },
      { status: 500 },
    );
  }
}
