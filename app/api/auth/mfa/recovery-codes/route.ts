import { NextResponse } from "next/server";

export async function GET() {
  const codes = Array.from({ length: 8 }, () => 
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );
  
  return NextResponse.json({
    success: true,
    data: { recoveryCodes: codes }
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    data: { regenerated: true }
  });
}