// feeds.js — RealtyDataLabs
// Cloudflare Worker proxy: rss-proxy.nawilliams95.workers.dev

const CACHE_VERSION = 'v11';
const CACHE_TTL = 30 * 60 * 1000;
const WORKER = 'https://rss-proxy.nawilliams95.workers.dev/?url=';
const FRED_KEY = '4f73d187e5b0e664e9447b7d92972edc';

const RSS_CONFIG = {
  marketData: {
    feeds: [
      'https://www.redfin.com/blog/feed',
      'https://zillow.mediaroom.com/press-releases?pagetemplate=rss&category=816',
      'https://www.realtor.com/news/feed',
      'https://keepingcurrentmatters.com/feed'
    ],
    containerId: 'market-data-feed',
    cacheKey: 'market-data'
  },
  investmentRental: {
    feeds: [
      'https://www.fortunebuilders.com/feed/',
      'https://retipster.com/feed/',
      'https://keepingcurrentmatters.com/feed',
      'https://www.redfin.com/blog/feed'
    ],
    containerId: 'investment-rental-feed',
    cacheKey: 'investment-rental'
  }
};

// ── Clear stale cache on version bump ────────────────────────────
(function clearOldCache() {
  try {
    if (localStorage.getItem('rdl_cache_ver') !== CACHE_VERSION) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('rdl_'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem('rdl_cache_ver', CACHE_VERSION);
      console.log('[RDL] Cache cleared for', CACHE_VERSION);
    }
  } catch(e) {}
})();

// ── Fetch via Cloudflare Worker ───────────────────────────────────
async function proxyFetch(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(WORKER + encodeURIComponent(url), { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) { console.warn('[RDL] Worker', res.status, url); return null; }
    const text = await res.text();
    const valid = text && (text.includes('<item') || text.includes('<entry') ||
                           text.includes('<rss') || text.includes('<channel'));
    if (!valid) { console.warn('[RDL] Invalid XML for', url); return null; }
    try { console.log('[RDL] OK:', new URL(url).hostname); } catch(e) {}
    return text;
  } catch(e) {
    console.warn('[RDL] Fetch error:', url, e.message);
    return null;
  }
}

// ── Parse RSS or Atom XML ─────────────────────────────────────────
function parseXML(text, feedUrl) {
  try {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) return [];
    const isAtom = !xml.querySelectorAll('item').length;
    const items = Array.from(xml.querySelectorAll(isAtom ? 'entry' : 'item'));

    let host = '';
    try { host = new URL(feedUrl).hostname.replace('www.', ''); } catch(e) {}

    let category = 'market';
    if (host.includes('fortunebuilders') || host.includes('retipster') ||
        host.includes('keepingcurrent') || host.includes('norada'))
      category = 'investment';

    return items.slice(0, 20).map(item => {
      // Image
      const ns = 'http://search.yahoo.com/mrss/';
      const mc = item.getElementsByTagNameNS(ns,'content')[0] ||
                 item.getElementsByTagNameNS(ns,'thumbnail')[0];
      const enc = item.querySelector('enclosure[type^="image"]');
      let image = mc?.getAttribute('url') || enc?.getAttribute('url') || null;
      if (!image) {
        const d = item.querySelector('description,summary')?.textContent || '';
        const m = d.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1].startsWith('http')) image = m[1];
      }

      // Description
      const raw = item.querySelector('description,summary,content')?.textContent || '';
      const div = document.createElement('div');
      div.innerHTML = raw;
      const desc = (div.textContent || '').replace(/\s+/g,' ').trim();
      const excerpt = desc.length > 200 ? desc.slice(0,200)+'...' : desc;

      // Link
      const linkEl = item.querySelector('link');
      const link = (linkEl?.getAttribute('href') || linkEl?.textContent || '').trim();

      // Date
      const dateStr = item.querySelector('pubDate,published,updated')?.textContent || '';
      const pubDate = dateStr ? new Date(dateStr) : new Date(0);

      return {
        title:    (item.querySelector('title')?.textContent || '').trim(),
        link:     link.startsWith('http') ? link : '',
        pubDate,
        excerpt,
        description: excerpt,
        image,
        source:   host,
        category,
        verified: true
      };
    }).filter(a => a.title && a.link);
  } catch(e) { return []; }
}

