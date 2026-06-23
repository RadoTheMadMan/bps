import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const { latitude, longitude, radiusKm } = await req.json();
    const radiusMeters = radiusKm * 1000;

    // 1. OVERPASS API DATA FETCH
    const overpassQuery = `
      [out:json][timeout:25];
      (
        node["shop"="supermarket"](around:${radiusMeters},${latitude},${longitude});
        node["shop"="grocery"](around:${radiusMeters},${latitude},${longitude});
        node["shop"="bakery"](around:${radiusMeters},${latitude},${longitude});
        node["amenity"="fast_food"](around:${radiusMeters},${latitude},${longitude});
      );
      out body;
    `;
    
    const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: overpassQuery
    });
    const overpassData = await overpassRes.json();

    const processedPlaces = [];

    // 2. ITERATE DISCOVERED POIs & CRAWL DATA
    for (const element of overpassData.elements || []) {
      const name = element.tags.name || 'Local Store';
      const website = element.tags.website || element.tags['contact:website'] || null;
      
      // Upsert place record to get a static UUID
      const { data: placeRecord, error: placeErr } = await supabase
        .from('places')
        .upsert({
          name: name,
          address: element.tags['addr:street'] ? `${element.tags['addr:street']} ${element.tags['addr:housenumber'] || ''}` : 'Local Coordinates',
          latitude: element.lat,
          longitude: element.lon
        }, { onConflict: 'name,latitude,longitude' })
        .select()
        .single();

      if (placeErr || !placeRecord) continue;

      // 3. FIREHAWK FIRECRAWL EXECUTION (Only if a store website link exists)
      if (website && process.env.FIRECRAWL_API_KEY) {
        try {
          const firecrawlRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`
            },
            body: JSON.stringify({
              url: website,
              pageOptions: { onlyMainContent: true },
              extractorOptions: {
                // Keep concurrency explicitly constrained to 2 pages max
                limit: 2,
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { name: { type: "string" }, price: { type: "number" } }
                      }
                    }
                  }
                }
              }
            })
          });

          const crawlData = await firecrawlRes.json();
          const scrapedItems = crawlData.data?.extractedData?.items || [];

          // DELTA-ONLY ROW UPDATE VERIFICATION
          for (const sItem of scrapedItems) {
            const { data: existingItem } = await supabase
              .from('items')
              .select('id, price')
              .eq('place_id', placeRecord.id)
              .eq('name', sItem.name)
              .single();

            if (!existingItem || Number(existingItem.price) !== Number(sItem.price)) {
              await supabase.from('items').upsert({
                place_id: placeRecord.id,
                name: sItem.name,
                price: sItem.price,
                updated_at: new Date().toISOString()
              });
            }
          }
        } catch (e) {
          console.error("Firecrawl limit or network blockade hit:", e);
        }
      }
      processedPlaces.push(placeRecord);
    }

    return NextResponse.json({ success: true, count: processedPlaces.length });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}