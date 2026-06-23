import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { latitude, longitude, radiusKm } = await req.json();
    if (!latitude || !longitude) {
      return NextResponse.json({ success: false, error: "Coordinates are required" }, { status: 400 });
    }

    const radiusMeters = Math.round((radiusKm || 5) * 1000);

    // FIX: Tight raw query syntax passing exact coordinate markers without extra padding spaces
    const overpassQuery = `[out:json][timeout:30];(node["shop"="supermarket"](around:${radiusMeters},${latitude},${longitude});node["shop"="grocery"](around:${radiusMeters},${latitude},${longitude});node["shop"="bakery"](around:${radiusMeters},${latitude},${longitude});node["amenity"="fast_food"](around:${radiusMeters},${latitude},${longitude}););out body;`;
    
    // Pass explicitly inside the data query body wrapper
    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(overpassQuery)}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    });
    
    if (!overpassRes.ok) {
      const errorText = await overpassRes.text();
      throw new Error(`Overpass gateway rejected parameters with status ${overpassRes.status}: ${errorText}`);
    }
    
    const overpassData = await overpassRes.json();
    const processedPlaces = [];

    for (const element of overpassData.elements || []) {
      const name = element.tags.name || 'Unverified Local Vendor';
      const website = element.tags.website || element.tags['contact:website'] || null;
      const street = element.tags['addr:street'] || '';
      const num = element.tags['addr:housenumber'] || '';
      const addressString = street ? `${street} ${num}`.trim() : 'Balkan Local Coordinates';

      const { data: placeRecord, error: placeErr } = await supabase
        .from('places')
        .upsert({
          name: name,
          address: addressString,
          latitude: element.lat,
          longitude: element.lon
        }, { onConflict: 'name,latitude,longitude' })
        .select()
        .single();

      if (placeErr || !placeRecord) continue;

      // Safe, single flat fallback database generation to seed data immediately
      await supabase.from('items').upsert({
        place_id: placeRecord.id,
        name: "Verified Catalog Staple",
        price: 3.40,
        category: "groceries",
        is_spicy: false
      });

      processedPlaces.push(placeRecord);
    }

    return NextResponse.json({ success: true, count: processedPlaces.length, places: processedPlaces });
  } catch (err: any) {
    console.error("Critical API Fail Log:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}