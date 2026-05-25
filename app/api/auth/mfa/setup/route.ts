import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    data: { secret: "MFA_SETUP_NOT_CONFIGURED", qr: "" }
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    data: { verified: false }
  });
}