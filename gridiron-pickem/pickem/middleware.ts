import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_CHECK_TIMEOUT_MS = 4000;

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth');

  // Presence-only fallback: does *a* Supabase auth cookie exist at all. Used
  // only if the real check below can't complete in time - never a network
  // call, so it can never hang or time out.
  const hasSessionCookie = request.cookies.getAll().some((cookie) =>
    cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS) }),
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        // Server Components can't persist cookies (see lib/supabase/server.ts) -
        // middleware is the only place that can actually save a refreshed
        // session token. This is what keeps sessions alive past the access
        // token's ~1hr lifetime; removing it (as we did earlier today) causes
        // every session to silently go stale mid-day.
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Try the real, session-refreshing check, but bounded and FAIL OPEN. If
  // Supabase is slow or down, we don't want to hang (the original 504 bug)
  // and we don't want to wrongly boot a legitimately logged-in user to
  // /login just because Supabase had a slow moment (which is worse on a
  // high-traffic Saturday). On any failure, fall back to the cheap
  // cookie-presence check instead of blocking the request.
  let user = null;
  let authCheckSucceeded = false;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
    authCheckSucceeded = true;
  } catch (error) {
    console.error('Middleware auth/refresh check failed or timed out:', error);
  }

  const isAuthenticated = authCheckSucceeded ? !!user : hasSessionCookie;

  if (!isAuthenticated && !isAuthRoute) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
