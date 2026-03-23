// feeds.js — RealtyDataLabs RSS Feed Engine
// Uses allorigins.win proxy for reliable CORS-free feed fetching

const RSS_CONFIG = {
  marketData: {
    feeds: [
      'https://calculatedriskblog.com/feeds/posts/default',
      'https://www.nar.realtor/newsroom/rss.xml',
      'https://redfin.com/blog/feed',
      'https://eyeonhousing.org/feed/',
      'https://realtor.com/news/feed',
      'https://www.worldpropertyjournal.com/feed/rss.xml'
    ],
    containerId: 'market-data-feed'
  },
  mortgageRates: {
    feeds: [
      'https://www.mortgagenewsdaily.com/rss/mortgage_news.aspx',
      'https://www.federalreserve.gov/feeds/press_all.xml',
      'https://www.consumerfinance.gov/about-us/newsroom/feed/',
      'https://realtor.com/news/real-estate-news/feed'
    ],
    containerId: 'mortgage-rates-feed'
  },
  investmentRental: {
    feeds: [
      'https://www.apartmentlist.com/research/feed',
      'https://www.noradarealestate.com/blog/feed/',
      'https://realtor.com/news/trends/feed',
      'https://eyeonhousing.org/feed/'
    ],
    containerId: 'investment-rental-feed'
  },
  mediaInsights: {
    feeds: [
      'https://blog.rismedia.com/feed',
      'https://www.forbes.com/real-estate/feed/',
      'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000115',
      'https://redfin.com/blog/feed'
    ],
    containerId: 'media-insights-feed'
  }
};

// ── Fetch and parse a single RSS feed via multi-proxy fallback ────────────

async function fetchFeed(rssUrl) {
  // Try multiple proxies in order — if one fails, try the next
  const proxies = [
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  let text = null;

  for (const makeProxy of proxies) {
    try {
      const proxyUrl = makeProxy(rssUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const body = await res.text();
      // Make sure we actually got XML, not an error page
      if (body.includes('<item') || body.includes('<entry')) {
        text = body;
        break;
      }
    } catch (e) {
      console.warn(`Proxy failed for ${rssUrl}:`, e.message);
      continue;
    }
  }

  if (!text) {
    console.warn('All proxies failed for:', rssUrl);
    return [];
  }

  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');

    // Check for XML parse error
    if (xml.querySelector('parsererror')) {
      console.warn('XML parse error for:', rssUrl);
      return [];
    }

    // Support both RSS <item> and Atom <entry> formats
    const items = Array.from(
      xml.querySelectorAll('item').length > 0
        ? xml.querySelectorAll('item')
        : xml.querySelectorAll('entry')
    );

    return items.slice(0, 15).map(item => {
      // Extract image — try multiple locations
      const mediaNS = 'http://search.yahoo.com/mrss/';
      const mediaContent = item.getElementsByTagNameNS(mediaNS, 'content')[0] ||
                           item.getElementsByTagNameNS(mediaNS, 'thumbnail')[0];
      const enclosure = item.querySelector('enclosure[type^="image"]');
      let image = mediaContent?.getAttribute('url') ||
                  enclosure?.getAttribute('url') || null;

      // Fallback: scrape first img from description
      if (!image) {
        const desc = item.querySelector('description, summary')?.textContent || '';
        const match = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match) image = match[1];
      }

      // Clean description text
      const rawDesc = item.querySelector('description, summary, content')
                         ?.textContent || '';
      const tmp = document.createElement('div');
      tmp.innerHTML = rawDesc;
      const cleanDesc = (tmp.textContent || tmp.innerText || '')
                        .replace(/\s+/g, ' ').trim().slice(0, 220);

      // Get link — handle both RSS <link> and Atom <link href="">
      const linkEl = item.querySelector('link');
      const link = linkEl?.textContent?.trim() ||
                   linkEl?.getAttribute('href') || '#';

      // Get date — try pubDate (RSS) and published/updated (Atom)
      const dateStr = item.querySelector('pubDate, published, updated')
                         ?.textContent || '';

      return {
        title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
        link,
        pubDate: dateStr ? new Date(dateStr) : new Date(0),
        description: cleanDesc + (cleanDesc.length >= 220 ? '...' : ''),
        image,
        source: (() => {
          try { return new URL(rssUrl).hostname.replace('www.', ''); }
          catch { return rssUrl; }
        })()
      };
    });
  } catch (e) {
    console.warn('Parse error for:', rssUrl, e);
    return [];
  }
}

