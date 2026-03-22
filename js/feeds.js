// RealtyDataLabs — Feed Fetcher
// Fetches RSS feeds via corsproxy.io, parses XML directly, filters, deduplicates, sorts, caches
// Task 2 — switched from rss2json proxy to corsproxy.io + DOMParser

const FEEDS_CACHE_PREFIX = 'rdl_feeds_';
const FEEDS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============================================================
// BLACKLIST — confirmed paywall or soft-paywall domains
// ============================================================
const BLACKLIST = [
  // Hard paywalls
  'wsj.com', 'bloomberg.com', 'nytimes.com', 'barrons.com',
  'ft.com', 'theinformation.com', 'businessinsider.com',
  'theatlantic.com', 'washingtonpost.com', 'latimes.com',
  'thetimes.co.uk', 'economist.com', 'fortune.com',
  'hbr.org', 'wired.com', 'sfchronicle.com', 'bostonglobe.com',
  'chicagotribune.com', 'medium.com', 'morningstar.com',
  'costar.com', 'bisnow.com', 'connect.media',
  'commercialobserver.com', 'nationalmortgagenews.com',
  'americanbanker.com', 'realestateweekly.com',
  // Soft paywalls
  'axios.com', 'therealdeal.com', 'globest.com',
  'multifamilyexecutive.com', 'builderonline.com',
  'probuilder.com', 'architecturaldigest.com',
  'mansionglobal.com', 'paymentssource.com', 'sourcemedia.com'
];

// ============================================================
// CONFIRMED FREE SOURCES — sorted to top of every result
// ============================================================
const CONFIRMED_FREE_SOURCES = [
  'calculatedriskblog.com', 'fred.stlouisfed.org', 'fredblog.stlouisfed.org',
  'stlouisfed.org', 'bls.gov', 'census.gov', 'hud.gov', 'fhfa.gov',
  'fanniemae.com', 'freddiemac.com', 'mortgagenewsdaily.com',
  'apnews.com', 'reuters.com', 'cnbc.com', 'marketwatch.com',
  'yahoo.com', 'finance.yahoo.com', 'nerdwallet.com', 'bankrate.com',
  'biggerpockets.com', 'apartmentlist.com', 'rentcafe.com',
  'realtor.com', 'zillow.com', 'redfin.com', 'propublica.org',
  'nahb.org', 'federalreserve.gov', 'treasury.gov', 'home.treasury.gov',
  'whitehouse.gov', 'occ.gov', 'consumerfinance.gov', 'nar.realtor',
  'newyorkfed.org', 'frbatlanta.org', 'mba.org'
];

// ============================================================
// SOFT PAYWALL SIGNAL DETECTION
// ============================================================
const PAYWALL_SIGNALS = [
  'subscribers only', 'subscribe to read', 'sign in to read',
  'sign in or', 'sign up or', 'sign in to continue', 'sign up to continue',
  'create a free account', 'register to read', 'members only',
  'exclusive to subscribers', 'log in to continue', 'free registration required',
  'create account to view', 'continue reading with', 'unlimited access',
  'premium content', 'subscriber exclusive', 'already a subscriber',
  'become a member', 'join to read', 'unlock this article',
  'read the full article', 'get full access', 'limited free articles',
  'articles remaining', 'free articles left', 'metered paywall',
  'digital subscription', 'subscription required', 'paid subscribers',
  'subscribe for', 'register for free', 'sign up for free',
  'create your free', 'activate your account', 'paywall'
];

