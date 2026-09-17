import type { SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

// The admin UI uses several dynamic Supabase relations whose generated types are
// not part of this small standalone dashboard. Keep the table boundary permissive
// while preserving the typed Supabase Auth API for strict TypeScript builds.
export function supabase(): SupabaseClient<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');

  const client = createBrowserClient(url, key);
  const originalSignOut = client.auth.signOut.bind(client.auth);
  client.auth.signOut = async (...args: Parameters<typeof client.auth.signOut>) => {
    const result = await originalSignOut(...args);
    if (!result.error && typeof window !== 'undefined') {
      window.location.assign('/');
    }
    return result;
  };
  return client;
}
