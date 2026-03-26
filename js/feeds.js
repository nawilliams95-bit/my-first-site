// feeds.js — RealtyDataLabs
// Primary: /api/articles (Cloudflare Pages Function + KV cache)
// Fallback: direct RSS fetch via Cloudflare Worker proxy

const CACHE_VERSION = 'v22';
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours client-side
const WORKER = 'https://rss-proxy.nawilliams95.workers.dev/?url=';

// Clear stale cache on version change
(function() {
  try {
    if (localStorage.getItem('rdl_cv') !== CACHE_VERSION) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('rdl_'))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem('rdl_cv', CACHE_VERSION);
    }
  } catch(e) {}
})();

const RSS_CONFIG = {
  marketData: {
    feeds: [
      'https://www.redfin.com/blog/feed',
      'https://www.housingwire.com/feed/',
      'https://www.rismedia.com/feed/',
      'https://keepingcurrentmatters.com/feed',
      'https://eyeonhousing.org/feed/',
      'https://calculatedriskblog.com/feeds/posts/default'
    ],
    containerId: 'market-data-feed',
    cacheKey: 'market-data',
    category: 'market',
    filterRelevant: false
  },
  investmentRental: {
    feeds: [
      'https://www.fortunebuilders.com/feed/',
      'https://retipster.com/feed/',
      'https://www.biggerpockets.com/blog/feed',
      'https://keepingcurrentmatters.com/feed',
      'https://www.multifamilydive.com/feeds/news/',
      'https://www.rismedia.com/feed/'
    ],
    containerId: 'investment-rental-feed',
    cacheKey: 'investment-rental',
    category: 'investment',
    filterRelevant: true
  }
};

const INVEST_KEEP = [
  'invest','rental','rent','landlord','property','multifamily',
  'cash flow','cashflow','cap rate','roi','flip','brrrr','deal',
  'market','housing','real estate','mortgage','appreciation',
  'equity','portfolio','passive income','tenant','vacancy',
  'airbnb','short-term rental','str','long-term','duplex',
  'triplex','fourplex','syndication','wholesal','turnkey',
  'rehab','fix and flip','buy and hold','house hack','lease'
];
const INVEST_SKIP = [
  'celebrity','kardashian','mansion','decor','design',
  'renovation tip','diy kitchen','diy bath','garden',
  'curb appeal tip','staging tip','paint color','furniture',
  'interior design','landscap','best mattress','gift guide'
];

// ─── API fetch (Pages Function) ───────────────────────────────────────────────
async function fetchFromAPI() {
  // Check unified client-side cache first
  const allCached = readCache('all-articles');
  if (allCached?.length) return allCached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch('/api/articles', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('API ' + res.status);
    const articles = await res.json();
    if (articles?.length) {
      // Normalize dates from API (strings → Date objects)
      articles.forEach(a => {
        a.pubDate = a.pubDate ? new Date(a.pubDate) : new Date(0);
      });
      writeCache('all-articles', articles);
      return articles;
    }
    throw new Error('Empty response');
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ─── Fallback: direct proxy fetch ────────────────────────────────────────────
async function proxyFetch(url) {
  const fetchUrl = url.startsWith('https://rss-proxy.nawilliams95.workers.dev/')
    ? url
    : WORKER + encodeURIComponent(url);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(fetchUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) { console.warn('[RDL] Worker', res.status, 'for', url); return null; }
    const text = await res.text();
    if (!text || (!text.includes('<item') && !text.includes('<entry') &&
        !text.includes('<rss') && !text.includes('<channel'))) {
      console.warn('[RDL] Invalid XML for', url); return null;
    }
    return text;
  } catch(e) {
    console.warn('[RDL] Failed:', url, e.message);
    return null;
  }
}

function parseXML(text, feedUrl, filterRelevant) {
  try {
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) return [];
    const isAtom = !xml.querySelectorAll('item').length;
    const items = Array.from(xml.querySelectorAll(isAtom ? 'entry' : 'item'));

    let host = '';
    try { host = new URL(feedUrl).hostname.replace('www.',''); } catch(e) {}

    let category = 'market';
    if (host.includes('fortunebuilders') || host.includes('retipster') ||
        host.includes('keepingcurrent') || host.includes('biggerpockets') ||
        host.includes('apartmentlist') || host.includes('therealdeal'))
      category = 'investment';

    return items.slice(0, 25).map(item => {
      const ns = 'http://search.yahoo.com/mrss/';
      const mc  = item.getElementsByTagNameNS(ns,'content')[0] ||
                  item.getElementsByTagNameNS(ns,'thumbnail')[0];
      const enc = item.querySelector('enclosure[type^="image"]');
      let image = mc?.getAttribute('url') || enc?.getAttribute('url') || null;
      if (!image) {
        const d = item.querySelector('description,summary')?.textContent || '';
        const m = d.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1].startsWith('http')) image = m[1];
      }
      const raw = item.querySelector('description,summary,content')?.textContent || '';
      const div = document.createElement('div');
      div.innerHTML = raw;
      const desc    = (div.textContent||'').replace(/\s+/g,' ').trim();
      const excerpt = desc.length > 200 ? desc.slice(0,200)+'...' : desc;
      const linkEl  = item.querySelector('link');
      const link    = (linkEl?.getAttribute('href') || linkEl?.textContent || '').trim();
      const dateStr = item.querySelector('pubDate,published,updated')?.textContent || '';
      return {
        title:    (item.querySelector('title')?.textContent||'').trim(),
        link:     link.startsWith('http') ? link : '',
        pubDate:  dateStr ? new Date(dateStr) : new Date(0),
        excerpt, image, source: host, category, verified: true
      };
    }).filter(a => {
      if (!a.title || !a.link) return false;
      if (!filterRelevant) return true;
      const txt = (a.title + ' ' + a.excerpt).toLowerCase();
      return INVEST_KEEP.some(w => txt.includes(w)) &&
             !INVEST_SKIP.some(w => txt.includes(w));
    });
  } catch(e) { return []; }
}

