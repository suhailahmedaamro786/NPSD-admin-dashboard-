import { createBrowserClient } from '@supabase/ssr';

// The admin UI uses several dynamic Supabase relations whose generated types are
// not part of this small standalone dashboard. Keep the client boundary untyped
// so Netlify's strict TypeScript check does not infer incompatible query shapes.
export function supabase(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createBrowserClient(url, key);
}
