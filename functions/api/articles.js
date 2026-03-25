// functions/api/articles.js
// Cloudflare Pages Function — fetches & caches all RSS articles server-side
// Requires KV namespace bound as ARTICLES_CACHE in Pages project settings

const CACHE_KEY = 'articles_v1';
const CACHE_TTL = 3600; // 1 hour in KV

const MARKET_FEEDS = [
  'https://www.redfin.com/blog/feed',
  'https://rss-proxy.nawilliams95.workers.dev/zillow-research',
  'https://rss-proxy.nawilliams95.workers.dev/realtor-news',
  'https://keepingcurrentmatters.com/feed',
  'https://eyeonhousing.org/feed/',
  'https://www.worldpropertyjournal.com/feed/rss.xml',
];

const INVEST_FEEDS = [
  'https://www.fortunebuilders.com/feed/',
  'https://retipster.com/feed/',
  'https://www.biggerpockets.com/blog/feed',
  'https://keepingcurrentmatters.com/feed',
  'https://therealdeal.com/feed/',
];

const INVEST_KEEP = [
  'invest','rental','rent','landlord','property','multifamily',
  'cash flow','cashflow','cap rate','roi','flip','deal','market',
  'housing','real estate','mortgage','appreciation','equity',
  'portfolio','passive income','tenant','vacancy','airbnb',
  'short-term rental','str','long-term','duplex','triplex',
  'syndication','wholesal','turnkey','rehab','fix and flip',
  'buy and hold','house hack','lease',
];

const INVEST_SKIP = [
  'celebrity','kardashian','mansion','decor','design',
  'renovation tip','diy kitchen','diy bath','garden',
  'curb appeal tip','staging tip','paint color','furniture',
  'interior design','landscap','best mattress','gift guide',
];

// ─── Fetch with timeout ───────────────────────────────────────────────────────
async function fetchFeed(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

// ─── RSS/Atom parser (no DOMParser in Workers) ────────────────────────────────
function parseRSS(text, feedUrl, category) {
  if (!text) return [];
  const articles = [];
  const itemRe = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/g;
  let m;

  while ((m = itemRe.exec(text)) !== null) {
    const block = m[1];

    const tag = (name) => {
      const r = block.match(
        new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${name}>`, 'i')
      );
      return r ? r[1].trim() : '';
    };

    const raw = (s) => s
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '')
      .trim();

    const title   = raw(tag('title'));
    const linkTag = tag('link');
    const linkAtom = (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const link    = linkTag.startsWith('http') ? linkTag : linkAtom;
    const pubDate = tag('pubDate') || tag('published') || tag('updated') || '';
    const desc    = tag('description') || tag('summary') || '';

    let image = null;
    const mediaM = block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    const encM   = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) ||
                   block.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i);
    if (mediaM)       image = mediaM[1];
    else if (encM)    image = encM[1];
    else {
      const imgM = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgM && imgM[1].startsWith('http')) image = imgM[1];
    }

    const cleanDesc = desc
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const excerpt = cleanDesc.length > 200 ? cleanDesc.slice(0, 200) + '...' : cleanDesc;

    let source = '';
    try { source = new URL(feedUrl).hostname.replace('www.', ''); } catch (e) {}

    if (!title || !link || !link.startsWith('http')) continue;

    articles.push({ title, link, pubDate, excerpt, image, source, category, verified: true });
  }

  return articles;
}

function investFilter(article) {
  const txt = (article.title + ' ' + article.excerpt).toLowerCase();
  return INVEST_KEEP.some(w => txt.includes(w)) &&
        !INVEST_SKIP.some(w => txt.includes(w));
}

// ─── Main handler ─────────────────────────────────────────────────────────────
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

  // 2. Fetch all feeds concurrently
  const jobs = [
    ...MARKET_FEEDS.map(url => ({ url, category: 'market' })),
    ...INVEST_FEEDS.map(url => ({ url, category: 'investment' })),
  ];

  const results = await Promise.allSettled(
    jobs.map(async ({ url, category }) => {
      const text     = await fetchFeed(url);
      const articles = parseRSS(text, url, category);
      return category === 'investment'
        ? articles.filter(investFilter)
        : articles;
    })
  );

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return db - da;
    });

  const payload = JSON.stringify(articles);

  // 3. Store in KV for next request
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
