// feeds.js — RealtyDataLabs RSS Feed Engine
// Fetches, filters, and renders articles for all category sections
// Rebuilt: multi-proxy fallback, XML parsing, self-contained rendering

const RSS_CONFIG = {
  marketData: {
    feeds: [
      'https://calculatedriskblog.com/feeds/posts/default',
      'https://www.nar.realtor/newsroom/rss.xml',
      'https://redfin.com/blog/feed',
      'https://eyeonhousing.org/feed/',
      'https://zillow.mediaroom.com/rss/news_releases.rss',
      'https://www.worldpropertyjournal.com/feed/rss.xml'
    ],
    containerId: 'market-data-feed',
    label: 'Market Data',
    color: '#2D5BE3',
    categoryKey: 'market'
  },
  mortgageRates: {
    feeds: [
      'https://www.mortgagenewsdaily.com/rss/mortgage_news.aspx',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      'https://www.consumerfinance.gov/about-us/newsroom/feed/',
      'https://realtor.com/news/real-estate-news/feed'
    ],
    containerId: 'mortgage-rates-feed',
    label: 'Mortgage & Rates',
    color: '#00D4AA',
    categoryKey: 'mortgage'
  },
  economicNews: {
    feeds: [
      'https://calculatedriskblog.com/feeds/posts/default',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      'https://www.cnbc.com/id/20910258/device/rss/rss.html',
      'https://feeds.npr.org/1017/rss.xml'
    ],
    containerId: 'economic-news-feed',
    label: 'Economic News',
    color: '#F59E0B',
    categoryKey: 'economic'
  },
  investmentRental: {
    feeds: [
      'https://www.apartmentlist.com/research/feed',
      'https://www.noradarealestate.com/blog/feed/',
      'https://realtor.com/news/trends/feed',
      'https://eyeonhousing.org/feed/'
    ],
    containerId: 'investment-rental-feed',
    label: 'Investment & Rental',
    color: '#10B981',
    categoryKey: 'investment'
  },
  industryNews: {
    feeds: [
      'https://www.redfin.com/news/feed/',
      'https://calculatedriskblog.com/feeds/posts/default',
      'https://feeds.npr.org/1006/rss.xml',
      'https://www.federalreserve.gov/feeds/press_all.xml'
    ],
    containerId: 'industry-news-feed',
    label: 'Industry News',
    color: '#8B5CF6',
    categoryKey: 'industry'
  },
  regionalData: {
    feeds: [
      'https://calculatedriskblog.com/feeds/posts/default',
      'https://www.redfin.com/news/feed/',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      'https://www.cnbc.com/id/100003114/device/rss/rss.html'
    ],
    containerId: 'regional-data-feed',
    label: 'Regional Data',
    color: '#EF4444',
    categoryKey: 'regional'
  },
  mediaInsights: {
    feeds: [
      'https://blog.rismedia.com/feed',
      'https://www.forbes.com/real-estate/feed/',
      'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000115',
      'https://redfin.com/blog/feed',
      'https://geekestateblog.com/feed'
    ],
    containerId: 'media-insights-feed',
    label: 'Media & Insights',
    color: '#8B5CF6',
    categoryKey: 'media'
  }
};

// Short key → RSS_CONFIG key map (for backward-compat fetchCategory calls)
const CATEGORY_KEY_MAP = {
  'market':     'marketData',
  'mortgage':   'mortgageRates',
  'economic':   'economicNews',
  'investment': 'investmentRental',
  'industry':   'industryNews',
  'regional':   'regionalData',
  'media':      'mediaInsights'
};

const PROXIES = [
  { build: url => 'https://corsproxy.io/?' + encodeURIComponent(url),                  json: false },
  { build: url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,      json: true },
  { build: url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, json: false }
];

const BLACKLISTED_DOMAINS = [
  'wsj.com', 'bloomberg.com', 'nytimes.com', 'barrons.com',
  'ft.com', 'theinformation.com', 'businessinsider.com',
  'theatlantic.com', 'washingtonpost.com', 'latimes.com',
  'economist.com', 'fortune.com', 'hbr.org', 'wired.com',
  'sfchronicle.com', 'bostonglobe.com', 'chicagotribune.com',
  'nationalmortgagenews.com', 'americanbanker.com',
  'axios.com', 'therealdeal.com', 'globest.com', 'bisnow.com',
  'connect.media', 'commercialobserver.com',
  'housingwire.com', 'costar.com'
];

