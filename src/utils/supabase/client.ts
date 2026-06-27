import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const globalClientKey = '__SUPABASE_BROWSER_CLIENT__';

const browserSupabase =
  typeof window !== 'undefined'
    ? (globalThis as any)[globalClientKey] ??= createBrowserClient(supabaseUrl, supabaseAnonKey)
    : undefined;

if (!browserSupabase) {
  throw new Error(
    'Supabase browser client must be initialized in a client-side context. Import this file only from "use client" components.'
  );
}

export const supabase = browserSupabase;
export const createClient = () => supabase;