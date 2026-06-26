import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

    // Initialize the Supabase Client dynamically per request using the incoming cookies
const cookieStore = await cookies();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  }
);

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

    // This will now successfully read the cookie session!
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error("!! [SUPABASE AUTH ERROR]:", sessionError.message);
    }

    if (!sessionData?.session) {
      console.warn("-> [AUTH CONTEXT]: No active session found. Request is running as unauthenticated (Anon Key).");
    } else {
      const { user, expires_at } = sessionData.session;
      console.log("-> [AUTH CONTEXT]: Active Session Found!");
      console.log(`   - User ID: ${user?.id}`);
      console.log(`   - Role:   ${user?.role}`);
    }

    for (const element of discoveredElements) {
      const name = element.tags.name || `Local Shop (${element.tags.shop || 'Vendor'})`;
      const street = element.tags['addr:street'] || '';
      const num = element.tags['addr:housenumber'] || '';
      const addressString = street ? `${street} ${num}`.trim() : 'Local Coordinate Point';

      console.log(`   > Checking/Inserting Node ID ${element.id}: "${name}" at [${element.lat}, ${element.lon}]`);

      let { data: existingPlace } = await supabase
        .from('places')
        .select('*')
        .eq('latitude', element.lat)
        .eq('longitude', element.lon)
        .maybeSingle();

      let placeRecord = existingPlace;

      if (!placeRecord) {
        const { data: newPlace, error: insertErr } = await supabase
          .from('places')
          .insert({
            name: name,
            address: addressString,
            latitude: element.lat,
            longitude: element.lon
          })
          .select()
          .single();

        if (insertErr) {
          console.error(`   !! [SUPABASE INSERT ERROR] for "${name}":`, insertErr.message);
          continue;
        }
        placeRecord = newPlace;
      }

      if (placeRecord) {
        processedPlaces.push(placeRecord);
        
        await supabase.from('items').upsert({
          place_id: placeRecord.id,
          name: "Verified Market Staple",
          price: 2.80,
          category: "groceries",
          is_spicy: false
        }, { onConflict: 'id' });
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