async function fetchFallback(config) {
  const results = await Promise.allSettled(
    config.feeds.map(async url => {
      const text = await proxyFetch(url);
      return text ? parseXML(text, url, config.filterRelevant) : [];
    })
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => b.pubDate - a.pubDate);
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
function readCache(key) {
  try {
    const raw = localStorage.getItem('rdl_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    // Re-hydrate date strings to Date objects
    data.forEach(a => { if (typeof a.pubDate === 'string') a.pubDate = new Date(a.pubDate); });
    return data;
  } catch(e) { return null; }
}

function writeCache(key, data) {
  try {
    localStorage.setItem('rdl_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) {}
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function showSkeletons(container, n=6) {
  if (window.RDLCards?.renderSkeletons) {
    window.RDLCards.renderSkeletons(container, n); return;
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

function renderArticles(articles, container) {
  if (!articles?.length) {
    container.innerHTML =
      '<p style="padding:40px;text-align:center;color:#888">' +
      'Unable to load articles right now. Please check back soon.</p>';
    return;
  }
  if (window.RDLCards?.renderCards) {
    window.RDLCards.renderCards(container, articles); return;
  }
  container.innerHTML = articles.map(a => `
    <article class="article-card fade-in">
      ${a.image
        ? `<div class="card-image-wrap">
             <img src="${a.image}" loading="lazy" alt=""
                  onerror="this.closest('.article-card').classList.add('no-image');this.style.display='none'">
           </div>`
        : `<div class="card-image-placeholder">
             <span class="card-placeholder-source">${a.source}</span>
             <span class="card-placeholder-date">${
               a.pubDate > new Date(0)
                 ? a.pubDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
                 : ''
             }</span>
           </div>`
      }
      <div class="card-body">
        <div class="card-meta">
          <span class="badge badge-${a.category||'market'}">${a.source}</span>
          <span class="card-timestamp">${
            a.pubDate > new Date(0)
              ? a.pubDate.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
              : ''
          }</span>
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

// ─── Main loadFeeds ───────────────────────────────────────────────────────────
async function loadFeeds(config) {
  const container = document.getElementById(config.containerId);
  if (!container) return;
  const statusEl = document.getElementById('last-updated');
  const countEl  = document.getElementById('results-count');

  // 1. Per-feed client cache (instant)
  const perCached = readCache(config.cacheKey);
  if (perCached?.length) {
    finalize(perCached, container, statusEl, countEl, config, true);
    return;
  }

  showSkeletons(container);

  let articles = [];

  // 2. Try Pages Function API (edge KV cache ~50ms after first hit)
  try {
    const all = await fetchFromAPI();
    articles = all.filter(a => a.category === config.category);
    console.log('[RDL] API hit:', articles.length, config.category);
  } catch (e) {
    // 3. Fallback: direct RSS via Worker proxy
    console.warn('[RDL] API failed, falling back to RSS proxy:', e.message);
    articles = await fetchFallback(config);
  }

  if (articles.length) writeCache(config.cacheKey, articles);
  finalize(articles, container, statusEl, countEl, config, false);
}

function finalize(articles, container, statusEl, countEl, config, fromCache) {
  if (countEl) countEl.textContent = articles.length + ' articles';
  if (statusEl) statusEl.textContent = fromCache
    ? 'Cached · ' + new Date().toLocaleTimeString()
    : new Date().toLocaleString('en-US',
        {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});

  if (!articles.length) { renderArticles([], container); return; }

  if (window.RDLSearch && document.getElementById('search-input')) {
    window.RDLSearch.initSearch(articles);
  } else {
    const PAGE = 9;
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

// ─── Mortgage rates ───────────────────────────────────────────────────────────
async function loadMortgageRates() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch('/api/rates', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('rates API ' + res.status);
    const data = await res.json();
    const pick = (id) => {
      const obs = (data[id] || []).filter(o => o.value !== '.' && !isNaN(parseFloat(o.value)));
      return obs[0]?.value != null ? parseFloat(obs[0].value).toFixed(2) + '%' : null;
    };
    if (el30) el30.textContent = pick('MORTGAGE30US') || '—';
    if (el15) el15.textContent = pick('MORTGAGE15US') || '—';
  } catch(e) {
    if (el30) el30.textContent = '—';
    if (el15) el15.textContent = '—';
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  Object.values(RSS_CONFIG).forEach(cfg => loadFeeds(cfg));
  loadMortgageRates();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.RDLFeeds = { loadFeeds, loadMortgageRates, proxyFetch };
