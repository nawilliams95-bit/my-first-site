// feeds.js — RealtyDataLabs RSS Feed Engine

const RSS_CONFIG = {
  marketData: {
    feeds: [
      'https://www.redfin.com/blog/feed',
      'https://zillow.mediaroom.com/rss/news_releases.rss',
      'https://www.realtor.com/news/feed'
    ],
    containerId: 'market-data-feed',
    cacheKey: 'market-data'
  },
  mortgageRates: {
    feeds: [
      'https://www.mortgagenewsdaily.com/rss/mortgage_news.aspx',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      'https://www.consumerfinance.gov/about-us/newsroom/feed/'
    ],
    containerId: 'mortgage-rates-feed',
    cacheKey: 'mortgage-rates'
  },
  investmentRental: {
    feeds: [
      'https://www.noradarealestate.com/blog/feed/',
      'https://retipster.com/feed/',
      'https://www.keepingcurrentmatters.com/feed/',
      'https://www.fortunebuilders.com/feed/'
    ],
    containerId: 'investment-rental-feed',
    cacheKey: 'investment-rental'
  }
};

// ── Multi-proxy fallback fetch ────────────────────────────────────
async function fetchWithProxy(url) {
  const proxies = [
    u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];
  for (const proxy of proxies) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const proxyUrl = proxy(url);
      const res = await fetch(proxyUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      // allorigins /get returns JSON wrapper
      let text;
      if (proxyUrl.includes('allorigins.win/get')) {
        const j = await res.json();
        text = j.contents || '';
      } else {
        text = await res.text();
      }
      if (text && (
        text.includes('<item') || text.includes('<entry') ||
        text.includes('<rss')  || text.includes('<feed')  ||
        text.includes('<channel')
      )) {
        console.log('[RDL] OK via', proxyUrl.split('?')[0], 'for', new URL(url).hostname);
        return text;
      }
    } catch(e) { continue; }
  }
  console.warn('[RDL] All proxies failed for:', url);
  return null;
}

// ── Parse RSS or Atom feed ────────────────────────────────────────
function parseFeed(xmlText, feedUrl) {
  try {
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (xml.querySelector('parsererror')) return [];
    const items = Array.from(
      xml.querySelectorAll('item').length
        ? xml.querySelectorAll('item')
        : xml.querySelectorAll('entry')
    );
    return items.slice(0, 20).map(item => {
      const ns = 'http://search.yahoo.com/mrss/';
      const mc = item.getElementsByTagNameNS(ns,'content')[0] ||
                 item.getElementsByTagNameNS(ns,'thumbnail')[0];
      const enc = item.querySelector('enclosure[type^="image"]');
      let image = mc?.getAttribute('url') || enc?.getAttribute('url') || null;
      if (!image) {
        const raw = item.querySelector('description,summary')?.textContent || '';
        const m = raw.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1].startsWith('http')) image = m[1];
      }
      const rawDesc = item.querySelector('description,summary,content')?.textContent || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = rawDesc;
      const desc = (tmp.textContent||'').replace(/\s+/g,' ').trim();
      const linkEl = item.querySelector('link');
      const link = linkEl?.getAttribute('href') || linkEl?.textContent?.trim() || '#';
      const dateStr = item.querySelector('pubDate,published,updated')?.textContent || '';
      return {
        title: item.querySelector('title')?.textContent?.trim() || '',
        link: link.startsWith('http') ? link : '#',
        pubDate: dateStr ? new Date(dateStr) : new Date(0),
        description: desc.length > 220 ? desc.slice(0,220)+'...' : desc,
        excerpt: desc.length > 220 ? desc.slice(0,220)+'...' : desc,
        image,
        source: (() => {
          try { return new URL(feedUrl).hostname.replace('www.',''); }
          catch { return ''; }
        })(),
        category: (() => {
          try {
            const h = new URL(feedUrl).hostname.replace('www.','');
            if (h.includes('redfin') || h.includes('zillow') ||
                h.includes('realtor')) return 'market';
            if (h.includes('mortgagenewsdaily') ||
                h.includes('federalreserve') ||
                h.includes('consumerfinance')) return 'mortgage';
            if (h.includes('norada') || h.includes('retipster') ||
                h.includes('keepingcurrent') ||
                h.includes('fortunebuilders')) return 'investment';
            if (h.includes('rismedia') || h.includes('forbes') ||
                h.includes('cnbc')) return 'media';
            return 'market';
          } catch { return 'market'; }
        })()
      };
    }).filter(a => a.title && a.link !== '#');
  } catch(e) { return []; }
}

