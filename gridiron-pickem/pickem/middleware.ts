import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth');

  // Presence-only check: look for a Supabase auth cookie without making any
  // network call to verify it. This can never time out, because it never
  // talks to Supabase. Real, verified auth checks happen server-side in
  // page/route handlers via supabase.auth.getUser(), and Row Level Security
  // enforces actual data access at the database layer no matter what
  // middleware decides here. Middleware's only job is a fast redirect for
  // UX, not the security boundary.
  const hasSessionCookie = request.cookies.getAll().some((cookie) =>
    cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
  );

  if (!hasSessionCookie && !isAuthRoute) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
