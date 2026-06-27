'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { getBrowserSupabase } from '@/utils/supabase/client';

const MapWidget = dynamic(() => import('@/components/MapWidget'), { ssr: false });

export default function MobileDashboard() {
  const [userLocation, setUserLocation] = useState<[number, number]>([42.5046, 27.4626]); 
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [places, setPlaces] = useState<any[]>([]);
  const [activePlace, setActivePlace] = useState<any>(null);
  const [scanning, setScanning] = useState<boolean>(false);

  // Sync existing database state
  const syncDatabaseView = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setPlaces(data);
    }
  }, []);

  // Manual Trigger for Scraper Pipeline
  const handleManualScan = async () => {
    if (scanning) return;
    setScanning(true);
    
    try {
      console.log(`-> Initiating target scan: Lat: ${userLocation[0]}, Lon: ${userLocation[1]}, Rad: ${radiusKm}km`);
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          latitude: userLocation[0], 
          longitude: userLocation[1], 
          radiusKm: radiusKm 
        })
      });
      
      const resData = await res.json();
      if (resData.success) {
        // Instantly refresh frontend view with newly added places
        await syncDatabaseView();
      }
    } catch (err) {
      console.error("Manual target scanning failed:", err);
    } finally {
      setScanning(false);
    }
  };

  // Handle initial page load and device location positioning ONCE
  useEffect(() => {
    syncDatabaseView();

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn("Location permission deferred. Sticking to default Burgas coordinates.", err.message);
        },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    }
    // Clean array guarantees this ONLY executes once when the map mounts
  }, [syncDatabaseView]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-md mx-auto border-x border-zinc-900 pb-24 shadow-2xl">
      <header className="p-4 border-b border-zinc-900 sticky top-0 bg-zinc-950/90 backdrop-blur z-40 flex justify-between items-center">
        <h1 className="text-xl font-black text-red-600 tracking-wider">BALKAN POCKET SAVER</h1>
        <div className="flex items-center space-x-2">
          {scanning && (
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          )}
          <span className="text-xs font-mono uppercase tracking-tight text-zinc-400">
            {scanning ? 'SCANNING LIVE...' : 'SYSTEM READY'}
          </span>
        </div>
      </header>

      <div className="p-4 flex-1 space-y-4 overflow-y-auto">
        {/* Spatial Radius Box & Target Scan Button */}
        <div className="bg-zinc-900 p-4 border border-zinc-850 rounded-lg space-y-4">
          <div>
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

          <button
            onClick={handleManualScan}
            disabled={scanning}
            className={`w-full py-3 rounded uppercase text-xs font-black tracking-widest transition duration-200 border ${
              scanning 
                ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' 
                : 'bg-red-600 hover:bg-red-700 border-red-700 text-white shadow-md active:scale-[0.98]'
            }`}
          >
            {scanning ? 'Processing Map Data...' : 'Scan Current Area'}
          </button>
        </div>

        {/* Dynamic Leaflet Target Map Box */}
        <div className="w-full h-[400px] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 relative">
          <MapWidget 
            userLocation={userLocation} 
            places={places} 
            radiusKm={radiusKm} 
            onMarkerClick={(p) => setActivePlace(p)} 
          />
        </div>

        {/* Real-time Metric Aggregator */}
        <div className="text-xs font-mono text-zinc-500 text-center uppercase tracking-wider">
          Tracking <span className="text-zinc-200 font-black">{places.length}</span> Active Local Vendors
        </div>
      </div>

      {/* Target Modal Sheets */}
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