// ── Cache helpers ─────────────────────────────────────────────────
const CACHE_TTL = 30 * 60 * 1000;

function getCached(key) {
  try {
    const raw = localStorage.getItem('rdl_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch(e) { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem('rdl_' + key, JSON.stringify({ ts: Date.now(), data }));
  } catch(e) {}
}

// ── Skeleton loading ──────────────────────────────────────────────
function showSkeletons(container, count = 6) {
  if (window.RDLCards && window.RDLCards.renderSkeletons) {
    window.RDLCards.renderSkeletons(container, count);
    return;
  }
  // Fallback skeleton
  container.innerHTML = Array(count).fill(`
    <div class="article-card card-skeleton">
      <div class="card-image-wrap skeleton-image skeleton"></div>
      <div class="card-body">
        <div class="skeleton-headline skeleton"></div>
        <div class="skeleton-headline skeleton skeleton-headline-2"></div>
      </div>
    </div>`).join('');
}

// ── Render article cards ──────────────────────────────────────────
function renderArticles(articles, container) {
  if (!articles || !articles.length) {
    container.innerHTML = '<p class="feed-notice" style="padding:40px;text-align:center;color:#888">Unable to load articles right now. Please check back soon.</p>';
    return;
  }

  // Use cards.js RDLCards if available (preferred — uses full card styles)
  if (window.RDLCards && window.RDLCards.renderCards) {
    window.RDLCards.renderCards(container, articles, false);
    return;
  }

  // Fallback inline render if cards.js not yet loaded
  container.innerHTML = articles.map(a => `
    <article class="article-card fade-in">
      ${a.image ? `
        <div class="card-image-wrap">
          <img src="${a.image}" loading="lazy" alt=""
               onerror="this.parentElement.style.display='none'">
        </div>` : ''}
      <div class="card-body">
        <div class="card-meta">
          <span class="badge badge-${a.category || 'market'}">${a.source}</span>
          <span class="card-timestamp">${a.pubDate > new Date(0)
            ? a.pubDate.toLocaleDateString('en-US',
                {year:'numeric',month:'short',day:'numeric'})
            : ''}</span>
        </div>
        <h3 class="card-headline">
          <a href="${a.link}" target="_blank" rel="noopener">${a.title}</a>
        </h3>
        ${a.excerpt ? `<p class="card-excerpt">${a.excerpt}</p>` : ''}
        <div class="card-footer">
          <span class="card-source">${a.source}</span>
          <span class="card-read-more">Read More</span>
        </div>
      </div>
    </article>`).join('');
}

// ── Main load function ────────────────────────────────────────────
async function loadFeeds(feedUrls, container, statusEl, cacheKey) {
  const cached = getCached(cacheKey);
  if (cached && cached.length) {
    if (window.RDLSearch && document.getElementById('search-input')) {
      window.RDLSearch.initSearch(cached);
    } else {
      renderArticles(cached.slice(0, 10), container);
    }
    if (statusEl) statusEl.textContent = new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    return;
  }

  showSkeletons(container, 6);

  const results = await Promise.allSettled(
    feedUrls.map(async url => {
      const text = await fetchWithProxy(url);
      return text ? parseFeed(text, url) : [];
    })
  );

  console.log('[RDL] Feed results:', results.map((r,i) => ({
    url: feedUrls[i],
    ok: r.status === 'fulfilled',
    count: r.value?.length ?? 0
  })));

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a,b) => b.pubDate - a.pubDate);

  // If search module is loaded, hand off all articles to it
  // so filtering/sorting/pagination all work correctly
  if (window.RDLSearch && document.getElementById('search-input')) {
    window.RDLSearch.initSearch(articles);
  } else {
    // Direct render with load-more pagination
    const PAGE = 10;
    let shown = Math.min(PAGE, articles.length);
    renderArticles(articles.slice(0, shown), container);

    const btn = document.getElementById('load-more-btn');
    if (btn) {
      if (articles.length > PAGE) {
        btn.style.display = 'flex';
        btn.onclick = () => {
          shown = Math.min(shown + PAGE, articles.length);
          renderArticles(articles.slice(0, shown), container);
          if (shown >= articles.length) btn.style.display = 'none';
        };
      } else {
        btn.style.display = 'none';
      }
    }
  }

  // Update count display
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = articles.length + ' articles';

  if (articles.length) setCache(cacheKey, articles);
  if (statusEl) statusEl.textContent = new Date().toLocaleString(
    'en-US',{month:'short',day:'numeric',year:'numeric',
              hour:'numeric',minute:'2-digit'});
}

