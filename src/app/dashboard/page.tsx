'use client';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/utils/supabase/client';
import { UserProfile, MapPlace } from '@/types/database';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    // 1. Hook up the Realtime engine instantly
    const channel = supabase
      .channel('realtime-dashboard')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload: any) => {
        setProfile(payload.new as UserProfile);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">Financial Status Command</h1>
      {profile && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 border rounded"><strong>Income:</strong> ${profile.monthly_income}</div>
          <div className="p-4 border rounded"><strong>Fixed Bills:</strong> ${profile.bill_expenses}</div>
          <div className="p-4 border rounded bg-red-950 text-red-200"><strong>Deductible Margin:</strong> ${profile.deductibles}</div>
          <div className="p-4 border rounded bg-slate-900 text-white"><strong>Target Budget Limit:</strong> ${profile.target_budget}</div>
        </div>
      )}
      
      <div className="mt-6 p-4 border rounded">
        <h3 className="font-semibold mb-2">Ingested Geo-Data Nodes</h3>
        {/* Render your map scraping data loops here */}
      </div>
    </div>
  );
}