// ── Fetch all feeds and render into container ──────────────────────────────

async function loadAllFeeds(feedUrls, containerEl, statusEl) {
  // Show skeleton cards while loading
  containerEl.innerHTML = Array(6).fill(`
    <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;
                margin-bottom:12px;">
      <div style="height:12px;background:rgba(255,255,255,0.08);border-radius:4px;
                  width:80%;margin-bottom:8px"></div>
      <div style="height:12px;background:rgba(255,255,255,0.08);border-radius:4px;
                  width:55%;margin-bottom:8px"></div>
      <div style="height:12px;background:rgba(255,255,255,0.08);border-radius:4px;
                  width:35%"></div>
    </div>
  `).join('');

  console.log('Starting feed fetch for feeds:', feedUrls);

  const results = await Promise.allSettled(feedUrls.map(url => fetchFeed(url)));

  console.log('Feed results:', results.map((r, i) => ({
    url: feedUrls[i],
    status: r.status,
    count: r.status === 'fulfilled' ? r.value.length : 0,
    error: r.status === 'rejected' ? r.reason : null
  })));

  const articles = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(a => a.title && a.link && a.link !== '#')
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  console.log('Total articles to render:', articles.length);

  if (articles.length === 0) {
    containerEl.innerHTML = '<p style="color:var(--text-secondary,#aaa);padding:16px;">Unable to load articles at this time. Please check back soon.</p>';
    return;
  }

  // Render articles using existing card CSS classes
  containerEl.innerHTML = articles.slice(0, 10).map(a => `
    <article class="article-card fade-in">
      ${a.image ? `<div class="article-image"><img src="${a.image}" loading="lazy" alt=""
                       onerror="this.parentElement.style.display='none'"></div>` : ''}
      <div class="article-body">
        <span class="article-source">${a.source}</span>
        <h3><a href="${a.link}" target="_blank" rel="noopener">${a.title}</a></h3>
        ${a.description ? `<p class="article-description">${a.description}</p>` : ''}
        <time>${new Date(a.pubDate).toLocaleDateString('en-US', {year:'numeric', month:'short', day:'numeric'})}</time>
      </div>
    </article>
  `).join('');

  if (statusEl) {
    statusEl.textContent = new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  // Update results count if present
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = articles.length + ' articles';
}

// ── Mortgage Rate Widget ───────────────────────────────────────────────────

async function fetchMortgageRateWidget() {
  const el30 = document.getElementById('rate30-display');
  const el15 = document.getElementById('rate15-display');
  if (!el30 && !el15) return;

  const fallbackHtml = '<a href="https://www.mortgagenewsdaily.com/mortgage-rates.aspx" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--accent-teal)">See Current Rates</a>';

  try {
    const feedUrl = 'https://www.mortgagenewsdaily.com/rss/mortgage_rates.aspx';
    const proxy = 'https://api.allorigins.win/get?url=' + encodeURIComponent(feedUrl);
    const res = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('feed failed');
    const json = await res.json();

    const xml = new DOMParser().parseFromString(json.contents, 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('parse error');

    const items = [...xml.querySelectorAll('item')];
    let r30 = null, r15 = null;

    for (const item of items.slice(0, 10)) {
      const content = (item.querySelector('title')?.textContent || '') + ' ' +
                      (item.querySelector('description')?.textContent || '');
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
  const statusEl = document.getElementById('last-updated');

  // Load feeds for whichever containers exist on this page
  Object.values(RSS_CONFIG).forEach(config => {
    const container = document.getElementById(config.containerId);
    if (container) {
      loadAllFeeds(config.feeds, container, statusEl);
    }
  });

  fetchMortgageRateWidget();
});

// ── Public API ────────────────────────────────────────────────────────────

window.RDLFeeds = {
  RSS_CONFIG,
  fetchFeed,
  loadAllFeeds
};
