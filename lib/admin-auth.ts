import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Pulls the token out of an `Authorization: Bearer <token>` header.
 * Kept separate so it's unit-testable without mocking NextRequest/Supabase.
 */
export function extractBearerToken(authorizationHeader: string | null | undefined): string | undefined {
  return authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
}

/**
 * Verifies the caller is a signed-in admin. Supports two callers:
 *  - The web dashboard, authenticated via cookies (existing behaviour).
 *  - The mobile admin app, which has no cookies and instead sends the
 *    user's Supabase access token as `Authorization: Bearer <token>`.
 *    supabase-js's `getUser(jwt)` validates a token passed explicitly this
 *    way against the Auth server, so this doesn't weaken the cookie path
 *    at all — it's an additional, equally-verified way to identify "who is
 *    calling", which every route using this helper picks up for free.
 */
export async function requireAdminForApi(
  request: NextRequest,
): Promise<NextResponse | null> {
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
    return NextResponse.json(
      { success: false, message: "Unauthorised: No active session" },
      { status: 401 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { success: false, message: "Unauthorised: Admin role required" },
      { status: 403 },
    );
  }

  return null;
}
