import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_CHECK_TIMEOUT_MS = 5000;

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        // Prevent a slow/hanging Supabase request from eating the entire
        // Vercel middleware time budget and causing a 504
        // MIDDLEWARE_INVOCATION_TIMEOUT. If Supabase doesn't respond within
        // AUTH_CHECK_TIMEOUT_MS, this fetch aborts and we fail closed below.
        fetch: (url, options = {}) =>
          fetch(url, { ...options, signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS) }),
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
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

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth');

  // getSession() reads the session from the cookie/JWT already on the
  // request. It only hits Supabase's network if the access token has
  // expired and needs a refresh, so on Saturdays (heavy concurrent traffic)
  // this keeps route-protection checks fast and off the critical path for
  // almost every request, instead of round-tripping to Supabase every time.
  let hasSession = false;
  try {
    const { data } = await supabase.auth.getSession();
    hasSession = !!data.session;
  } catch (error) {
    console.error('Middleware session check failed or timed out:', error);
    if (!isAuthRoute) {
      const redirectUrl = new URL('/login', request.url);
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  if (!hasSession && !isAuthRoute) {
    const redirectUrl = new URL('/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
