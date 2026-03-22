// RealtyDataLabs — Feed Fetcher
// Fetches all RSS feeds, parses, filters, deduplicates, sorts, caches

const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
const FEEDS_CACHE_PREFIX = 'rdl_feeds_';
const FEEDS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================
// BLACKLIST — confirmed paywall or soft-paywall domains
// Articles from these domains are dropped before rendering
// ============================================================
const BLACKLIST = [
  // Original
  'wsj.com',
  'bloomberg.com',
  'nytimes.com',
  'barrons.com',
  'ft.com',
  'theinformation.com',
  // Confirmed soft-paywall additions
  'axios.com',
  'therealdeal.com',
  'globest.com',
  'bisnow.com',
  'housingwire.com',
  'inman.com',
  'connect.media',
  'commercialobserver.com',
  'multifamilyexecutive.com',
  'builderonline.com',
  'probuilder.com',
  'architecturaldigest.com',
  'mansionglobal.com',
  'realestateweekly.com',
  'nationalmortgagenews.com',
  'americanbanker.com',
  'paymentssource.com',
  'sourcemedia.com'
];

// ============================================================
// CONFIRMED FREE SOURCES
// Articles from these domains are trusted, verified free,
// and sorted to the top of every feed result.
// ============================================================
const CONFIRMED_FREE_SOURCES = [
  'calculatedriskblog.com',
  'fred.stlouisfed.org',
  'fredblog.stlouisfed.org',
  'stlouisfed.org',
  'bls.gov',
  'census.gov',
  'hud.gov',
  'fhfa.gov',
  'fanniemae.com',
  'freddiemac.com',
  'mortgagenewsdaily.com',
  'apnews.com',
  'reuters.com',
  'cnbc.com',
  'marketwatch.com',
  'yahoo.com',
  'finance.yahoo.com',
  'nerdwallet.com',
  'bankrate.com',
  'biggerpockets.com',
  'apartmentlist.com',
  'rentcafe.com',
  'realtor.com',
  'zillow.com',
  'redfin.com',
  'propublica.org',
  'nahb.org',
  'federalreserve.gov',
  'treasury.gov',
  'home.treasury.gov',
  'whitehouse.gov',
  'occ.gov',
  'consumerfinance.gov',
  'nar.realtor',
  'newyorkfed.org',
  'frbatlanta.org',
  'mba.org'
];

// ============================================================
// SOFT PAYWALL SIGNAL DETECTION
// Drops articles whose title, description, or excerpt
// contain any of these phrases (case-insensitive).
// ============================================================
const PAYWALL_SIGNALS = [
  'subscribers only',
  'subscribe to read',
  'sign in to read',
  'sign in or',
  'sign up or',
  'sign in to continue',
  'sign up to continue',
  'create a free account',
  'register to read',
  'members only',
  'exclusive to subscribers',
  'log in to continue',
  'free registration required',
  'create account to view',
  'continue reading with',
  'unlimited access',
  'premium content',
  'subscriber exclusive',
  'already a subscriber',
  'become a member',
  'join to read',
  'unlock this article',
  'read the full article',
  'get full access',
  'limited free articles',
  'articles remaining',
  'free articles left',
  'metered paywall',
  'digital subscription',
  'subscription required',
  'paid subscribers',
  'subscribe for',
  'register for free',
  'sign up for free',
  'create your free',
  'activate your account',
  'paywall'
];

// ============================================================
// HELPERS
// ============================================================

// Check if URL is blacklisted
function isBlacklisted(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return BLACKLIST.some(b => domain.includes(b));
  } catch {
    return false;
  }
}

// Check if URL is from a confirmed-free source
function isConfirmedFree(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return CONFIRMED_FREE_SOURCES.some(s => domain.includes(s));
  } catch {
    return false;
  }
}

// Scan title + description + excerpt for soft paywall signals
function hasSoftPaywallSignal(item) {
  const text = [
    item.title       || '',
    item.description || '',
    item.content     || '',
    item.excerpt     || ''
  ].join(' ').toLowerCase();

  return PAYWALL_SIGNALS.some(signal => text.includes(signal));
}

// Pre-flight HEAD request — checks response headers for paywall signals.
// NOTE: Most third-party sites block cross-origin HEAD requests (CORS),
// so this falls back to `true` (assume accessible) on network error.
// Domain blacklist + signal detection are the primary defences.
async function isArticleAccessible(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    });
    const headers = response.headers;
    if (headers.get('x-paywall'))                 return false;
    if (headers.get('x-subscription-required'))   return false;
    return response.ok;
  } catch {
    return true; // CORS failure or timeout — assume accessible
  }
}

