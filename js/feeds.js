// feeds.js — RealtyDataLabs
// Cloudflare Worker: rss-proxy.nawilliams95.workers.dev

const CACHE_VERSION = 'v20';
const CACHE_TTL = 30 * 60 * 1000;
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
      'https://rss-proxy.nawilliams95.workers.dev/zillow-research',
      'https://rss-proxy.nawilliams95.workers.dev/realtor-news',
      'https://keepingcurrentmatters.com/feed',
      'https://eyeonhousing.org/feed/',
      'https://www.worldpropertyjournal.com/feed/rss.xml'
    ],
    containerId: 'market-data-feed',
    cacheKey: 'market-data',
    filterRelevant: false
  },
  investmentRental: {
    feeds: [
      'https://www.fortunebuilders.com/feed/',
      'https://retipster.com/feed/',
      'https://www.biggerpockets.com/blog/feed',
      'https://keepingcurrentmatters.com/feed',
      'https://www.apartmentlist.com/research/feed',
      'https://therealdeal.com/feed/'
    ],
    containerId: 'investment-rental-feed',
    cacheKey: 'investment-rental',
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

async function proxyFetch(url) {
  // Scraper endpoints go direct, no ?url= wrapping
  const fetchUrl = url.startsWith('https://rss-proxy.nawilliams95.workers.dev/')
    ? url
    : WORKER + encodeURIComponent(url);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(fetchUrl, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) {
      console.warn('[RDL] Worker', res.status, 'for', url);
      return null;
    }
    const text = await res.text();
    if (!text || (!text.includes('<item') && !text.includes('<entry') &&
        !text.includes('<rss') && !text.includes('<channel'))) {
      console.warn('[RDL] Invalid XML for', url);
      return null;
    }
    try { console.log('[RDL] OK:', new URL(url).hostname); } catch(e) {}
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
    const items = Array.from(
      xml.querySelectorAll(isAtom ? 'entry' : 'item'));

    let host = '';
    try { host = new URL(feedUrl).hostname.replace('www.',''); } catch(e) {}

    let category = 'market';
    if (host.includes('fortunebuilders') || host.includes('retipster') ||
        host.includes('keepingcurrent') || host.includes('biggerpockets') ||
        host.includes('apartmentlist') || host.includes('therealdeal'))
      category = 'investment';

    return items.slice(0, 25).map(item => {
      const ns = 'http://search.yahoo.com/mrss/';
      const mc = item.getElementsByTagNameNS(ns,'content')[0] ||
                 item.getElementsByTagNameNS(ns,'thumbnail')[0];
      const enc = item.querySelector('enclosure[type^="image"]');
      let image = mc?.getAttribute('url') || enc?.getAttribute('url') || null;
      if (!image) {
        const d = item.querySelector('description,summary')?.textContent||'';
        const m = d.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1].startsWith('http')) image = m[1];
      }

      const raw = item.querySelector(
        'description,summary,content')?.textContent || '';
      const div = document.createElement('div');
      div.innerHTML = raw;
      const desc = (div.textContent||'').replace(/\s+/g,' ').trim();
      const excerpt = desc.length > 200 ? desc.slice(0,200)+'...' : desc;

      const linkEl = item.querySelector('link');
      const link = (linkEl?.getAttribute('href') ||
                    linkEl?.textContent || '').trim();

      const dateStr = item.querySelector(
        'pubDate,published,updated')?.textContent || '';

      return {
        title:    (item.querySelector('title')?.textContent||'').trim(),
        link:     link.startsWith('http') ? link : '',
        pubDate:  dateStr ? new Date(dateStr) : new Date(0),
        excerpt, description: excerpt, image,
        source:   host, category, verified: true
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

function readCache(key) {
  try {
    const raw = localStorage.getItem('rdl_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return (Date.now() - ts < CACHE_TTL) ? data : null;
  } catch(e) { return null; }
}

function writeCache(key, data) {
  try {
    localStorage.setItem('rdl_'+key,
      JSON.stringify({ ts: Date.now(), data }));
  } catch(e) {}
}

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

function renderArticles(articles, container) {
  if (!articles?.length) {
    container.innerHTML =
      '<p style="padding:40px;text-align:center;color:#888">' +
      'Unable to load articles right now. Please check back soon.</p>';
    return;
  }
  if (window.RDLCards?.renderCards) {
    window.RDLCards.renderCards(container, articles);
    return;
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
                 ? a.pubDate.toLocaleDateString('en-US',
                     {month:'short',day:'numeric',year:'numeric'})
                 : ''
             }</span>
           </div>`
      }
      <div class="card-body">
        <div class="card-meta">
          <span class="badge badge-${a.category||'market'}">${a.source}</span>
          <span class="card-timestamp">${
            a.pubDate > new Date(0)
              ? a.pubDate.toLocaleDateString('en-US',
                  {month:'short',day:'numeric',year:'numeric'})
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

async function loadFeeds(config) {
  const container = document.getElementById(config.containerId);
  if (!container) return;
  const statusEl = document.getElementById('last-updated');
  const countEl  = document.getElementById('results-count');

  const cached = readCache(config.cacheKey);
  if (cached?.length) {
    if (window.RDLSearch && document.getElementById('search-input')) {
      window.RDLSearch.initSearch(cached);
    } else {
      renderArticles(cached, container);
    }
    if (statusEl) statusEl.textContent =
      'Cached · ' + new Date().toLocaleTimeString();
    if (countEl) countEl.textContent = cached.length + ' articles';
    return;
  }

  showSkeletons(container);

  const results = await Promise.allSettled(
    config.feeds.map(async url => {
      const text = await proxyFetch(url);
      return text ? parseXML(text, url, config.filterRelevant) : [];
    })
  );

  console.log('[RDL] Feed results:', results.map((r,i) => ({
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
    {month:'short',day:'numeric',year:'numeric',
     hour:'numeric',minute:'2-digit'});

  if (!articles.length) { renderArticles([], container); return; }

  writeCache(config.cacheKey, articles);

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

async function loadMortgageRates() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;
  const KEY = '4f73d187e5b0e664e9447b7d92972edc';
  async function fred(s) {
    try {
      const r = await fetch(
        `https://api.stlouisfed.org/fred/series/observations` +
        `?series_id=${s}&api_key=${KEY}&file_type=json` +
        `&sort_order=desc&limit=1`);
      const d = await r.json();
      const obs = (d.observations||[]).filter(o=>o.value!=='.');
      return obs[0]?.value
        ? parseFloat(obs[0].value).toFixed(2)+'%' : null;
    } catch(e) { return null; }
  }
  const [r30,r15] = await Promise.all([
    fred('MORTGAGE30US'), fred('MORTGAGE15US')]);
  if (el30) el30.textContent = r30 || '—';
  if (el15) el15.textContent = r15 || '—';
}

function init() {
  console.log('[RDL] init:', window.location.pathname);
  console.log('[RDL] RDLCards:', !!window.RDLCards);
  console.log('[RDL] RDLSearch:', !!window.RDLSearch);
  Object.values(RSS_CONFIG).forEach(cfg => loadFeeds(cfg));
  loadMortgageRates();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded',
    () => setTimeout(init, 150));
} else {
  setTimeout(init, 150);
}

window.RDLFeeds = { loadFeeds, loadMortgageRates, proxyFetch };
