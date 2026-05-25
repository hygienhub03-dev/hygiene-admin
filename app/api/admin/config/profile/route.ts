import { NextRequest, NextResponse } from "next/server";
import { requireAdminForApi } from "@/lib/admin-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const authError = await requireAdminForApi(req);
  if (authError) return authError;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single();

    if (profileError) throw profileError;

    return NextResponse.json({
      success: true,
      data: {
        fullName: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || '',
        email: profile?.email || user!.email || '',
        title: '',
        timezone: "Africa/Johannesburg",
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requireAdminForApi(request);
  if (authError) return authError;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { firstName, lastName, email, phone } = body;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        first_name: firstName || '',
        last_name: lastName || '',
        email: email || user!.email || '',
        phone: phone || '',
      })
      .eq('id', user!.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      data: {
        fullName: `${firstName || ''} ${lastName || ''}`.trim() || '',
        email: email || user!.email || '',
        title: "",
        timezone: "Africa/Johannesburg",
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}