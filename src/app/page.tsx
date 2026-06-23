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
  // Set explicit fallback coordinates (Burgas center) so it never renders open ocean
  const [userLocation, setUserLocation] = useState<[number, number]>([42.5046, 27.4626]); 
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [places, setPlaces] = useState<any[]>([]);
  const [activePlace, setActivePlace] = useState<any>(null);
  const [scanning, setScanning] = useState<boolean>(false);

  // Read data points directly from your Supabase location log table
 const syncDatabaseView = async () => {
  const { data, error } = await supabase
    .from('places')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (!error && data && data.length > 0) {
    setPlaces(data);
  } else {
    // FORCE A HARDCODED TESTING PIN RIGHT NEXT TO ODRIN STREET TO PROVE RENDERING WORKS
    setPlaces([
      {
        id: 'test-uuid-12345',
        name: 'HELLRIDER SUPPLIES (TEST VENDOR)',
        address: 'ul. Odrin, Burgas',
        latitude: 42.5065,  // Just slightly north of your current pin
        longitude: 27.4610
      }
    ]);
  }
};

  // Request browser geolocation paths immediately on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => console.warn("Geolocation permission deferred, using default anchors:", err.message),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    syncDatabaseView();
  }, []);

  const triggerPipelineScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          latitude: userLocation[0], 
          longitude: userLocation[1], 
          radiusKm 
        })
      });
      
      const resData = await res.json();
      
      // Force database UI sync immediately if elements were logged
      if (resData.success) {
        await syncDatabaseView();
      }
    } catch (err) {
      console.error("Transmission error:", err);
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
          className="bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-mono text-xs px-3 py-2 rounded uppercase font-bold transition select-none"
        >
          {scanning ? 'SCANNING...' : 'SCAN AREA'}
        </button>
      </header>

      <div className="p-4 flex-1 space-y-4 overflow-y-auto">
        {/* Radius Range Slider Box */}
        <div className="bg-zinc-900 p-4 border border-zinc-850 rounded-lg">
          <div className="flex justify-between text-xs font-mono uppercase text-zinc-400 mb-2">
            <span>Range Target</span>
            <span className="text-red-500 font-bold">{radiusKm} KM</span>
          </div>
          <input 
            type="range" min="1" max="25" value={radiusKm} 
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full accent-red-600 bg-zinc-800 h-2 rounded cursor-pointer"
          />
        </div>

        {/* Height-constrained Leaflet Wrapper block */}
        <div className="w-full h-[380px] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 relative">
          <MapWidget 
            userLocation={userLocation} 
            places={places} 
            radiusKm={radiusKm} 
            onMarkerClick={(p) => setActivePlace(p)} 
          />
        </div>

        {/* Real-time Data Counter Badge */}
        <div className="text-xs font-mono text-zinc-500 text-center uppercase">
          Tracking <span className="text-zinc-300 font-bold">{places.length}</span> Active Local Vendors
        </div>
      </div>

      {/* Detail Popup Sheet */}
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