// ── Cache ─────────────────────────────────────────────────────────
function readCache(key) {
  try {
    const raw = localStorage.getItem('rdl_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return (Date.now() - ts < CACHE_TTL) ? data : null;
  } catch(e) { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem('rdl_'+key, JSON.stringify({ts:Date.now(), data})); }
  catch(e) {}
}

// ── Skeleton cards ────────────────────────────────────────────────
function showSkeletons(container, n=6) {
  if (window.RDLCards?.renderSkeletons) {
    window.RDLCards.renderSkeletons(container, n);
    return;
  }
  container.innerHTML = Array(n).fill(`
    <div class="article-card card-skeleton">
      <div class="card-image-wrap skeleton-image skeleton"></div>
      <div class="card-body">
        <div class="skeleton-headline skeleton"></div>
        <div class="skeleton-headline skeleton skeleton-headline-2"></div>
      </div>
    </div>`).join('');
}

// ── Render articles ───────────────────────────────────────────────
function renderArticles(articles, container) {
  if (!articles?.length) {
    container.innerHTML = '<p style="padding:40px;text-align:center;color:#888">Unable to load articles. Please check back soon.</p>';
    return;
  }
  // Use RDLCards if available
  if (window.RDLCards?.renderCards) {
    window.RDLCards.renderCards(container, articles);
    return;
  }
  // Inline fallback
  container.innerHTML = articles.map(a => `
    <article class="article-card fade-in">
      ${a.image ? `<div class="card-image-wrap">
        <img src="${a.image}" loading="lazy" alt=""
             onerror="this.parentElement.style.display='none'">
      </div>` : ''}
      <div class="card-body">
        <div class="card-meta">
          <span class="badge badge-${a.category}">${a.source}</span>
          <span class="card-timestamp">${a.pubDate > new Date(0)
            ? a.pubDate.toLocaleDateString('en-US',
                {month:'short',day:'numeric',year:'numeric'})
            : ''}</span>
        </div>
        <h3 class="card-headline">
          <a href="${a.link}" target="_blank" rel="noopener">${a.title}</a>
        </h3>
        ${a.excerpt ? `<p class="card-excerpt">${a.excerpt}</p>` : ''}
        <div class="card-footer">
          <span class="card-source">${a.source}</span>
          <span class="card-read-more">Read More →</span>
        </div>
      </div>
    </article>`).join('');
}

// ── Main load function ────────────────────────────────────────────
async function loadFeeds(config) {
  const container = document.getElementById(config.containerId);
  if (!container) return;

  const statusEl = document.getElementById('last-updated');
  const countEl  = document.getElementById('results-count');

  // Try cache first
  const cached = readCache(config.cacheKey);
  if (cached?.length) {
    if (window.RDLSearch && document.getElementById('search-input')) {
      window.RDLSearch.initSearch(cached);
    } else {
      renderArticles(cached, container);
    }
    if (statusEl) statusEl.textContent = 'From cache — ' +
      new Date().toLocaleTimeString();
    if (countEl) countEl.textContent = cached.length + ' articles';
    return;
  }

  showSkeletons(container);

  const results = await Promise.allSettled(
    config.feeds.map(async url => {
      const text = await proxyFetch(url);
      return text ? parseXML(text, url) : [];
    })
  );

  console.log('[RDL] Results:', results.map((r,i) => ({
    url: config.feeds[i],
    ok: r.status === 'fulfilled',
    count: r.value?.length ?? 0
  })));

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a,b) => b.pubDate - a.pubDate);

  if (countEl) countEl.textContent = articles.length + ' articles';
  if (statusEl) statusEl.textContent = new Date().toLocaleString('en-US',
    {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

  if (!articles.length) {
    renderArticles([], container);
    return;
  }

  writeCache(config.cacheKey, articles);

  // Hand off to search if available, else render with load-more
  if (window.RDLSearch && document.getElementById('search-input')) {
    window.RDLSearch.initSearch(articles);
  } else {
    const PAGE = 10;
    let shown = Math.min(PAGE, articles.length);
    renderArticles(articles.slice(0, shown), container);
    const btn = document.getElementById('load-more-btn');
    if (btn) {
      btn.style.display = articles.length > PAGE ? 'flex' : 'none';
      btn.onclick = () => {
        shown = Math.min(shown + PAGE, articles.length);
        renderArticles(articles.slice(0, shown), container);
        if (shown >= articles.length) btn.style.display = 'none';
      };
    }
  }
}

// ── Mortgage rate widget (FRED API — same as ticker.js) ───────────
async function loadMortgageRates() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;

  async function fredRate(series) {
    try {
      const url = `https://api.stlouisfed.org/fred/series/observations` +
        `?series_id=${series}&api_key=${FRED_KEY}&file_type=json` +
        `&sort_order=desc&limit=2`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const obs = (data.observations||[]).filter(o => o.value !== '.');
      return obs[0]?.value ? parseFloat(obs[0].value).toFixed(2)+'%' : null;
    } catch(e) { return null; }
  }

  const [r30, r15] = await Promise.all([
    fredRate('MORTGAGE30US'),
    fredRate('MORTGAGE15US')
  ]);

  if (el30) el30.textContent = r30 || '—';
  if (el15) el15.textContent = r15 || '—';
  console.log('[RDL] Rates:', r30, r15);
}

// ── Homepage feed previews ────────────────────────────────────────
async function loadHomepagePreview(feedUrl, containerId, limit=3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const text = await proxyFetch(feedUrl);
  if (!text) return;
  const articles = parseXML(text, feedUrl).slice(0, limit);
  if (!articles.length) return;
  container.innerHTML = articles.map(a => `
    <a href="${a.link}" target="_blank" rel="noopener" class="preview-card">
      ${a.image ? `<div class="preview-img">
        <img src="${a.image}" loading="lazy" alt=""
             onerror="this.parentElement.style.display='none'">
      </div>` : ''}
      <div class="preview-body">
        <span class="preview-source">${a.source}</span>
        <h4>${a.title}</h4>
        <time>${a.pubDate > new Date(0)
          ? a.pubDate.toLocaleDateString('en-US',
              {month:'short',day:'numeric',year:'numeric'})
          : ''}</time>
      </div>
    </a>`).join('');
}

// ── Init ──────────────────────────────────────────────────────────
function init() {
  console.log('[RDL] init on:', window.location.pathname);
  console.log('[RDL] RDLCards:', !!window.RDLCards);
  console.log('[RDL] RDLSearch:', !!window.RDLSearch);

  // Section pages
  Object.values(RSS_CONFIG).forEach(cfg => loadFeeds(cfg));

  // Mortgage rates widget (works on homepage + mortgage page)
  loadMortgageRates();

  // Homepage article previews
  loadHomepagePreview(
    'https://www.redfin.com/blog/feed',
    'homepage-news-preview'
  );
  loadHomepagePreview(
    'https://www.fortunebuilders.com/feed/',
    'homepage-invest-preview'
  );
}

// Wait for all deferred scripts then init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
} else {
  setTimeout(init, 100);
}

window.RDLFeeds = { loadFeeds, loadMortgageRates, proxyFetch, parseXML };