// ── Mortgage Rate Widget ──────────────────────────────────────────
async function fetchMortgageRateWidget() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;

  const fallback = '<a href="https://www.mortgagenewsdaily.com/mortgage-rates.aspx" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent-teal)">See Current Rates</a>';

  try {
    const text = await fetchWithProxy('https://www.mortgagenewsdaily.com/rss/mortgage_rates.aspx');
    if (!text) throw new Error('no data');
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('parse error');

    const items = [...xml.querySelectorAll('item')];
    let r30 = null, r15 = null;
    for (const item of items.slice(0, 10)) {
      const content = (item.querySelector('title')?.textContent || '') + ' ' +
                      (item.querySelector('description')?.textContent || '');
      if (!r30 && /30[^%\d]*(\d+\.\d+)%/i.test(content)) {
        const m = content.match(/30[^%\d]*(\d+\.\d+)%/i);
        if (m) r30 = m[1] + '%';
      }
      if (!r15 && /15[^%\d]*(\d+\.\d+)%/i.test(content)) {
        const m = content.match(/15[^%\d]*(\d+\.\d+)%/i);
        if (m) r15 = m[1] + '%';
      }
      if (r30 && r15) break;
    }
    if (el30) el30.textContent = r30 || '—';
    if (el15) el15.textContent = r15 || '—';
  } catch(e) {
    if (el30) el30.innerHTML = fallback;
    if (el15) el15.innerHTML = fallback;
  }
}

// ── Auto-init ─────────────────────────────────────────────────────
function rdlFeedsInit() {
  const CACHE_VERSION = 'v4';
  if (localStorage.getItem('rdl_cache_ver') !== CACHE_VERSION) {
    Object.keys(localStorage)
      .filter(k => k.startsWith('rdl_'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem('rdl_cache_ver', CACHE_VERSION);
    console.log('[RDL] Cache cleared');
  }

  const statusEl = document.getElementById('last-updated');
  console.log('[RDL] feeds init on:', window.location.pathname);
  console.log('[RDL] RDLCards available:', !!window.RDLCards);
  console.log('[RDL] RDLSearch available:', !!window.RDLSearch);

  Object.values(RSS_CONFIG).forEach(config => {
    const container = document.getElementById(config.containerId);
    console.log('[RDL]', config.containerId, container ? 'FOUND' : 'NOT FOUND');
    if (container) {
      loadFeeds(config.feeds, container, statusEl, config.cacheKey);
    }
  });

  fetchMortgageRateWidget();
}

// Wait for all deferred scripts to finish loading
// before initializing feeds
document.addEventListener('DOMContentLoaded', () => {
  // Small timeout ensures cards.js and search.js
  // (also deferred) have fully executed
  setTimeout(rdlFeedsInit, 50);
});

// ── Public API ────────────────────────────────────────────────────
window.RDLFeeds = { RSS_CONFIG, fetchWithProxy, parseFeed, loadFeeds };
