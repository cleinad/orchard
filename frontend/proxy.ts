import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isPublicPage(pathname: string) {
  return pathname === '/' || pathname === '/login' || pathname === '/signup';
}

function isE2eBypassRoute(pathname: string) {
  return pathname.startsWith('/home') || pathname.startsWith('/workspaces');
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const bypassHomeAuth =
    process.env.KEEN_E2E_BYPASS_AUTH === '1'
    && isE2eBypassRoute(pathname)
    && request.nextUrl.searchParams.has('e2e');

  if (bypassHomeAuth) {
    return response;
  }

  if (isPublicPage(pathname)) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    const redirectTarget = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set('redirect', redirectTarget);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
