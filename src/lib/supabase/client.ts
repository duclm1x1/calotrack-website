import { createBrowserClient } from '@supabase/ssr';

/**
 * Create Supabase client for browser/client components
 * Uses public anon key - safe to expose
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