// ============================================================
// CATEGORY FEEDS
// ============================================================
const CATEGORY_FEEDS = {
  'market': [
    { url: 'https://feeds.feedburner.com/zillowblog',                        label: 'Zillow Research' },
    { url: 'https://www.redfin.com/news/feed/',                              label: 'Redfin News' },
    { url: 'https://www.nar.realtor/blogs/economists-outlook/feed',          label: 'NAR' },
    { url: 'https://www.nahb.org/news-and-economics/press-releases/feed',    label: 'NAHB' },
    { url: 'https://calculatedriskblog.com/feeds/posts/default',             label: 'Calculated Risk' },
    { url: 'https://www.fhfa.gov/rss/news',                                  label: 'FHFA' }
  ],
  'mortgage': [
    { url: 'https://www.mortgagenewsdaily.com/feed/news',                    label: 'Mortgage News Daily' },
    { url: 'https://www.bankrate.com/rss/mortgage/',                         label: 'Bankrate' },
    { url: 'https://www.nerdwallet.com/blog/mortgages/feed/',                label: 'NerdWallet' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml',             label: 'Federal Reserve' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',                 label: 'Reuters' }
  ],
  'economic': [
    { url: 'https://calculatedriskblog.com/feeds/posts/default',             label: 'Calculated Risk' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',                 label: 'Reuters' },
    { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html',           label: 'CNBC' },
    { url: 'https://feeds.marketwatch.com/marketwatch/realtimeheadlines/',   label: 'MarketWatch' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml',             label: 'Federal Reserve' }
  ],
  'investment': [
    { url: 'https://www.biggerpockets.com/blog/feed',                        label: 'BiggerPockets' },
    { url: 'https://www.apartmentlist.com/research/feed',                    label: 'Apartment List' },
    { url: 'https://www.rentcafe.com/blog/feed/',                            label: 'RentCafe' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',                 label: 'Reuters' }
  ],
  'industry': [
    // NOTE: housingwire.com, inman.com, therealdeal.com included per config
    // but articles from blacklisted domains will be filtered before display
    { url: 'https://www.inman.com/feed/',                                    label: 'Inman' },
    { url: 'https://housingwire.com/feed/',                                  label: 'HousingWire' },
    { url: 'https://therealdeal.com/feed/',                                  label: 'The Real Deal' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',                 label: 'Reuters' },
    { url: 'https://www.nar.realtor/rss',                                    label: 'NAR' }
  ],
  'regional': [
    { url: 'https://calculatedriskblog.com/feeds/posts/default',             label: 'Calculated Risk' },
    { url: 'https://www.frbatlanta.org/rss/news',                            label: 'Atlanta Fed' },
    { url: 'https://www.census.gov/construction/nrs/feed.xml',               label: 'Census Bureau' },
    { url: 'https://feeds.reuters.com/reuters/businessNews',                 label: 'Reuters' },
    { url: 'https://www.fhfa.gov/rss/news',                                  label: 'FHFA' }
  ]
};

// ============================================================
// HELPERS
// ============================================================

function isBlacklisted(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return BLACKLIST.some(b => domain.includes(b));
  } catch { return false; }
}

function isConfirmedFree(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return CONFIRMED_FREE_SOURCES.some(s => domain.includes(s));
  } catch { return false; }
}

function hasSoftPaywallSignal(title, description) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  return PAYWALL_SIGNALS.some(signal => text.includes(signal));
}

function isRecent(pubDate) {
  if (!pubDate) return true;
  const age = Date.now() - new Date(pubDate).getTime();
  return age < 48 * 60 * 60 * 1000;
}

function stripHTML(html) {
  if (!html) return '';
  return html
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, m => m.slice(9, -3)) // unwrap CDATA first
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extractImageFromXML(item) {
  // media:content
  const media = item.querySelector('content') ||
                item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
  if (media && media.getAttribute('url') && media.getAttribute('url').match(/\.(jpg|jpeg|png|webp)/i)) {
    return media.getAttribute('url');
  }
  // enclosure
  const enc = item.querySelector('enclosure');
  if (enc && enc.getAttribute('url') && enc.getAttribute('url').match(/\.(jpg|jpeg|png|webp)/i)) {
    return enc.getAttribute('url');
  }
  // img in description
  const desc = item.querySelector('description')?.textContent || '';
  const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch && imgMatch[1].startsWith('http')) return imgMatch[1];
  return null;
}

function getItemText(item, tagName) {
  const el = item.querySelector(tagName);
  if (!el) return '';
  // Handle CDATA
  const raw = el.textContent || el.innerHTML || '';
  return raw;
}

// ============================================================
// FETCH A SINGLE RSS FEED via corsproxy.io + DOMParser
// ============================================================
async function fetchFeed(feedConfig) {
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(feedConfig.url)}`;
  try {
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[RDL Feeds] FAIL — ${feedConfig.label} HTTP ${res.status}`);
      return [];
    }
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    // Check for parse error
    if (xml.querySelector('parsererror')) {
      console.warn(`[RDL Feeds] PARSE ERROR — ${feedConfig.label}`);
      return [];
    }

    // Support RSS 2.0 and Atom
    const items = Array.from(xml.querySelectorAll('item, entry'));
    if (!items.length) {
      console.warn(`[RDL Feeds] EMPTY — ${feedConfig.label}`);
      return [];
    }

    console.log(`[RDL Feeds] OK — ${feedConfig.label}: ${items.length} items`);

    return items.map(item => {
      const title = stripHTML(getItemText(item, 'title'));

      // Link: RSS uses <link>, Atom uses <link href="..."> or <id>
      let link = getItemText(item, 'link').trim();
      if (!link) {
        const linkEl = item.querySelector('link');
        link = linkEl?.getAttribute('href') || '';
      }
      if (!link) link = getItemText(item, 'id');

      const description = getItemText(item, 'description') || getItemText(item, 'summary') || getItemText(item, 'content');
      const pubDate = getItemText(item, 'pubDate') || getItemText(item, 'published') || getItemText(item, 'updated');

      return {
        title,
        link,
        description,
        content: description,
        pubDate,
        thumbnail: extractImageFromXML(item),
        _source:    feedConfig.label,
        _sourceUrl: feedConfig.url
      };
    }).filter(item => item.title && item.link);

  } catch (err) {
    console.warn(`[RDL Feeds] ERROR — ${feedConfig.label}:`, err.message || err);
    return [];
  }
}