const PAYWALL_SIGNALS = [
  'subscribers only', 'subscribe to read', 'sign in to read',
  'sign in or', 'sign up or', 'create a free account',
  'register to read', 'members only', 'log in to continue',
  'free registration required', 'unlock this article',
  'articles remaining', 'free articles left', 'limited free articles',
  'continue reading', 'premium content', 'already a member',
  'become a member', 'subscriber exclusive', 'paid subscribers',
  'subscription required', 'premium article', 'subscribe now',
  'start your free trial', 'get full access', 'read the full article',
  'access this article', 'exclusive to subscribers'
];

const FALLBACK_IMAGES = {
  marketData:       'images/fallback-market.svg',
  mortgageRates:    'images/fallback-mortgage.svg',
  economicNews:     'images/fallback-economic.svg',
  investmentRental: 'images/fallback-investment.svg',
  industryNews:     'images/fallback-industry.svg',
  regionalData:     'images/fallback-regional.svg',
  mediaInsights:    'images/fallback-industry.svg'
};

// ── Helpers ───────────────────────────────────────────────────────────────

function stripHTML(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

function isBlacklisted(url, text) {
  const domain = extractDomain(url);
  if (BLACKLISTED_DOMAINS.some(d => domain.includes(d))) return true;
  const low = (text || '').toLowerCase();
  return PAYWALL_SIGNALS.some(s => low.includes(s));
}

function getRelativeTime(date) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 60)  return m + 'm ago';
  if (h < 24)  return h + 'h ago';
  return d + 'd ago';
}

function safeParseDate(raw) {
  if (!raw) return new Date();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ── Cache ─────────────────────────────────────────────────────────────────

function clearStaleCache() {
  Object.keys(RSS_CONFIG).forEach(key => {
    try {
      const c = JSON.parse(localStorage.getItem('rdl_feed_' + key));
      if (!c || Date.now() - c.timestamp > 30 * 60 * 1000) {
        localStorage.removeItem('rdl_feed_' + key);
      }
    } catch { localStorage.removeItem('rdl_feed_' + key); }
  });
}

function getCachedArticles(key) {
  try {
    const c = JSON.parse(localStorage.getItem('rdl_feed_' + key));
    if (!c) return null;
    if (Date.now() - c.timestamp > 30 * 60 * 1000) return null;
    return c.articles;
  } catch { return null; }
}

function cacheArticles(key, articles) {
  try {
    localStorage.setItem('rdl_feed_' + key, JSON.stringify({ articles, timestamp: Date.now() }));
  } catch {}
}

clearStaleCache();

// ── Fetch with multi-proxy fallback ───────────────────────────────────────

async function fetchWithProxy(url) {
  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy.build(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        let text;
        if (proxy.json) {
          const data = await response.json();
          text = data.contents;
        } else {
          text = await response.text();
        }
        if (text && text.length > 200) {
          console.log('[RDL Feeds] OK: ' + url.split('/')[2]);
          return text;
        }
      }
    } catch { /* try next proxy */ }
  }
  console.warn('[RDL Feeds] All proxies failed: ' + url);
  return null;
}

// ── Parse RSS / Atom XML ──────────────────────────────────────────────────

