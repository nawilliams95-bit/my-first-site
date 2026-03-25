// functions/api/rates.js
// Cloudflare Pages Function — fetches FRED rate data server-side
// No CORS issues, cached in KV for 1 hour
// Requires KV namespace bound as ARTICLES_CACHE in Pages project settings

const CACHE_KEY = 'fred_rates_v1';
const CACHE_TTL = 3600; // 1 hour

const FRED_KEY = '4f73d187e5b0e664e9447b7d92972edc';

const SERIES = [
  { id: 'MORTGAGE30US', limit: 52 },
  { id: 'MORTGAGE15US', limit: 52 },
  { id: 'DGS10',        limit: 52 },
  { id: 'FEDFUNDS',     limit: 24 },
  { id: 'MSPUS',        limit: 20 },
  { id: 'MSACSR',       limit: 24 },
  { id: 'CPIAUCSL',     limit: 24 },
];

async function fetchSeries(id, limit) {
  const url = `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('FRED ' + res.status);
    const json = await res.json();
    return (json.observations || [])
      .filter(o => o.value !== '.')
      .map(o => ({ date: o.date, value: parseFloat(o.value) }))
      .filter(o => !isNaN(o.value));
  } catch (e) {
    clearTimeout(timer);
    return [];
  }
}

export async function onRequest(context) {
  const { env } = context;

  // 1. Try KV cache
  if (env.ARTICLES_CACHE) {
    try {
      const cached = await env.ARTICLES_CACHE.get(CACHE_KEY);
      if (cached) {
        return respond(cached, true);
      }
    } catch (e) {}
  }

  // 2. Fetch all series concurrently from FRED
  const results = await Promise.allSettled(
    SERIES.map(s => fetchSeries(s.id, s.limit).then(obs => ({ id: s.id, obs })))
  );

  const data = {};
  results.forEach(r => {
    if (r.status === 'fulfilled' && r.value.obs.length) {
      data[r.value.id] = r.value.obs;
    }
  });

  const payload = JSON.stringify(data);

  // 3. Store in KV
  if (env.ARTICLES_CACHE) {
    try {
      await env.ARTICLES_CACHE.put(CACHE_KEY, payload, { expirationTtl: CACHE_TTL });
    } catch (e) {}
  }

  return respond(payload, false);
}

function respond(body, fromCache) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': fromCache ? 'HIT' : 'MISS',
    },
  });
}
