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
            const host = new URL(feedUrl).hostname.replace('www.','');
            if (host.includes('redfin') || host.includes('zillow') ||
                host.includes('realtor')) return 'market';
            if (host.includes('mortgagenewsdaily') ||
                host.includes('federalreserve') ||
                host.includes('consumerfinance')) return 'mortgage';
            if (host.includes('norada') || host.includes('retipster') ||
                host.includes('keepingcurrent') ||
                host.includes('fortunebuilders')) return 'investment';
            if (host.includes('rismedia') || host.includes('forbes') ||
                host.includes('cnbc')) return 'media';
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

// ── Main load function ────────────────────────────────────────────
async function loadFeeds(feedUrls, container, statusEl, cacheKey) {
  const cached = getCached(cacheKey);
  if (cached && cached.length) {
    if (window.RDLSearch && document.getElementById('search-input')) {
      window.RDLSearch.initSearch(cached);
    } else {
      window.RDLCards.renderCards(container, cached.slice(0, 10));
    }
    if (statusEl) statusEl.textContent = new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
    return;
  }

  window.RDLCards.renderSkeletons(container, 6);

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

  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = articles.length + ' articles';

  // If search/filter UI exists, hand off to search module
  if (window.RDLSearch && document.getElementById('search-input')) {
    window.RDLSearch.initSearch(articles);
  } else {
    // Handle load-more pagination
    const btn = document.getElementById('load-more-btn');
    const PAGE = 10;
    let shown = Math.min(PAGE, articles.length);
    window.RDLCards.renderCards(container, articles.slice(0, shown));

    if (btn) {
      if (articles.length > PAGE) {
        btn.style.display = 'flex';
        btn.onclick = () => {
          shown = Math.min(shown + PAGE, articles.length);
          window.RDLCards.renderCards(container, articles.slice(0, shown));
          if (shown >= articles.length) btn.style.display = 'none';
        };
      } else {
        btn.style.display = 'none';
      }
    }
  }

  if (articles.length) setCache(cacheKey, articles);
  if (statusEl) statusEl.textContent = new Date().toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
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
document.addEventListener('DOMContentLoaded', () => {
  const CACHE_VERSION = 'v3';
  const versionKey = 'rdl_cache_version';
  if (localStorage.getItem(versionKey) !== CACHE_VERSION) {
    Object.keys(localStorage)
      .filter(k => k.startsWith('rdl_'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem(versionKey, CACHE_VERSION);
    console.log('[RDL] Cache cleared — new version:', CACHE_VERSION);
  }

  const statusEl = document.getElementById('last-updated');
  console.log('[RDL] feeds.js init on page:', window.location.pathname);

  Object.values(RSS_CONFIG).forEach(config => {
    const container = document.getElementById(config.containerId);
    console.log('[RDL] Container', config.containerId,
                container ? 'FOUND' : 'NOT FOUND');
    if (container) {
      loadFeeds(config.feeds, container, statusEl, config.cacheKey);
    }
  });

  fetchMortgageRateWidget();
});

// ── Public API ────────────────────────────────────────────────────
window.RDLFeeds = { RSS_CONFIG, fetchWithProxy, parseFeed, loadFeeds };
