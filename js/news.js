// ===============================
// LIVE NEWS FEED (REAL ESTATE & ECONOMIC INTEL)
// ===============================

// RSS → JSON proxy
const RSS_PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";

// AUTO-REFRESH INTERVAL (milliseconds)
// 15 minutes is ideal for economic data
const AUTO_REFRESH_INTERVAL = 1000 * 60 * 15;

// PUBLIC, NON-PAYWALLED, DATA-FIRST SOURCES ONLY
const RSS_FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", label: "Federal Reserve" },
  { url: "https://www.bls.gov/feed/bls_latest.rss", label: "BLS" },
  { url: "https://www.census.gov/economic-indicators/rss.xml", label: "U.S. Census Bureau" },
  { url: "https://www.freddiemac.com/blog/rss.xml", label: "Freddie Mac" },
  { url: "https://www.fanniemae.com/rss.xml", label: "Fannie Mae" },
  { url: "https://www.redfin.com/news/feed/", label: "Redfin Research" },
  { url: "https://www.zillow.com/research/feed/", label: "Zillow Research" },
  { url: "https://www.housingwire.com/feed/", label: "HousingWire" }
];

// Target container
const newsFeed = document.querySelector(".news-feed");

// ===============================
// HARD DATA & POLICY SIGNALS ONLY
// ===============================

const DATA_SIGNALS = [
  "basis point",
  "bps",
  "rate hike",
  "rate cut",
  "interest rate",
  "mortgage rate",
  "fomc",
  "federal reserve",
  "monetary policy",
  "cpi",
  "inflation",
  "jobs report",
  "employment report",
  "nonfarm payrolls",
  "unemployment rate",
  "gdp",
  "housing starts",
  "building permits",
  "existing home sales",
  "new home sales",
  "home price index",
  "case-shiller",
  "inventory",
  "months of supply",
  "rose",
  "fell",
  "declined",
  "increased",
  "decreased",
  "jumped",
  "dropped",
  "surged",
  "slowed"
];

const LIFESTYLE_BLOCKERS = [
  "tips",
  "how to",
  "best places",
  "where to live",
  "buying guide",
  "selling guide",
  "renovation",
  "design",
  "decor",
  "vacation",
  "celebrity",
  "luxury home",
  "dream home"
];

function isDataDriven(item) {
  const text = `${item.title} ${item.description || ""}`.toLowerCase();
  return DATA_SIGNALS.some(signal => text.includes(signal));
}

function isNotLifestyle(item) {
  const text = `${item.title} ${item.description || ""}`.toLowerCase();
  return !LIFESTYLE_BLOCKERS.some(blocker => text.includes(blocker));
}

function isSourceAllowed(item) {
  const source = item._sourceLabel.toLowerCase();

  if (
    source.includes("federal") ||
    source.includes("bls") ||
    source.includes("census")
  ) {
    return true;
  }

  return /data|report|index|survey|rates|prices|inventory|sales/i.test(item.title);
}

// ===============================
// HELPERS
// ===============================

function extractImageFromDescription(description) {
  if (!description) return null;
  const match = description.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : null;
}

function resolveSource(item, fallback) {
  if (item.author && item.author.length < 40) return item.author;
  return fallback || "Source";
}

function resolveImage(item) {
  return (
    item.thumbnail ||
    (item.enclosure && item.enclosure.link) ||
    extractImageFromDescription(item.description) ||
    null
  );
}

// ===============================
// MAIN LOAD FUNCTION
// ===============================

function loadMarketFeed() {
  if (!newsFeed) return;

  Promise.all(
    RSS_FEEDS.map(feed =>
      fetch(
        RSS_PROXY +
          encodeURIComponent(feed.url) +
          "&_=" +
          Date.now()
      )
        .then(res => res.json())
        .then(data => {
          if (!data || !data.items) return [];
          return data.items.map(item => ({
            ...item,
            _sourceLabel: feed.label
          }));
        })
        .catch(() => [])
    )
  )
    .then(results => {
      const items = results
        .flat()
        .filter(item => item.title && item.link)
        .filter(isDataDriven)
        .filter(isNotLifestyle)
        .filter(isSourceAllowed)
        .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
        .slice(0, 6);

      newsFeed.innerHTML = "";

      if (!items.length) {
        newsFeed.innerHTML = `
          <article class="news-item">
            <div class="news-content">
              <h3>No new market data available</h3>
            </div>
          </article>
        `;
        return;
      }

      items.forEach(item => {
        const article = document.createElement("article");
        article.className = "news-item";

        const image = resolveImage(item);
        const source = resolveSource(item, item._sourceLabel);

        article.innerHTML = `
          ${image ? `
            <img
              src="${image}"
              alt=""
              class="news-thumb"
              loading="lazy"
              onerror="this.remove()"
            />
          ` : ""}
          <div class="news-content">
            <span class="news-source">${source}</span>
            <h3>
              <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                ${item.title}
              </a>
            </h3>
            <time>${new Date(item.pubDate).toLocaleDateString()}</time>
          </div>
        `;

        newsFeed.appendChild(article);
      });
    })
    .catch(() => {
      newsFeed.innerHTML = `
        <article class="news-item">
          <div class="news-content">
            <h3>Market data feed temporarily unavailable</h3>
          </div>
        </article>
      `;
    });
}

// ===============================
// INITIAL LOAD + AUTO REFRESH
// ===============================

loadMarketFeed();

setInterval(loadMarketFeed, AUTO_REFRESH_INTERVAL);
