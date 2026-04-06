import { NextResponse, NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Proxy function to protect routes from unauthenticated users
 * This runs BEFORE routes are rendered, making it ideal for authentication checks
 * 
 * Uses @supabase/ssr to properly handle cookie-based authentication
 * so we can verify sessions server-side without needing localStorage
 */
export async function proxy(request: NextRequest) {
  // Create a response that we can modify (for cookie updates)
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const bypassHomeAuth =
    process.env.KEEN_E2E_BYPASS_AUTH === '1'
    && pathname.startsWith('/home')
    && request.nextUrl.searchParams.has('e2e');

  if (bypassHomeAuth) {
    return response;
  }

  // Create a Supabase client that reads/writes cookies
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      // Read cookies from the request
      getAll() {
        return request.cookies.getAll();
      },
      // Write cookies to both request and response (handles token refresh)
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        // Create a new response with updated cookies
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

  // Get the current user session from cookies
  const { data: { user } } = await supabase.auth.getUser();

  // Protect the /home route and all nested paths
  if (pathname.startsWith('/home')) {
    if (!user) {
      // No authenticated user found, redirect to login
      const loginUrl = new URL('/login', request.url);
      // Preserve the original destination so we can redirect back after login
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Allow the request to proceed (with any updated cookies)
  return response;
}

// Configure which routes this proxy applies to
export const config = {
  // Match /home and all nested paths under /home
  matcher: ['/home/:path*'],
};
