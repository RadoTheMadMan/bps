import { NextResponse } from 'next/server';
import { createServerInstance } from '@/utils/supabase/server';

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

    const supabase = await createServerInstance();

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.warn("No active session found on the server.");
    } else {
      console.log("Current Logged In User ID:", session.user.id);
    }

    const radiusMeters = Math.round((radiusKm || 5) * 1000);
    console.log(`-> [STEP 2: TARGET PARAMETERS]: Lat: ${latitude}, Lon: ${longitude}, Range: ${radiusMeters} meters`);

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

    const processedPlaces: any[] = [];
    console.log(`-> [STEP 7: TRYING TO UPSERT GEO DATA TO SUPABASE IF THE SESSION IS VALID]`);

    if (!session) {
      console.warn("-> [AUTH CONTEXT]: No active session found. Request is running as unauthenticated (Anon Key).");
    } else {
      const { user } = session;
      console.log("-> [AUTH CONTEXT]: Active Session Found!");
      console.log(`   - User ID: ${user?.id}`);
      console.log(`   - Role:   ${user?.role}`);
    }

   const upsertPayload = discoveredElements.map((element: any) => {
      const hasAddress = !!(element.tags?.['addr:street']);
      const hasWebsite = !!(element.tags?.website);

      return {
        // NOTE: Ensure your DB column names match these keys exactly
        name: element.tags?.name || `Local Shop (${element.tags?.shop || 'Vendor'})`,
        address: [element.tags?.['addr:street'], element.tags?.['addr:housenumber']]
          .filter(Boolean)
          .join(' ') || 'Local Coordinate Point',
        latitude: element.lat,
        longitude: element.lon,
        website: element.tags?.website || null, // Capture native OSM website if it exists
        
        // Track whether this node requires deeper scraping later
        enrichment_status: (hasAddress && hasWebsite) ? 'enriched' : 'raw_coordinates'
      };
    });

    const { data, error } = await supabase
      .from('places')
      .upsert(upsertPayload, {
        // If your table relies on a unique OSM ID or coordinate constraint instead of a auto-UUID, 
        // make sure it is included in the payload and targeted here in 'onConflict'.
        onConflict: 'latitude,longitude', 
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      console.error('Bulk upsert failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log(`-> [STEP 8: UPSERT SUCCESS]: ${data?.length ?? 0} entries successfully upserted to Supabase.`);
    console.log('-> [STEP 9: ENRICHMENT QUEUEING]: Triggered safe async enrichment worker.');

    try {
      const enrichUrl = new URL('/api/enrich', req.url).toString();
      const enrichResponse = await fetch(enrichUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchSize: 10 }),
      });

      if (!enrichResponse.ok) {
        const enrichError = await enrichResponse.text();
        console.warn('-> [ENRICH WORKER]: Enrich endpoint returned an error:', enrichError);
      } else {
        const result = await enrichResponse.json();
        console.log('-> [ENRICH WORKER]: Triggered safe batch enrichment', result);
      }
    } catch (workerError) {
      console.warn('-> [ENRICH WORKER]: Failed to call background enrichment endpoint:', workerError);
    }

  
    console.log('================ [SCAN LOG END] ================');

    return NextResponse.json({ success: true, count: data?.length ?? 0, places: data || [] });
  } catch (err: any) {
    console.error("❌ [CRITICAL ENDPOINT CRASH LOG]:", err.message);
    console.log("================ [SCAN LOG END] ================");
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}