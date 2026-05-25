import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    
    // For now, return MFA disabled - could check user profile for MFA settings later
    return NextResponse.json({
      success: true,
      data: { enabled: false }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}