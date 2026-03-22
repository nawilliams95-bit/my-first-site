// RealtyDataLabs — Feed Fetcher
// Fetches all RSS feeds, parses, filters, deduplicates, sorts, caches

const RSS_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';
const FEEDS_CACHE_PREFIX = 'rdl_feeds_';
const FEEDS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Blacklisted domains — never show paywalled content
const BLACKLIST = ['wsj.com','bloomberg.com','nytimes.com','barrons.com','ft.com','theinformation.com'];

// All approved RSS feeds organized by category
const CATEGORY_FEEDS = {
  'market': [
    { url: 'https://www.zillow.com/research/feed/', label: 'Zillow Research' },
    { url: 'https://www.redfin.com/blog/feed/', label: 'Redfin News' },
    { url: 'https://www.realtor.com/news/feed/', label: 'Realtor.com' },
    { url: 'https://www.fhfa.gov/rss', label: 'FHFA' },
    { url: 'https://www.calculatedriskblog.com/feeds/posts/default', label: 'Calculated Risk' },
    { url: 'https://www.nahb.org/news-and-economics/rss', label: 'NAHB' },
    { url: 'https://www.census.gov/newsroom/rss.xml', label: 'Census Bureau' }
  ],
  'mortgage': [
    { url: 'https://www.freddiemac.com/blog/feed', label: 'Freddie Mac' },
    { url: 'https://www.mortgagenewsdaily.com/rss', label: 'Mortgage News Daily' },
    { url: 'https://www.mba.org/news-and-research/newsroom/rss.xml', label: 'MBA' },
    { url: 'https://www.bankrate.com/rss/mortgage-rates/', label: 'Bankrate' },
    { url: 'https://www.federalreserve.gov/feeds/press_all.xml', label: 'Federal Reserve' }
  ],
  'economic': [
    { url: 'https://fredblog.stlouisfed.org/feed/', label: 'FRED Blog' },
    { url: 'https://www.bls.gov/feed/bls_latest.rss', label: 'BLS' },
    { url: 'https://home.treasury.gov/news/press-releases/rss.xml', label: 'U.S. Treasury' },
    { url: 'https://www.calculatedriskblog.com/feeds/posts/default', label: 'Calculated Risk' }
  ],
  'investment': [
    { url: 'https://www.biggerpockets.com/blog/feed/', label: 'BiggerPockets' },
    { url: 'https://www.apartmentlist.com/research/rss.xml', label: 'Apartment List' },
    { url: 'https://www.rentcafe.com/blog/feed/', label: 'RentCafe' }
  ],
  'industry': [
    { url: 'https://www.housingwire.com/feed/', label: 'HousingWire' },
    { url: 'https://www.inman.com/feed/', label: 'Inman' },
    { url: 'https://www.nar.realtor/rss', label: 'NAR' }
  ],
  'regional': [
    { url: 'https://www.stlouisfed.org/on-the-economy/rss', label: 'St. Louis Fed' },
    { url: 'https://www.newyorkfed.org/research/rss', label: 'NY Fed' },
    { url: 'https://www.frbatlanta.org/rss', label: 'Atlanta Fed' }
  ]
};

// Check if URL is blacklisted
function isBlacklisted(url) {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return BLACKLIST.some(b => domain.includes(b));
  } catch {
    return false;
  }
}

// Check if article is within 48 hours
function isRecent(pubDate) {
  if (!pubDate) return true; // assume recent if no date
  const age = Date.now() - new Date(pubDate).getTime();
  return age < 48 * 60 * 60 * 1000;
}

// Extract image from RSS item
function extractImage(item) {
  // Try thumbnail first (rss2json provides this)
  if (item.thumbnail && !item.thumbnail.includes('1x1') && item.thumbnail.startsWith('http')) {
    return item.thumbnail;
  }
  // Try enclosure
  if (item.enclosure && item.enclosure.link && item.enclosure.link.match(/\.(jpg|jpeg|png|webp)/i)) {
    return item.enclosure.link;
  }
  // Try parsing description for img tag
  if (item.description) {
    const match = item.description.match(/<img[^>]+src=["']([^"'>]+)["']/i);
    if (match && match[1] && match[1].startsWith('http')) return match[1];
  }
  return null;
}

// Clean HTML from text
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// Fetch a single RSS feed via rss2json proxy
async function fetchFeed(feedConfig) {
  const url = RSS_PROXY + encodeURIComponent(feedConfig.url) + '&_=' + Date.now();
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(item => ({
      ...item,
      _source: feedConfig.label,
      _sourceUrl: feedConfig.url
    }));
  } catch {
    return [];
  }
}

// Fetch all feeds for a category
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
    .filter(item => !isBlacklisted(item.link))
    .filter(item => isRecent(item.pubDate))
    .filter(item => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .map(item => ({
      title:     stripHtml(item.title),
      excerpt:   stripHtml(item.description || item.content || '').slice(0, 240),
      link:      item.link,
      pubDate:   item.pubDate,
      image:     extractImage(item),
      source:    item._source || 'Source',
      category:  category
    }));

  // Cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data: articles, timestamp: Date.now() }));
  } catch {}

  return articles;
}

// Fetch all categories at once (used by homepage)
async function fetchAllCategories() {
  const categories = Object.keys(CATEGORY_FEEDS);
  const results = await Promise.all(categories.map(cat => fetchCategory(cat)));
  const map = {};
  categories.forEach((cat, i) => { map[cat] = results[i]; });
  return map;
}

// Export for use by other scripts
window.RDLFeeds = { fetchCategory, fetchAllCategories, CATEGORY_FEEDS };
