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

    const processedPlaces = [];
    console.log(`-> [STEP 6: TRYING TO UPSERT GEO DATA TO SUPABASE IF THE SESSION IS VALID]`);

    if (!session) {
      console.warn("-> [AUTH CONTEXT]: No active session found. Request is running as unauthenticated (Anon Key).");
    } else {
      const { user } = session;
      console.log("-> [AUTH CONTEXT]: Active Session Found!");
      console.log(`   - User ID: ${user?.id}`);
      console.log(`   - Role:   ${user?.role}`);
    }

    const upsertPayload = discoveredElements.map((element: any) => ({
      name: element.tags?.name || `Local Shop (${element.tags?.shop || 'Vendor'})`,
      address: [element.tags?.['addr:street'], element.tags?.['addr:housenumber']]
        .filter(Boolean)
        .join(' ') || 'Local Coordinate Point',
      latitude: element.lat,
      longitude: element.lon,
    }));

    const { data, error } = await supabase
      .from('places')
      .upsert(upsertPayload, {
        onConflict: 'id',
        ignoreDuplicates: true,
      })
      .select();

    if (error) {
      console.error('Bulk upsert failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log(`-> [STEP 6: UPSERT SUCCESS]: ${data?.length ?? 0} entries successfully upserted to Supabase.`);
    processedPlaces.push(...(data ?? []));

    console.log(`-> [STEP 7: SUCCESSFUL PIPELINE COMPLETION]: Transmitted ${processedPlaces.length} entries to client view.`);
    console.log('================ [SCAN LOG END] ================');
    return NextResponse.json({ success: true, count: processedPlaces.length, places: processedPlaces });

  } catch (err: any) {
    console.error("❌ [CRITICAL ENDPOINT CRASH LOG]:", err.message);
    console.log("================ [SCAN LOG END] ================");
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
    }