import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const createServerInstance = async () => {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: async () => {
        return cookieStore.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }));
      },
      setAll: async (cookiesToSet, headers) => {
        for (const cookie of cookiesToSet) {
          cookieStore.set({
            name: cookie.name,
            value: cookie.value,
            ...cookie.options,
          });
        }
        Object.entries(headers).forEach(([name, value]) => {
          try {
            // `next/headers` does not expose a direct response header setter here,
            // but if the runtime supports it, this will be a no-op or preserved.
            // In most App Router routes the response headers are handled by Next.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (cookieStore as any).headers?.set?.(name, value);
          } catch {
            // ignore if unsupported
          }
        });
      },
    },
  });
};