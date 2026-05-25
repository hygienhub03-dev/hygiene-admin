import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/admin-auth";

const defaultSettings = {
  storeName: "HygienHub",
  currency: "ZAR",
  shippingCost: 50,
  freeShippingThreshold: 500,
  lowStockThreshold: 5,
  emailNotifications: true,
};

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;
  return NextResponse.json({ success: true, data: defaultSettings });
}

export async function PUT(request: NextRequest) {
  const authError = await requireAdminForApi(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      data: { ...defaultSettings, ...body }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}