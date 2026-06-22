'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BudgetDashboard() {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [preferredRadius, setPreferredRadius] = useState<number>(5);
  const [items, setItems] = useState<any[]>([]);
  const [activeModalStore, setActiveModalStore] = useState<any>(null);

  // Sync and backfill user profiles instantly from auth metadata
  useEffect(() => {
    async function syncUserProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profile) {
        const { data: newProfile } = await supabase
          .from('users')
          .insert([{ id: user.id, email: user.email, preferred_radius_km: 5.0, payment_plan_fixed_rate: 15.00 }])
          .select()
          .single();
        setUserProfile(newProfile);
      } else {
        setUserProfile(profile);
        setPreferredRadius(Number(profile.preferred_radius_km));
      }
    }
    syncUserProfile();
  }, []);

  // Fetch items joined to their specific place UUID
  const loadGeofencedItems = async () => {
    const { data, error } = await supabase
      .from('items')
      .select(`
        id, name, price, is_spicy,
        places ( id, name, address, latitude, longitude )
      `);
    if (!error && data) setItems(data);
  };

  useEffect(() => { loadGeofencedItems(); }, []);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans selection:bg-red-600">
      <header className="border-b border-zinc-850 pb-4 mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-black tracking-wider text-red-600 uppercase">Balkan Pocket Saver</h1>
        {userProfile && <span className="text-sm text-zinc-400">Plan Rate: €{userProfile.payment_plan_fixed_rate}</span>}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Control Panel */}
        <section className="bg-zinc-900 border border-zinc-800 p-5 rounded-lg space-y-4">
          <h2 className="font-bold text-lg text-zinc-300 uppercase tracking-wide">Radius Constraints</h2>
          <label className="block text-xs uppercase tracking-widest text-zinc-500">Active Radius (KM)</label>
          <input 
            type="range" min="1" max="50" value={preferredRadius} 
            onChange={(e) => setPreferredRadius(Number(e.target.value))}
            className="w-full accent-red-600 bg-zinc-800 h-2 rounded"
          />
          <div className="text-right font-mono text-sm text-red-500">{preferredRadius} KM Max Range</div>
        </section>

        {/* Center Item Stream */}
        <section className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
          <h2 className="font-bold text-lg text-zinc-300 uppercase tracking-wide mb-4">Nearby Verified Stores</h2>
          <div className="space-y-3">
            {items.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setActiveModalStore(item.places)}
                className="p-4 bg-zinc-950 border border-zinc-850 hover:border-red-600/50 transition cursor-pointer rounded flex justify-between items-center"
              >
                <div>
                  <h3 className="font-bold text-zinc-200">{item.name}</h3>
                  <p className="text-xs text-zinc-500">{item.places?.name} — {item.places?.address}</p>
                </div>
                <span className="font-mono font-bold text-red-500">BGN {item.price}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Persistent Navigation Modal */}
      {activeModalStore && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 max-w-lg w-full rounded-lg p-6 relative shadow-2xl">
            <button 
              onClick={() => setActiveModalStore(null)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-100 font-bold transition text-xl"
            >✕</button>
            <h3 className="text-xl font-black uppercase text-zinc-100 mb-2">{activeModalStore.name}</h3>
            <p className="text-sm text-zinc-400 mb-4">{activeModalStore.address}</p>
            
            <a 
              href={`https://www.google.com/maps/search/?api=1&query=${activeModalStore.latitude},${activeModalStore.longitude}`}
              target="_blank" rel="noopener noreferrer"
              className="block w-full text-center bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded uppercase tracking-wider transition text-sm"
            >
              Launch Navigation Routes
            </a>
          </div>
        </div>
      )}
    </main>
  );
}