// ============================================================
// FETCH ALL FEEDS FOR A CATEGORY
// ============================================================
async function fetchCategory(category) {
  const cacheKey = FEEDS_CACHE_PREFIX + category;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < FEEDS_CACHE_TTL) {
        console.log(`[RDL Feeds] Cache hit — ${category}: ${data.length} articles`);
        return data;
      }
    }
  } catch {}

  const feeds = CATEGORY_FEEDS[category] || [];
  const fetchStart = Date.now();

  // Fetch all feeds simultaneously
  const results = await Promise.all(feeds.map(f => fetchFeed(f)));
  const totalFetched = results.reduce((n, r) => n + r.length, 0);

  const seen = new Set();

  const articles = results
    .flat()
    .filter(item => item.title && item.link)
    .filter(item => !isBlacklisted(item.link))
    .filter(item => isRecent(item.pubDate))
    .filter(item => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .filter(item => !hasSoftPaywallSignal(item.title, item.description))
    .map(item => {
      const verified = isConfirmedFree(item.link);
      return {
        title:    stripHTML(item.title),
        excerpt:  stripHTML(item.description || item.content || '').slice(0, 240),
        link:     item.link,
        pubDate:  item.pubDate,
        image:    item.thumbnail || null,
        source:   item._source || 'Source',
        category: category,
        verified: verified
      };
    })
    .sort((a, b) => {
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      return new Date(b.pubDate) - new Date(a.pubDate);
    });

  // Task 2J — diagnostic console log
  console.log(
    `[RDL Feeds] ${category}: fetched=${totalFetched} passed=${articles.length} ` +
    `(${Date.now() - fetchStart}ms)`
  );

  if (!articles.length) {
    console.warn(`[RDL Feeds] Category "${category}" returned 0 articles after all filters.`);
  }

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

// Pre-flight HEAD check — CORS-limited, falls back to true
async function isArticleAccessible(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    const headers = response.headers;
    if (headers.get('x-paywall')) return false;
    if (headers.get('x-subscription-required')) return false;
    return response.ok;
  } catch { return true; }
}

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
