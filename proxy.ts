import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export default async function proxy(req: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: req.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  const isPublicRoute = req.nextUrl.pathname.startsWith('/sign-in') ||
                        req.nextUrl.pathname.startsWith('/sign-up') ||
                        req.nextUrl.pathname.startsWith('/api/auth') ||
                        req.nextUrl.pathname.startsWith('/_next') ||
                        req.nextUrl.pathname.startsWith('/static') ||
                        req.nextUrl.pathname.includes('.');

  if (isPublicRoute) {
    return response;
  }

  if (error || !user) {
    const signInUrl = new URL('/sign-in', req.url);
    return NextResponse.redirect(signInUrl);
  }

  // Check admin role for admin/dashboard routes
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin') ||
                      req.nextUrl.pathname.startsWith('/dashboard') ||
                      req.nextUrl.pathname.startsWith('/inventory');

  if (isAdminRoute && profile?.role !== 'admin') {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
