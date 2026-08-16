import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Pulls the token out of an `Authorization: Bearer <token>` header.
 * Kept separate so it's unit-testable without mocking NextRequest/Supabase.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | undefined {
  return authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
}

export interface AdminAuthResult {
  error: NextResponse | null;
  userId: string | null;
}

/**
 * Verifies the caller is a signed-in admin. Returns:
 *  - `{ error: NextResponse, userId: null }` on failure (return this from the route)
 *  - `{ error: null, userId: string }` on success (use userId for audit logs, RPCs)
 */
export async function requireAdminForApi(
  request: NextRequest,
): Promise<AdminAuthResult> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const bearerToken = extractBearerToken(request.headers.get("authorization"));

  const { data: { user }, error } = bearerToken
    ? await supabase.auth.getUser(bearerToken)
    : await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { success: false, message: "Unauthorised: No active session" },
        { status: 401 },
      ),
      userId: null,
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return {
      error: NextResponse.json(
        { success: false, message: "Unauthorised: Admin role required" },
        { status: 403 },
      ),
      userId: null,
    };
  }

  return { error: null, userId: user.id };
}
