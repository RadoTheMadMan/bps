import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  console.log("================ [SCAN LOG START] ================");
  try {
    const body = await req.json();
    console.log("-> [STEP 1: INPUT DATA RECEIVED]:", JSON.stringify(body, null, 2));

    const { latitude, longitude, radiusKm } = body;
    if (!latitude || !longitude) {
      console.error("!! [ERROR]: Missing tracking coordinates in request body.");
      return NextResponse.json({ success: false, error: "Coordinates required" }, { status: 400 });
    }

    const radiusMeters = Math.round((radiusKm || 5) * 1000);
    console.log(`-> [STEP 2: TARGET PARAMETERS]: Lat: ${latitude}, Lon: ${longitude}, Range: ${radiusMeters} meters`);

    // Ultra-wide dragnet query to make sure we don't return an empty array
    const query = `[out:json][timeout:30];(node["shop"](around:${radiusMeters},${latitude},${longitude});node["amenity"="marketplace"](around:${radiusMeters},${latitude},${longitude});node["amenity"="fast_food"](around:${radiusMeters},${latitude},${longitude}););out body;`;
    console.log("-> [STEP 3: GENERATED OVERPASS QL]:", query);

    console.log("-> [STEP 4: DISPATCHING FETCH TO OVERPASS API...]");
    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'BalkanPocketSaver/1.0 (contact: dev@balkanpocketsaver.app)'
      }
    });

    console.log(`-> [STEP 5: OVERPASS RESPONSE STATUS]: ${overpassRes.status} ${overpassRes.statusText}`);
    
    if (!overpassRes.ok) {
      const errorText = await overpassRes.text();
      console.error("!! [OVERPASS FAILURE BODY]:", errorText);
      throw new Error(`Overpass gateway rejected execution with code ${overpassRes.status}`);
    }

    const overpassData = await overpassRes.json();
    const discoveredElements = overpassData.elements || [];
    console.log(`-> [STEP 6: DISCOVERED NODES COUNT]: Found ${discoveredElements.length} raw map entities.`);

    if (discoveredElements.length === 0) {
      console.warn("?? [WARN]: Overpass query returned a clean 0 entries for this area range.");
    }

    const processedPlaces = [];

    for (const element of discoveredElements) {
      const name = element.tags.name || `Local Shop (${element.tags.shop || 'Vendor'})`;
      const street = element.tags['addr:street'] || '';
      const num = element.tags['addr:housenumber'] || '';
      const addressString = street ? `${street} ${num}`.trim() : 'Local Coordinate Point';

      console.log(`   > Upserting Node ID ${element.id}: "${name}" at [${element.lat}, ${element.lon}]`);

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

      if (placeErr) {
        console.error(`   !! [SUPABASE PLACES ERROR] for "${name}":`, placeErr.message);
        continue;
      }

      if (placeRecord) {
        processedPlaces.push(placeRecord);
        
        // Instant stub seed tracking verification log
        const { error: itemErr } = await supabase.from('items').upsert({
          place_id: placeRecord.id,
          name: "Verified Market Staple",
          price: 2.80,
          category: "groceries",
          is_spicy: false
        });
        
        if (itemErr) console.error(`   !! [SUPABASE ITEMS ERROR] for execution sync:`, itemErr.message);
      }
    }

    console.log(`-> [STEP 7: SUCCESSFUL PIPELINE COMPLETION]: Transmitted ${processedPlaces.length} entries to client view.`);
    console.log("================ [SCAN LOG END] ================");
    return NextResponse.json({ success: true, count: processedPlaces.length, places: processedPlaces });

  } catch (err: any) {
    console.error("❌ [CRITICAL ENDPOINT CRASH LOG]:", err.message);
    console.log("================ [SCAN LOG END] ================");
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}