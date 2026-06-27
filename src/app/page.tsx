// app/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Session } from '@supabase/supabase-js';
import { getBrowserSupabase } from '@/utils/supabase/client';
import { UserProfile } from '@/types/database';

export default function TestHubPage() {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check initial auth state
    async function loadSession() {
      const supabase = getBrowserSupabase();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSessionUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    }

    loadSession();

    // Listen for auth adjustments during testing
    const supabase = getBrowserSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSessionUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!error && data) setProfile(data as UserProfile);
  };

  if (loading) return <div className="p-8 text-zinc-400 font-mono">Initializing System Terminal...</div>;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 font-mono p-8 flex flex-col justify-between">
      {/* Top Banner / Identity Matrix */}
      <div className="border border-zinc-800 p-6 bg-zinc-900/50 rounded shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold tracking-wider text-red-500">ANTI-BROKE TEST PANEL v1.0</h1>
          <span className={`text-xs px-2 py-1 rounded border ${sessionUser ? 'border-green-500 text-green-400 bg-green-950/30' : 'border-amber-500 text-amber-400 bg-amber-950/30'}`}>
            STATUS: {sessionUser ? 'AUTHENTICATED' : 'ANONYMOUS TERMINAL'}
          </span>
        </div>

        {sessionUser ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-zinc-950 p-4 border border-zinc-800 rounded">
            <div>
              <p className="text-zinc-400">User ID: <span className="text-zinc-200">{sessionUser.id}</span></p>
              <p className="text-zinc-400">Identity Target: <span className="text-zinc-200">{sessionUser.email}</span></p>
            </div>
            {profile && (
              <div>
                <p className="text-zinc-400">Deductible Margin: <span className="text-red-400">${profile.deductibles}</span></p>
                <p className="text-zinc-400">Target Budget Limit: <span className="text-blue-400">${profile.target_budget}</span></p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 italic">No active session found. Database operations restricted to anon schema policies.</p>
        )}
      </div>

      {/* Navigation Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 my-8">
        <Link href="/login" className="p-6 border border-zinc-800 bg-zinc-900 rounded hover:border-red-500 transition-all group">
          <h3 className="font-bold text-lg group-hover:text-red-400 transition-colors">01 // Authentication</h3>
          <p className="text-xs text-zinc-500 mt-2">Test registrations, DB triggers, logins, and key updates.</p>
        </Link>

        <Link href="/dashboard" className="p-6 border border-zinc-800 bg-zinc-900 rounded hover:border-blue-500 transition-all group">
          <h3 className="font-bold text-lg group-hover:text-blue-400 transition-colors">02 // Financial View</h3>
          <p className="text-xs text-zinc-500 mt-2">Verify real-time database CRUD streams and reactive metrics updates.</p>
        </Link>

        <Link href="/settings" className="p-6 border border-zinc-800 bg-zinc-900 rounded hover:border-green-500 transition-all group">
          <h3 className="font-bold text-lg group-hover:text-green-400 transition-colors">03 // System Constants</h3>
          <p className="text-xs text-zinc-500 mt-2">Test budget constraints, calculation engines, and inputs limit validation.</p>
        </Link>

        <Link href="/map" className="p-6 border border-zinc-800 bg-zinc-900 rounded hover:border-purple-500 transition-all group">
          <h3 className="font-bold text-lg group-hover:text-purple-400 transition-colors">04 // Geo Navigation</h3>
          <p className="text-xs text-zinc-500 mt-2">Access your map engine, scrape node tracking, and spatial routines.</p>
        </Link>
      </div>

      {/* Terminal Footer */}
      <div className="text-center text-[10px] text-zinc-600 border-t border-zinc-900 pt-4">
        Framework compiled successfully. Execution loops online.
      </div>
    </main>
  );
}