export const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1';
export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

export type PlaceRecord = {
  id: number;
  name?: string;
  website?: string | null;
  address?: string | null;
  enrichment_status?: string | null;
  latitude?: number;
  longitude?: number;
};

export async function firecrawlRequest(path: string, body: Record<string, unknown>) {
  if (!FIRECRAWL_API_KEY) {
    throw new Error('FIRECRAWL_API_KEY is not configured.');
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

export function buildFirecrawlSearchQuery(place: PlaceRecord) {
  const baseName = place.name || 'local business';
  const address = place.address && place.address !== 'Local Coordinate Point' ? place.address : '';
  return `${baseName} ${address} website address`.trim();
}

export async function enrichPlaceWithFirecrawl(place: PlaceRecord, supabase: any) {
  if (!FIRECRAWL_API_KEY) {
    console.log('-> [FIRECRAWL]: Skipping enrichment because FIRECRAWL_API_KEY is not configured.');
    return false;
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

      console.log(`-> [FIRECRAWL SEARCH RESULT]: ${JSON.stringify(searchData)}`);
      const firstResult = Array.isArray(searchData?.data) ? searchData.data[0] : null;
      discoveredUrl = firstResult?.url || firstResult?.website || null;
      discoveredSnippet = firstResult?.snippet || firstResult?.markdown || '';
    }

    if (!discoveredUrl) {
      console.log(`-> [FIRECRAWL]: No discoverable URL found for ${place.name}`);
      await supabase.from('places').update({ enrichment_status: 'failed' }).eq('id', place.id);
      return false;
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

    console.log(`-> [FIRECRAWL UPDATE]: ${place.name} -> ${JSON.stringify(updatePayload)}`);
    await supabase.from('places').update(updatePayload).eq('id', place.id);
    return true;
  } catch (error) {
    console.error(`-> [FIRECRAWL ERROR] Failed enrichment for ${place.id}:`, error);
    await supabase.from('places').update({ enrichment_status: 'raw_coordinates' }).eq('id', place.id);
    return false;
  }
}
