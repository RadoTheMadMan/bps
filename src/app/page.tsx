'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MapWidget = dynamic(() => import('@/components/MapWidget'), { ssr: false });

export default function MobileDashboard() {
  const [userLocation, setUserLocation] = useState<[number, number]>([42.5046, 27.4626]); 
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [places, setPlaces] = useState<any[]>([]);
  const [activePlace, setActivePlace] = useState<any>(null);
  const [scanning, setScanning] = useState<boolean>(false);

  // Sync state data from the actual database tables
  const syncDatabaseView = async () => {
    const { data } = await supabase.from('places').select('*');
    if (data) setPlaces(data);
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setUserLocation([pos.coords.latitude, pos.coords.longitude]);
      });
    }
    syncDatabaseView();
  }, []);

  const triggerPipelineScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: userLocation[0], longitude: userLocation[1], radiusKm })
      });
      const data = await res.json();
      if (data.success) {
        await syncDatabaseView();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto border-x border-zinc-900 pb-24 shadow-2xl">
      <header className="p-4 border-b border-zinc-900 sticky top-0 bg-zinc-950/90 backdrop-blur z-40 flex justify-between items-center">
        <h1 className="text-xl font-black text-red-600 tracking-wider">BALKAN POCKET SAVER</h1>
        <button 
          onClick={triggerPipelineScan}
          disabled={scanning}
          className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-mono text-xs px-3 py-2 rounded uppercase font-bold transition"
        >
          {scanning ? 'SCANNING...' : 'SCAN AREA'}
        </button>
      </header>

      <div className="p-4 flex-1 space-y-4 overflow-y-auto">
        <div className="bg-zinc-900 p-4 border border-zinc-850 rounded-lg">
          <div className="flex justify-between text-xs font-mono uppercase text-zinc-400 mb-2">
            <span>Range Target</span>
            <span className="text-red-500 font-bold">{radiusKm} KM</span>
          </div>
          <input 
            type="range" min="1" max="25" value={radiusKm} 
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full accent-red-600 bg-zinc-800 h-2 rounded"
          />
        </div>

        <div className="w-full h-[350px] rounded-lg overflow-hidden border border-zinc-800">
          <MapWidget 
            userLocation={userLocation} 
            places={places} 
            radiusKm={radiusKm} 
            onMarkerClick={(p) => setActivePlace(p)} 
          />
        </div>
      </div>

      {activePlace && (
        <div className="fixed inset-x-0 bottom-0 bg-zinc-900 border-t border-zinc-800 p-6 z-50 rounded-t-2xl max-w-md mx-auto shadow-2xl">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight text-zinc-100">{activePlace.name}</h3>
              <p className="text-xs text-zinc-400">{activePlace.address}</p>
            </div>
            <button onClick={() => setActivePlace(null)} className="text-zinc-500 hover:text-zinc-100 font-bold p-1 text-lg">✕</button>
          </div>
          
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${activePlace.latitude},${activePlace.longitude}`}
            target="_blank" rel="noopener noreferrer"
            className="block w-full text-center bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded uppercase text-xs tracking-widest transition"
          >
            Launch Route Navigation
          </a>
        </div>
      )}
    </main>
  );
}