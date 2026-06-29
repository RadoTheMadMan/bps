export const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v1';
export const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

export type PlaceRecord = {
  id: number;
  name?: string;
  website?: string | null;
  address?: string | null;
  enrichment_status?: string | null;
  enrichment_score?: number | null;
  latitude?: number;
  longitude?: number;
};

class FirecrawlRequestError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'FirecrawlRequestError';
    this.status = status;
    this.details = details;
  }
}

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
    let details: unknown = errorText;
    try {
      details = JSON.parse(errorText);
    } catch {
      details = errorText;
    }
    const message = typeof details === 'object' && details !== null && 'error' in details
      ? `${(details as any).error}`
      : errorText;
    throw new FirecrawlRequestError(`Firecrawl request failed (${response.status}): ${message}`, response.status, details);
  }

  return response.json();
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getNameTokens(name?: string) {
  return normalizeText(name || '').split(' ').filter(Boolean);
}

function getSearchQueries(place: PlaceRecord) {
  const queries: string[] = [];
  const nameTokens = getNameTokens(place.name);
  const name = nameTokens.join(' ');
  const coords = place.latitude && place.longitude ? `${place.latitude.toFixed(4)} ${place.longitude.toFixed(4)}` : '';
  const addressHint = place.address && place.address !== 'Local Coordinate Point' ? place.address : '';

  if (name && coords) {
    queries.push(`${name} ${coords} website address`);
    queries.push(`${name} ${coords} business`);
  }

  if (name && addressHint) {
    queries.push(`${name} ${addressHint} website address`);
  }

  if (name) {
    queries.push(`${name} website address`);
  }

  if (coords) {
    queries.push(`business near ${coords} website address`);
  }

  return queries.filter(Boolean);
}

function getUrlHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.toLowerCase();
  }
}

function isGenericDomain(domain: string) {
  const generic = ['facebook.com', 'instagram.com', 'twitter.com', 'yelp.com', 'tripadvisor.com', 'yellowpages.com', 'google.com', 'bing.com', 'linkedin.com', 'foursquare.com'];
  return generic.some((entry) => domain.includes(entry));
}