function parseXMLFeed(xmlText, configKey) {
  const articles = [];
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'text/xml');
    if (xml.querySelector('parsererror')) return articles;

    const items = xml.querySelectorAll('item, entry');
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    items.forEach(item => {
      try {
        const title = stripHTML(item.querySelector('title')?.textContent || '');
        if (!title) return;

        // Link — RSS 2.0 text node OR Atom href attribute
        let link = (item.querySelector('link')?.textContent || '').trim();
        if (!link) link = item.querySelector('link')?.getAttribute('href') || '';
        if (!link) link = (item.querySelector('id')?.textContent || '').trim();
        if (!link || !link.startsWith('http')) return;

        const descEl   = item.querySelector('description, summary, content\\:encoded, content');
        const rawDesc  = descEl?.textContent || '';
        const cleanDesc = stripHTML(rawDesc).slice(0, 200);

        if (isBlacklisted(link, title + ' ' + cleanDesc)) return;

        const pubRaw  = item.querySelector('pubDate, published, updated, dc\\:date')?.textContent || '';
        const pubDate = safeParseDate(pubRaw);
        if (pubRaw && !isNaN(new Date(pubRaw).getTime()) && pubDate < cutoff) return;

        // Image extraction — use getElementsByTagNameNS for namespaced tags
        let image = '';

        const mediaNS = 'http://search.yahoo.com/mrss/';
        const mediaThumbs = item.getElementsByTagNameNS(mediaNS, 'thumbnail');
        const mediaContent = item.getElementsByTagNameNS(mediaNS, 'content');
        if (mediaThumbs.length) image = mediaThumbs[0].getAttribute('url') || '';
        if (!image && mediaContent.length) image = mediaContent[0].getAttribute('url') || '';

        if (!image) image = item.querySelector('enclosure[type^="image"]')?.getAttribute('url') || '';
        if (!image) image = item.querySelector('enclosure')?.getAttribute('url') || '';

        if (!image) {
          const srcMatch = rawDesc.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (srcMatch) image = srcMatch[1];
        }

        if (!image) {
          const encoded = item.getElementsByTagNameNS('http://purl.org/rss/1.0/modules/content/', 'encoded')[0];
          if (encoded) {
            const m = encoded.textContent.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (m) image = m[1];
          }
        }

        if (image && (image.startsWith('data:') || image.includes('1x1') || image.includes('pixel') || image.includes('tracking'))) {
          image = '';
        }

        if (!image) image = null;

        articles.push({
          title, link, description: cleanDesc,
          pubDate, image, configKey,
          category: RSS_CONFIG[configKey]?.categoryKey || configKey,
          excerpt: cleanDesc,
          source: extractDomain(link),
          relativeTime: getRelativeTime(pubDate)
        });
      } catch {}
    });
  } catch {}
  return articles;
}

// ── Card HTML ─────────────────────────────────────────────────────────────

function buildArticleCard(article) {
  const imageHtml = article.image
    ? `<div class="article-image"><img src="${article.image}" loading="lazy" alt="" onerror="this.parentElement.style.display='none'"></div>`
    : '';
  return `
    <article class="article-card fade-in">
      ${imageHtml}
      <div class="article-body">
        <span class="article-source">${article.source}</span>
        <h3><a href="${article.link}" target="_blank" rel="noopener">${article.title}</a></h3>
        ${article.description ? `<p class="article-description">${article.description}</p>` : ''}
        <time>${article.relativeTime}</time>
      </div>
    </article>`;
}

