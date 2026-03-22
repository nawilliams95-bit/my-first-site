// RealtyDataLabs — Ticker Bar
// Fetches live market data, builds ticker HTML, handles animation
// Freshness dot CSS is in css/ticker.css — classes: .ticker-fresh.fresh-green, .fresh-yellow, .fresh-gray, .fresh-unknown

const TICKER_CACHE_KEY = 'rdl_ticker_cache';
const TICKER_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// FRED API key
const FRED_API_KEY = '4f73d187e5b0e664e9447b7d92972edc';
const FRED_PROXY = 'https://api.allorigins.win/get?url=';

function fredUrl(seriesId, limit) {
  const base = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  return FRED_PROXY + encodeURIComponent(base);
}

// Returns a CSS class based on how recently the data was published
function freshnessClass(dateStr) {
  if (!dateStr) return 'fresh-unknown';
  const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 1)  return 'fresh-green';   // updated within 24h
  if (ageDays <= 7)  return 'fresh-yellow';  // 1-7 days old
  return 'fresh-gray';                        // older or unavailable
}

// seriesId, label, format, limit — limit=14 allows YoY calculations
const TICKER_POINTS = [
  {
    label:    '30YR FIXED',
    series:   'MORTGAGE30US',
    limit:    2,
    fallback: '6.85%',
    format: (obs) => {
      const latest   = parseFloat(obs[0]?.value);
      const previous = parseFloat(obs[1]?.value);
      return {
        value:       isNaN(latest)   ? 'N/A' : latest.toFixed(2) + '%',
        changeClass: isNaN(latest) || isNaN(previous) ? 'neutral'
                     : latest > previous ? 'positive'
                     : latest < previous ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    '15YR FIXED',
    series:   'MORTGAGE15US',
    limit:    2,
    fallback: '6.20%',
    format: (obs) => {
      const latest   = parseFloat(obs[0]?.value);
      const previous = parseFloat(obs[1]?.value);
      return {
        value:       isNaN(latest)   ? 'N/A' : latest.toFixed(2) + '%',
        changeClass: isNaN(latest) || isNaN(previous) ? 'neutral'
                     : latest > previous ? 'positive'
                     : latest < previous ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    '10YR TREASURY',
    series:   'DGS10',
    limit:    2,
    fallback: '4.25%',
    format: (obs) => {
      const latest   = parseFloat(obs[0]?.value);
      const previous = parseFloat(obs[1]?.value);
      return {
        value:       isNaN(latest)   ? 'N/A' : latest.toFixed(2) + '%',
        changeClass: isNaN(latest) || isNaN(previous) ? 'neutral'
                     : latest > previous ? 'positive'
                     : latest < previous ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    'FED FUNDS',
    series:   'FEDFUNDS',
    limit:    2,
    fallback: '5.33%',
    format: (obs) => {
      const latest   = parseFloat(obs[0]?.value);
      const previous = parseFloat(obs[1]?.value);
      return {
        value:       isNaN(latest)   ? 'N/A' : latest.toFixed(2) + '%',
        changeClass: isNaN(latest) || isNaN(previous) ? 'neutral'
                     : latest > previous ? 'positive'
                     : latest < previous ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    'MEDIAN HOME PRICE',
    series:   'MSPUS',
    limit:    2,
    fallback: '$412K',
    format: (obs) => {
      const latest   = parseFloat(obs[0]?.value);
      const previous = parseFloat(obs[1]?.value);
      return {
        value:       isNaN(latest)   ? 'N/A' : '$' + Math.round(latest).toLocaleString(),
        changeClass: isNaN(latest) || isNaN(previous) ? 'neutral'
                     : latest > previous ? 'positive'
                     : latest < previous ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    'HOUSING SUPPLY',
    series:   'MSACSR',      // Monthly Supply of Houses — use YoY comparison
    limit:    14,
    fallback: '3.5mo',
    format: (obs) => {
      // obs is sorted desc (newest first); obs[0] = latest, obs[12] = ~12 months ago
      const latest  = parseFloat(obs[0]?.value);
      const yearAgo = parseFloat(obs[Math.min(12, obs.length - 1)]?.value);
      if (isNaN(latest)) return { value: 'N/A', changeClass: 'neutral', timestamp: obs[0]?.date };
      const yoy = isNaN(yearAgo) ? null : ((latest - yearAgo) / yearAgo * 100);
      return {
        value:       latest.toFixed(1) + 'mo' + (yoy !== null ? ' (' + (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '% YoY)' : ''),
        changeClass: yoy === null ? 'neutral' : yoy > 0 ? 'positive' : yoy < 0 ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  },
  {
    label:    'MORT RATE WoW',
    series:   'MORTGAGE30US',   // Weekly — WoW change in the 30yr rate
    limit:    3,
    fallback: '6.85% (+0.00 WoW)',
    format: (obs) => {
      const latest  = parseFloat(obs[0]?.value);
      const prev    = parseFloat(obs[1]?.value);
      if (isNaN(latest)) return { value: 'N/A', changeClass: 'neutral', timestamp: obs[0]?.date };
      const wow = isNaN(prev) ? null : (latest - prev);
      return {
        value:       latest.toFixed(2) + '%' + (wow !== null ? ' (' + (wow >= 0 ? '+' : '') + wow.toFixed(2) + ' WoW)' : ''),
        changeClass: wow === null ? 'neutral' : wow > 0 ? 'positive' : wow < 0 ? 'negative' : 'neutral',
        timestamp:   obs[0]?.date
      };
    }
  }
];

async function fetchTickerValue(fetchFn, fallback) {
  try {
    const val = await fetchFn();
    return (val !== null && val !== undefined && val !== '') ? val : fallback;
  } catch {
    return fallback;
  }
}

async function fetchTickerData() {
  // Check cache
  try {
    const cached = localStorage.getItem(TICKER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TICKER_CACHE_TTL) return data;
    }
  } catch (e) {}

  const results = await Promise.all(
    TICKER_POINTS.map(point =>
      fetch(fredUrl(point.series, point.limit))
        .then(r => r.json())
        .then(wrapper => {
          const data = JSON.parse(wrapper.contents);
          const obs = (data.observations || []).filter(o => o.value !== '.');
          const formatted = obs.length ? point.format(obs) : { value: point.fallback, changeClass: 'neutral', timestamp: null };
          return {
            label:          point.label,
            value:          formatted.value,
            changeClass:    formatted.changeClass,
            freshnessClass: freshnessClass(formatted.timestamp)
          };
        })
        .catch(() => ({
          label:          point.label,
          value:          point.fallback,
          changeClass:    'neutral',
          freshnessClass: 'fresh-unknown'
        }))
    )
  );

  try {
    localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify({ data: results, timestamp: Date.now() }));
  } catch (e) {}

  return results;
}

function buildTickerHTML(points) {
  // Double the content for seamless loop:
  // The CSS animation drives from translateX(0) → translateX(-50%), so the
  // second copy fills the viewport exactly as the first copy scrolls away.
  const buildItems = () => points.map(p => `
    <span class="ticker-item">
      <span class="ticker-label">${p.label}</span>
      <span class="ticker-value ${p.changeClass}">${p.value}</span>
      <span class="ticker-fresh ${p.freshnessClass || 'fresh-unknown'}" title="Data freshness"></span>
    </span>
    <span class="ticker-separator" aria-hidden="true"></span>
  `).join('');
  return buildItems() + buildItems();
}

function showSkeleton(track) {
  track.innerHTML = Array(14).fill(0).map(() =>
    `<span class="ticker-item"><span class="ticker-skeleton-item skeleton"></span></span>` +
    `<span class="ticker-separator" aria-hidden="true"></span>`
  ).join('');
}

async function initTicker() {
  const bar   = document.querySelector('.ticker-bar');
  const track = document.querySelector('.ticker-track');
  if (!bar || !track) return;

  // Show skeleton while loading
  showSkeleton(track);

  try {
    const points = await fetchTickerData();
    track.innerHTML = buildTickerHTML(points);
  } catch (e) {
    // On total failure, show N/A values
    const fallback = TICKER_POINTS.map(p => ({
      label:          p.label,
      value:          'N/A',
      changeClass:    'neutral',
      freshnessClass: 'fresh-unknown'
    }));
    track.innerHTML = buildTickerHTML(fallback);
  }

  // Pause/resume on hover (CSS rule also handles this; JS ensures
  // dynamically re-rendered content respects the interaction)
  track.addEventListener('mouseenter', () => {
    track.style.animationPlayState = 'paused';
  });
  track.addEventListener('mouseleave', () => {
    track.style.animationPlayState = 'running';
  });
}

document.addEventListener('DOMContentLoaded', initTicker);
