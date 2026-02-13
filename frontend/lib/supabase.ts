import { createBrowserClient } from '@supabase/ssr';

// Get Supabase URL and anon key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

/**
 * Supabase client for browser/client-side usage
 * Uses @supabase/ssr to store auth tokens in cookies instead of localStorage
 * This allows the proxy (middleware) to read the session server-side
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
