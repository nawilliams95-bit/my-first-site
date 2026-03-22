// RealtyDataLabs — Article Cards
// Builds card HTML from article objects

// Category badge config
const CATEGORY_CONFIG = {
  market:     { label: 'Market Data',      badgeClass: 'badge-market',     fallback: 'images/fallback-market.jpg',     emoji: '📊' },
  mortgage:   { label: 'Mortgage & Rates', badgeClass: 'badge-mortgage',   fallback: 'images/fallback-mortgage.jpg',   emoji: '🏠' },
  economic:   { label: 'Economic News',    badgeClass: 'badge-economic',   fallback: 'images/fallback-economic.jpg',   emoji: '📈' },
  investment: { label: 'Investment & Rental', badgeClass: 'badge-investment', fallback: 'images/fallback-investment.jpg', emoji: '💼' },
  industry:   { label: 'Industry News',    badgeClass: 'badge-industry',   fallback: 'images/fallback-industry.jpg',   emoji: '🏢' },
  regional:   { label: 'Regional Data',    badgeClass: 'badge-regional',   fallback: 'images/fallback-regional.jpg',   emoji: '🗺️' }
};

// Format relative time: "2 hours ago"
function formatRelativeTime(pubDate) {
  if (!pubDate) return '';
  const diff = Date.now() - new Date(pubDate).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 1)  return days + ' days ago';
  if (days === 1) return '1 day ago';
  if (hours > 1) return hours + ' hours ago';
  if (hours === 1) return '1 hour ago';
  if (mins > 1)  return mins + ' minutes ago';
  return 'Just now';
}

// ── Report Paywall ──────────────────────────────────────────────────────────
// Stores reported domains in localStorage; call from card onclick handler
function reportArticle(e, url, title) {
  e.preventDefault();
  e.stopPropagation();
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const key    = 'rdl_reported_paywalls';
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (!stored.find(r => r.domain === domain)) {
      stored.push({ domain, url, title, reportedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(stored));
    }
    // Visual feedback
    const btn = e.currentTarget;
    btn.textContent = 'Reported';
    btn.classList.add('report-link-sent');
  } catch {}
}

// Log all reported domains to console on page load (dev visibility)
(function logReports() {
  try {
    const reports = JSON.parse(localStorage.getItem('rdl_reported_paywalls') || '[]');
    if (reports.length) {
      console.group('[RDL] Reported paywall domains (' + reports.length + ')');
      reports.forEach(r => console.log(r.domain, '—', r.reportedAt));
      console.groupEnd();
    }
  } catch {}
})();

// Build a standard article card
function buildCard(article, featured = false) {
  const cfg = CATEGORY_CONFIG[article.category] || CATEGORY_CONFIG.market;
  const time = formatRelativeTime(article.pubDate);
  const featuredClass = featured ? ' card-featured' : '';

  const imageHtml = article.image
    ? `<img
         src="${article.image}"
         alt=""
         loading="lazy"
         onload="this.classList.add('loaded')"
         onerror="this.parentElement.innerHTML='<span class=\\"card-image-fallback\\">${cfg.emoji}</span>'"
       />`
    : `<span class="card-image-fallback">${cfg.emoji}</span>`;

  const verifiedBadge = article.verified
    ? `<span class="card-verified" title="Verified free source"></span>`
    : '';

  const reportLink = `<span class="report-link" title="Report paywall"
    onclick="reportArticle(event,'${article.link.replace(/'/g, "\\'")}','${article.title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">Report paywall</span>`;

  return `
    <a href="${article.link}" target="_blank" rel="noopener noreferrer"
       class="article-card${featuredClass} fade-in" aria-label="${article.title}">
      <div class="card-image-wrap">${imageHtml}</div>
      <div class="card-body">
        <div class="card-meta">
          <span class="badge ${cfg.badgeClass}">${cfg.label}</span>
          <span class="card-meta-right">
            ${verifiedBadge}
            <span class="card-timestamp">${time}</span>
          </span>
        </div>
        <h3 class="card-headline">${article.title}</h3>
        ${article.excerpt ? `<p class="card-excerpt">${article.excerpt}</p>` : ''}
        <div class="card-footer">
          <span class="card-source">${article.source}</span>
          <span class="card-footer-right">
            ${reportLink}
            <span class="card-read-more">Read More</span>
          </span>
        </div>
      </div>
    </a>
  `;
}

// Build a skeleton loading card
function buildSkeletonCard() {
  return `
    <div class="article-card card-skeleton">
      <div class="card-image-wrap skeleton-image skeleton"></div>
      <div class="card-body">
        <div class="card-meta">
          <span class="skeleton-badge skeleton"></span>
          <span class="skeleton-badge skeleton" style="width:60px"></span>
        </div>
        <div class="skeleton-headline skeleton"></div>
        <div class="skeleton-headline skeleton skeleton-headline-2"></div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
          <div class="skeleton" style="height:11px;width:100%"></div>
          <div class="skeleton" style="height:11px;width:90%"></div>
          <div class="skeleton" style="height:11px;width:60%"></div>
        </div>
      </div>
    </div>
  `;
}

// Render N skeleton cards into a container
function renderSkeletons(container, count = 3) {
  if (!container) return;
  container.innerHTML = Array(count).fill(0).map(() => buildSkeletonCard()).join('');
}

// Render articles into a container
function renderCards(container, articles, featuredFirst = false) {
  if (!container) return;
  if (!articles || !articles.length) {
    container.innerHTML = `<p class="text-secondary" style="grid-column:1/-1;text-align:center;padding:40px 0">No articles available at this time.</p>`;
    return;
  }
  container.innerHTML = articles.map((art, i) => buildCard(art, featuredFirst && i === 0)).join('');
}

window.RDLCards = { buildCard, buildSkeletonCard, renderSkeletons, renderCards, reportArticle, CATEGORY_CONFIG };