function scoreSearchCandidate(place: PlaceRecord, candidate: any) {
  let score = 0;
  const placeNameTokens = getNameTokens(place.name);
  const title = normalizeText(candidate.title || candidate.name || '');
  const snippet = normalizeText(candidate.snippet || candidate.markdown || '');
  const url = candidate.url || candidate.website || '';
  const host = getUrlHost(url);
  const hostText = normalizeText(host);

  if (isGenericDomain(host)) {
    return -1;
  }

  if (placeNameTokens.length > 0) {
    const tokenMatches = placeNameTokens.filter((token) => title.includes(token) || snippet.includes(token) || hostText.includes(token));
    score += tokenMatches.length * 2;
  }

  if (place.address && typeof place.address === 'string') {
    const addressTokens = normalizeText(place.address).split(' ').filter(Boolean);
    const addressMatches = addressTokens.filter((token) => title.includes(token) || snippet.includes(token) || hostText.includes(token));
    score += Math.min(addressMatches.length, 2);
  }

  if (hostText.includes('bg') || hostText.includes('pl') || hostText.includes('de') || hostText.includes('uk') || hostText.includes('ca')) {
    score += 0.5;
  }

  if (candidate.url || candidate.website) {
    score += 1;
  }

  if (snippet.match(/\b\d+\s+[a-z0-9 .,'-]+\b/i)) {
    score += 1;
  }

  return score;
}

function extractAddressFromText(text: string) {
  const normalized = text.replace(/\n/g, ' ');
  const match = normalized.match(/\b\d+\s+[A-Za-z0-9 .,'-]+\b/);
  return match?.[0] ? match[0].trim() : null;
}

type ScoredCandidate = {
  result: any;
  score: number;
};

function chooseBestSearchResult(place: PlaceRecord, results: any[]): ScoredCandidate | null {
  const scored = results
    .map((result) => ({ result, score: scoreSearchCandidate(place, result) }))
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0] : null;
}

function buildFirecrawlSearchQuery(place: PlaceRecord) {
  const queries = getSearchQueries(place);
  return queries.length > 0 ? queries[0] : 'local business website address';
}

export async function enrichPlaceWithFirecrawl(place: PlaceRecord, supabase: any) {
  if (!FIRECRAWL_API_KEY) {
    console.log('-> [FIRECRAWL]: Skipping enrichment because FIRECRAWL_API_KEY is not configured.');
    return false;
  }

  try {
    console.log(`-> [FIRECRAWL RUNNING]: Deep searching for ${place.name || `location ${place.latitude},${place.longitude}`}`);

    const hasWebsite = typeof place.website === 'string' && place.website.startsWith('http');
    let discoveredUrl: string | null = null;
    let discoveredSnippet = '';

    if (hasWebsite) {
      const scrapeData = await firecrawlRequest('/scrape', {
        url: place.website,
        formats: ['markdown'],
      });

      discoveredUrl = place.website ?? null;
      discoveredSnippet = scrapeData?.markdown || scrapeData?.content || '';
      console.log(`-> [FIRECRAWL SCRAPE]: Existing website scraped for ${place.name}`);
    }

    let bestCandidate: ScoredCandidate | null = null;

    if (!discoveredUrl) {
      const queries = getSearchQueries(place);

      for (const query of queries) {
        const searchData = await firecrawlRequest('/search', {
          query,
          limit: 3,
        });

        const results = Array.isArray(searchData?.data) ? searchData.data : [];
        const candidate = chooseBestSearchResult(place, results);
        if (candidate && (!bestCandidate || candidate.score > bestCandidate.score)) {
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        discoveredUrl = bestCandidate.result.url || bestCandidate.result.website || null;
        discoveredSnippet = bestCandidate.result.snippet || bestCandidate.result.markdown || '';
        console.log(`-> [FIRECRAWL SEARCH]: Selected best candidate for ${place.name}: ${discoveredUrl} (score=${bestCandidate.score})`);
      }
    }

    if (!discoveredUrl) {
      console.log(`-> [FIRECRAWL]: No discoverable URL found for ${place.name}`);
      await supabase.from('places').update({ enrichment_status: 'failed' }).eq('id', place.id);
      return false;
    }

    const defaultScore = hasWebsite ? 2 : 1;
    const resultScore = bestCandidate?.score ?? defaultScore;
    const updatePayload: Record<string, unknown> = {
      enrichment_status: resultScore >= 3 ? 'enriched' : 'candidate',
      enrichment_score: resultScore,
      website: discoveredUrl,
    };

    if (typeof discoveredSnippet === 'string' && discoveredSnippet.length > 0 && (!place.address || place.address === 'Local Coordinate Point')) {
      const addressHint = extractAddressFromText(discoveredSnippet);
      if (addressHint) {
        updatePayload.address = addressHint;
      }
    }

    console.log(`-> [FIRECRAWL UPDATE]: ${place.name || place.id} -> ${JSON.stringify(updatePayload)}`);
    await supabase.from('places').update(updatePayload).eq('id', place.id);
    return true;
  } catch (error: unknown) {
    console.error(`-> [FIRECRAWL ERROR] Failed enrichment for ${place.id}:`, error);

    const shouldFail = error instanceof FirecrawlRequestError && error.status === 403;
    await supabase.from('places').update({ enrichment_status: shouldFail ? 'failed' : 'raw_coordinates' }).eq('id', place.id);

    return false;
  }
}

export type EnrichmentBatchResult = {
  success: boolean;
  processed: number;
  remaining: number;
  continue: boolean;
  error?: string | null;
};

export async function runEnrichmentBatch(supabase: any, batchSize = 10): Promise<EnrichmentBatchResult> {
  const { data: targets, error: selectError } = await supabase
    .from('places')
    .select('id, name, website, address, enrichment_status, enrichment_score, latitude, longitude')
    .eq('enrichment_status', 'raw_coordinates')
    .limit(batchSize);

  if (selectError) {
    console.error('Failed to select enrichment targets:', selectError);
    return { success: false, processed: 0, remaining: 0, continue: false, error: selectError.message || 'Selection failed' };
  }

  if (!targets || targets.length === 0) {
    return { success: true, processed: 0, remaining: 0, continue: false };
  }

  const targetIds = targets.map((place: PlaceRecord) => place.id).filter(Boolean);
  if (targetIds.length === 0) {
    return { success: true, processed: 0, remaining: 0, continue: false };
  }

  const { error: lockError } = await supabase
    .from('places')
    .update({ enrichment_status: 'in_progress' })
    .in('id', targetIds);

  if (lockError) {
    console.error('Failed to lock enrichment targets:', lockError);
    return { success: false, processed: 0, remaining: 0, continue: false, error: lockError.message || 'Lock failed' };
  }

  let processed = 0;
  for (const place of targets as PlaceRecord[]) {
    console.log(`-> [ENRICHMENT BATCH]: Processing place ${place.name} (ID: ${place.id})`);
    await enrichPlaceWithFirecrawl(place, supabase);
    processed += 1;
  }

  const { count: remainingCount, error: countError } = await supabase
    .from('places')
    .select('id', { count: 'exact', head: false })
    .eq('enrichment_status', 'raw_coordinates');

  if (countError) {
    console.warn('Failed to count remaining enrichment targets:', countError);
  }

  return {
    success: true,
    processed,
    remaining: remainingCount ?? 0,
    continue: (remainingCount ?? 0) > 0,
  };
}