function buildSkeletonCards(count) {
  return Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton-img"></div>
      <div class="article-body">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line full"></div>
        <div class="skeleton-line medium"></div>
      </div>
    </div>`).join('');
}

function renderArticles(container, articles) {
  if (!container) return;
  if (!articles || !articles.length) {
    container.innerHTML = '<div class="feed-notice"><p>Fetching latest verified articles. Check back shortly.</p></div>';
    return;
  }
  const html = articles.slice(0, 10).map(a => buildArticleCard(a)).join('');
  requestAnimationFrame(() => {
    container.innerHTML = html;
    // Trigger fade-in observer for newly added cards
    if (window._rdlObserver) {
      container.querySelectorAll('.fade-in').forEach(el => window._rdlObserver.observe(el));
    }
  });
}

// ── Load a single category ────────────────────────────────────────────────

async function loadCategoryFeed(configKey, config) {
  // Find container — try primary ID, fall back to articles-grid on category pages
  const container = document.getElementById(config.containerId)
                 || document.getElementById('articles-grid');
  if (!container) return [];

  const cached = getCachedArticles(configKey);
  if (cached && cached.length > 0) {
    console.log('[RDL Feeds] Cache — ' + configKey + ': ' + cached.length);
    renderArticles(container, cached);
    if (window.RDLSearch) window.RDLSearch.initSearch(cached);
    return cached;
  }

  container.innerHTML = buildSkeletonCards(3);

  try {
    const feedResults = await Promise.allSettled(config.feeds.map(url => fetchWithProxy(url)));
    const texts = feedResults
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    let all = [];
    texts.forEach(text => { all = all.concat(parseXMLFeed(text, configKey)); });

    const seen = new Set();
    const unique = all
      .filter(a => { if (seen.has(a.link)) return false; seen.add(a.link); return true; })
      .sort((a, b) => b.pubDate - a.pubDate);

    console.log('[RDL Feeds] ' + configKey + ': fetched=' + all.length + ' displayed=' + unique.length);

    cacheArticles(configKey, unique);

    if (texts.length === 0 || unique.length === 0) {
      requestAnimationFrame(() => {
        container.innerHTML = '<div class="feed-error"><p>Unable to load articles. Please refresh the page.</p></div>';
      });
    } else {
      renderArticles(container, unique);
    }

    // Update "last-updated" timestamp if present on this page
    const lastEl = document.getElementById('last-updated');
    if (lastEl && unique.length > 0) {
      lastEl.textContent = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    if (window.RDLSearch && typeof window.RDLSearch.initSearch === 'function') {
      window.RDLSearch.initSearch(unique);
    }

    return unique;

  } catch (err) {
    console.error('[RDL Feeds] Failed: ' + configKey, err);
    container.innerHTML = '<div class="feed-error"><p>Unable to load articles. Please refresh the page.</p></div>';
    return [];
  }
}

// ── Load all categories (homepage) ────────────────────────────────────────

async function loadAllFeeds() {
  await Promise.all(
    Object.entries(RSS_CONFIG).map(([key, config]) => loadCategoryFeed(key, config))
  );
}

// ── fetchCategory — backward compat for category page inline scripts ──────

async function fetchCategory(shortKey) {
  const configKey = CATEGORY_KEY_MAP[shortKey] || shortKey;
  const config    = RSS_CONFIG[configKey];
  if (!config) return [];
  return loadCategoryFeed(configKey, config);
}

async function fetchAllCategories() {
  const results = {};
  await Promise.all(
    Object.entries(RSS_CONFIG).map(async ([key, config]) => {
      results[config.categoryKey] = await loadCategoryFeed(key, config);
    })
  );
  return results;
}

// ── Mortgage Rate Widget ───────────────────────────────────────────────────

async function fetchMortgageRateWidget() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;

  const fallbackHtml = '<a href="https://www.mortgagenewsdaily.com/mortgage-rates.aspx" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent-teal)">See Current Rates</a>';

  try {
    const feedUrl = 'https://www.mortgagenewsdaily.com/rss/mortgage_rates.aspx';
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(feedUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('feed failed');
    const txt = await res.text();

    const xml = new DOMParser().parseFromString(txt, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('parse error');

    const items = [...xml.querySelectorAll('item')];
    let r30 = null, r15 = null;

    for (const item of items.slice(0, 10)) {
      const content = (item.querySelector('title')?.textContent || '') + ' ' +
                      stripHTML(item.querySelector('description')?.textContent || '');
      if (!r30 && /30\s*[–\-]?\s*(yr|year)/i.test(content)) {
        const m = content.match(/(\d\.\d{2,3})%/);
        if (m) r30 = m[1] + '%';
      }
      if (!r15 && /15\s*[–\-]?\s*(yr|year)/i.test(content)) {
        const m = content.match(/(\d\.\d{2,3})%/);
        if (m) r15 = m[1] + '%';
      }
      if (r30 && r15) break;
    }

    // Last resort: grab first rate from the first item's title
    if (!r30 && items.length) {
      const m = (items[0].querySelector('title')?.textContent || '').match(/(\d\.\d{2,3})%/);
      if (m) r30 = m[1] + '%';
    }

    if (el30) { if (r30) el30.textContent = r30; else el30.innerHTML = fallbackHtml; }
    if (el15) { if (r15) el15.textContent = r15; else el15.innerHTML = fallbackHtml; }

  } catch {
    if (el30) el30.innerHTML = fallbackHtml;
    if (el15) el15.innerHTML = fallbackHtml;
  }
}

// ── Auto-init ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Store IntersectionObserver reference for newly rendered cards
  if ('IntersectionObserver' in window) {
    window._rdlObserver = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); window._rdlObserver.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  }
  fetchMortgageRateWidget();
  loadAllFeeds();
});

// ── Public API ────────────────────────────────────────────────────────────

window.RDLFeeds = {
  fetchCategory,
  fetchAllCategories,
  loadAllFeeds,
  RSS_CONFIG,
  BLACKLISTED_DOMAINS,
  PAYWALL_SIGNALS
};
