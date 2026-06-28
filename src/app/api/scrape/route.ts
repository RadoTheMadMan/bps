import { NextResponse } from 'next/server';
import { createServerInstance } from '@/utils/supabase/server';

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

async function firecrawlRequest(path: string, body: Record<string, unknown>) {
  if (!FIRECRAWL_API_KEY) {
    return null;
  }

  const response = await fetch(`${FIRECRAWL_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firecrawl request failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

function buildFirecrawlSearchQuery(place: Record<string, any>) {
  const baseName = place.name || 'local business';
  const address = place.address && place.address !== 'Local Coordinate Point' ? place.address : '';
  return `${baseName} ${address} website address`.trim();
}

async function enrichPlaceWithFirecrawl(place: Record<string, any>, supabase: any) {
  if (!FIRECRAWL_API_KEY) {
    console.log('-> [FIRECRAWL]: Skipping enrichment because FIRECRAWL_API_KEY is not configured.');
    return;
  }

  try {
    console.log(`-> [FIRECRAWL RUNNING]: Deep searching for ${place.name}`);

    let discoveredUrl: string | null = null;
    let discoveredSnippet = '';

    if (typeof place.website === 'string' && place.website.startsWith('http')) {
      const scrapeData = await firecrawlRequest('/scrape', {
        url: place.website,
        formats: ['markdown'],
      });

      discoveredUrl = place.website;
      discoveredSnippet = scrapeData?.markdown || scrapeData?.content || '';
    } else {
      const searchData = await firecrawlRequest('/search', {
        query: buildFirecrawlSearchQuery(place),
        limit: 3,
      });

            console.log(`Scraping search data for ${place.name} with the following query: ${searchData}`);

      const firstResult = Array.isArray(searchData?.data) ? searchData.data[0] : null;
      discoveredUrl = firstResult?.url || firstResult?.website || null;
      discoveredSnippet = firstResult?.snippet || firstResult?.markdown || '';
    }

    if (!discoveredUrl) {
      console.log(`-> [FIRECRAWL]: No discoverable URL found for ${place.name}`);
      return;
    }

    const updatePayload: Record<string, unknown> = {
      enrichment_status: 'enriched',
      website: discoveredUrl,
    };

    if (typeof discoveredSnippet === 'string' && discoveredSnippet.length > 0 && (!place.address || place.address === 'Local Coordinate Point')) {
      const addressHint = discoveredSnippet.match(/\b\d+\s+[A-Za-z0-9 .,'-]+\b/);
      if (addressHint?.[0]) {
        updatePayload.address = addressHint[0];
      }
    }
    console.log(`Firecrawl data for ${place.name} is: ${updatePayload}`)
    await supabase.from('places').update(updatePayload).eq('id', place.id);
  } catch (error) {
    console.error(`-> [FIRECRAWL ERROR] Failed background fetch for ${place.id}:`, error);
  }
}

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

    // Get the places again after the upsert so they can be enriched.
    // Ensure we extract the row array (`data`) and push rows, not the full response object.
    const { data: fetchedPlacesData, error: fetchError } = await supabase
      .from('places')
      .select('*')
      .limit(1000);

    if (fetchError) {
      console.error('Failed to fetch places after upsert:', fetchError.message || fetchError);
    }

    const fetchedRows = fetchedPlacesData || [];
    console.log(`-> [STEP 8.1: DB FETCH COMPLETE]: ${fetchedRows.length} places retrieved from Supabase.`);
    processedPlaces.push(...fetchedRows);

    console.log(`-> [STEP 9: ENRICHMENT TARGETING]`);

    // FIRECRAWL ENRICHMENT PIPELINE
    const targetsToEnrich = processedPlaces.filter((place: any) => place.enrichment_status === 'raw_coordinates');
    console.log(`-> [STEP 9.1: ENRICHMENT QUEUE]: ${targetsToEnrich.length} places marked raw_coordinates.`);
    if (targetsToEnrich.length > 0) {
      console.log(`-> [ENRICHMENT PIPELINE]: Beginning enrichment for ${targetsToEnrich.length} place(s).`);
      for (const place of targetsToEnrich) {
        console.log(`-> [FIRECRAWL]: Enriching place ${place.name} (ID: ${place.id})`);
        await enrichPlaceWithFirecrawl(place, supabase);
      }
      console.log(`-> [ENRICHMENT PIPELINE]: Completed enrichment for ${targetsToEnrich.length} place(s).`);
    }

    console.log(`-> [PIPELINE COMPLETED]`);
    console.log('================ [SCAN LOG END] ================');
    return NextResponse.json({ success: true, count: processedPlaces.length, places: processedPlaces });
  } catch (err: any) {
    console.error("❌ [CRITICAL ENDPOINT CRASH LOG]:", err.message);
    console.log("================ [SCAN LOG END] ================");
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}