// Check if article is within 48 hours
function isRecent(pubDate) {
  if (!pubDate) return true;
  const age = Date.now() - new Date(pubDate).getTime();
  return age < 48 * 60 * 60 * 1000;
}

// Extract image from RSS item
function extractImage(item) {
  if (item.thumbnail && !item.thumbnail.includes('1x1') && item.thumbnail.startsWith('http')) {
    return item.thumbnail;
  }
  if (item.enclosure && item.enclosure.link && item.enclosure.link.match(/\.(jpg|jpeg|png|webp)/i)) {
    return item.enclosure.link;
  }
  if (item.description) {
    const match = item.description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (match && match[1] && match[1].startsWith('http')) return match[1];
  }
  return null;
}

// Clean HTML from text
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ============================================================
// RSS FEEDS BY CATEGORY
// All paywalled sources removed — free/open sources only.
// Each entry may include an optional backup URL.
// ============================================================
const CATEGORY_FEEDS = {
  'market': [
    { url: 'https://www.zillow.com/research/feed/',                          backup: 'https://www.zillow.com/research/feed/',              label: 'Zillow Research' },
    { url: 'https://www.redfin.com/news/feed/',                             backup: 'https://www.redfin.com/blog/feed/',                  label: 'Redfin News' },
    { url: 'https://www.nar.realtor/blogs/economists-outlook/feed',         backup: 'https://www.nar.realtor/rss',                        label: 'NAR' },
    { url: 'https://www.fhfa.gov/rss/news',                                 backup: 'https://www.fhfa.gov/rss',                           label: 'FHFA' },
    { url: 'https://www.calculatedriskblog.com/feeds/posts/default',                                                                      label: 'Calculated Risk' },
    { url: 'https://www.nahb.org/news-and-economics/press-releases/feed',   backup: 'https://www.nahb.org/news-and-economics/rss',        label: 'NAHB' },
    { url: 'https://www.census.gov/construction/nrs/feed.xml',              backup: 'https://www.census.gov/newsroom/rss.xml',            label: 'Census Bureau' }
  ],
  'mortgage': [
    { url: 'https://www.mortgagenewsdaily.com/feed/news',                   backup: 'https://www.mortgagenewsdaily.com/rss',              label: 'Mortgage News Daily' },
    { url: 'https://www.mba.org/rss-feeds/news',                           backup: 'https://www.mba.org/news-and-research/newsroom/rss.xml', label: 'MBA' },
    { url: 'https://www.bankrate.com/rss/mortgage/',                        backup: 'https://www.bankrate.com/rss/mortgage-rates/',       label: 'Bankrate' },
    { url: 'https://www.nerdwallet.com/blog/mortgages/feed/',                                                                             label: 'NerdWallet' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml',                                                                          label: 'Federal Reserve' },
    { url: 'https://www.freddiemac.com/blog/feed',                                                                                        label: 'Freddie Mac' }
  ],
  'economic': [
    { url: 'https://www.calculatedriskblog.com/feeds/posts/default',                                                                      label: 'Calculated Risk' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',               backup: 'https://www.reuters.com/business/rss',               label: 'Reuters' },
    { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',                                                                        label: 'CNBC' },
    { url: 'https://feeds.marketwatch.com/marketwatch/realtimeheadlines/',  backup: 'https://feeds.marketwatch.com/marketwatch/topstories/', label: 'MarketWatch' },
    { url: 'https://fredblog.stlouisfed.org/feed/',                                                                                       label: 'FRED Blog' },
    { url: 'https://www.bls.gov/feed/bls_latest.rss',                                                                                     label: 'BLS' },
    { url: 'https://home.treasury.gov/news/press-releases/rss.xml',                                                                       label: 'U.S. Treasury' }
  ],
  'investment': [
    { url: 'https://www.biggerpockets.com/blog/feed',                       backup: 'https://www.biggerpockets.com/blog/feed/',           label: 'BiggerPockets' },
    { url: 'https://www.apartmentlist.com/research/rss.xml',               backup: 'https://www.apartmentlist.com/research/feed',        label: 'Apartment List' },
    { url: 'https://www.rentcafe.com/blog/feed/',                                                                                         label: 'RentCafe' },
    { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',                                                                        label: 'CNBC' }
  ],
  'industry': [
    // All paywalled industry sources removed — using free alternatives only
    { url: 'https://www.nar.realtor/rss',                                   backup: 'https://www.nar.realtor/blogs/economists-outlook/feed', label: 'NAR' },
    { url: 'https://www.nahb.org/news-and-economics/rss',                                                                                 label: 'NAHB' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml',                                                                          label: 'Federal Reserve' },
    { url: 'https://www.propublica.org/feeds/propublica/main',                                                                            label: 'ProPublica' },
    { url: 'https://www.mba.org/rss-feeds/news',                                                                                          label: 'MBA' }
  ],
  'regional': [
    { url: 'https://www.stlouisfed.org/on-the-economy/rss',                 backup: 'https://fredblog.stlouisfed.org/feed/',              label: 'St. Louis Fed' },
    { url: 'https://www.newyorkfed.org/research/rss',                                                                                     label: 'NY Fed' },
    { url: 'https://www.frbatlanta.org/rss',                                                                                              label: 'Atlanta Fed' },
    { url: 'https://www.census.gov/housing/hvs/feed.xml',                   backup: 'https://www.census.gov/newsroom/rss.xml',            label: 'Census (Housing)' },
    { url: 'https://www.fhfa.gov/rss/news',                                                                                               label: 'FHFA' }
  ]
};

// ============================================================
// FETCH A SINGLE RSS FEED
// Tries primary URL first, then backup if provided.
// Logs health check results to the console.
// ============================================================
async function fetchFeed(feedConfig) {
  const urls = [feedConfig.url];
  if (feedConfig.backup && feedConfig.backup !== feedConfig.url) urls.push(feedConfig.backup);

  for (const rawUrl of urls) {
    const proxyUrl = RSS_PROXY + encodeURIComponent(rawUrl) + '&_=' + Date.now();
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) {
        console.warn(`[RDL Feeds] FAIL — ${feedConfig.label} (${rawUrl}) HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data.items || !data.items.length) {
        console.warn(`[RDL Feeds] EMPTY — ${feedConfig.label} (${rawUrl})`);
        continue;
      }
      console.log(`[RDL Feeds] OK — ${feedConfig.label}: ${data.items.length} items`);
      return data.items.map(item => ({
        ...item,
        _source:    feedConfig.label,
        _sourceUrl: rawUrl
      }));
    } catch (err) {
      console.warn(`[RDL Feeds] ERROR — ${feedConfig.label} (${rawUrl}):`, err.message || err);
    }
  }
  return [];
}

// ============================================================
// FETCH ALL FEEDS FOR A CATEGORY
// Applies all filters: blacklist, recency, dedup,
// soft-paywall signals, then sorts confirmed-free to top.
// ============================================================
async function fetchCategory(category) {
  const cacheKey = FEEDS_CACHE_PREFIX + category;

  // Check cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < FEEDS_CACHE_TTL) return data;
    }
  } catch {}

  const feeds = CATEGORY_FEEDS[category] || [];

  // Fetch all feeds in parallel
  const results = await Promise.all(feeds.map(f => fetchFeed(f)));
  const seen = new Set();

  const articles = results
    .flat()
    .filter(item => item.title && item.link)
    // Step 1 — hard domain blacklist
    .filter(item => !isBlacklisted(item.link))
    // Step 2 — recency
    .filter(item => isRecent(item.pubDate))
    // Step 3 — deduplication by URL
    .filter(item => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    // Step 4 — soft paywall signal detection (title + description + content)
    .filter(item => !hasSoftPaywallSignal(item))
    .map(item => {
      const verified = isConfirmedFree(item.link);
      return {
        title:    stripHtml(item.title),
        excerpt:  stripHtml(item.description || item.content || '').slice(0, 240),
        link:     item.link,
        pubDate:  item.pubDate,
        image:    extractImage(item),
        source:   item._source || 'Source',
        category: category,
        verified: verified  // true = confirmed free source
      };
    })
    // Step 5 — sort: confirmed-free sources first, then by recency
    .sort((a, b) => {
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });

  if (!articles.length) {
    console.warn(`[RDL Feeds] Category "${category}" returned 0 articles after all filters.`);
  }

  // Cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data: articles, timestamp: Date.now() }));
  } catch {}

  return articles;
}

// ============================================================
// FETCH ALL CATEGORIES AT ONCE (used by homepage)
// ============================================================
async function fetchAllCategories() {
  const categories = Object.keys(CATEGORY_FEEDS);
  const results    = await Promise.all(categories.map(cat => fetchCategory(cat)));
  const map = {};
  categories.forEach((cat, i) => { map[cat] = results[i]; });
  return map;
}

// Export
window.RDLFeeds = {
  fetchCategory,
  fetchAllCategories,
  isArticleAccessible,
  isConfirmedFree,
  CATEGORY_FEEDS,
  BLACKLIST,
  CONFIRMED_FREE_SOURCES,
  PAYWALL_SIGNALS
};
