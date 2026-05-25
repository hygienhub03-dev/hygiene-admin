import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;

  return NextResponse.json({
    success: true,
    data: {
      logs: [],
      total: 0,
      page: 1,
      limit: 10,
    }
  });
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminForApi(request);
  if (authError) return authError;

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;

  return NextResponse.json({ success: true });
}