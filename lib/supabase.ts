import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// The admin UI uses several dynamic Supabase relations whose generated types are
// not part of this small standalone dashboard. Keep the table boundary permissive
// while preserving the typed Supabase Auth API for strict TypeScript builds.
export function supabase(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createBrowserClient(url, key);
}
