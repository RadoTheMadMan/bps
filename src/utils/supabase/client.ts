import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const globalClientKey = '__SUPABASE_BROWSER_CLIENT__';

export const getBrowserSupabase = () => {
  if (typeof window === 'undefined') {
    throw new Error(
      'Supabase browser client can only be initialized in a browser runtime. Call getBrowserSupabase() from a client-side component or handler.'
    );
  }

  const globalAny = globalThis as any;
  return globalAny[globalClientKey] ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
};