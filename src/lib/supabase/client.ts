import { createBrowserClient } from '@supabase/ssr';

/**
 * Create Supabase client for browser/client-side use (Next.js SSR pattern).
 * NOTE: This project uses Vite, so use VITE_ prefix, not NEXT_PUBLIC_.
 * The canonical browser client is at @/lib/supabase — use that instead.
 */
export function createClient() {
  return createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );
}