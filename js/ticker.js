// RealtyDataLabs — Ticker Bar
// Fetches live market data, builds ticker HTML, handles animation

const TICKER_CACHE_KEY = 'rdl_ticker_cache';
const TICKER_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// FRED API key
const FRED_API_KEY = 'dcc865cd79fab774a29ff8469d345622';
const FRED_PROXY = 'https://api.allorigins.win/raw?url=';

function fredUrl(seriesId) {
  const base = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=2`;
  return FRED_PROXY + encodeURIComponent(base);
}

// Data points to display
// Each has: label, seriesId (FRED), format function, change direction logic
const TICKER_POINTS = [
  { label: '30YR FIXED',        series: 'MORTGAGE30US', format: v => v + '%',                             changeKey: 'mortgage30' },
  { label: '15YR FIXED',        series: 'MORTGAGE15US', format: v => v + '%',                             changeKey: 'mortgage15' },
  { label: '10YR TREASURY',     series: 'DGS10',        format: v => v + '%',                             changeKey: 'dgs10'      },
  { label: 'FED FUNDS',         series: 'FEDFUNDS',     format: v => v + '%',                             changeKey: 'fedfunds'   },
  { label: 'MEDIAN HOME PRICE', series: 'MSPUS',        format: v => '$' + Number(v).toLocaleString(),    changeKey: 'mspus'      },
];

// For data we can't get from FRED easily, use static/cached values
const STATIC_POINTS = [
  { label: 'HOUSING INV YOY',   value: 'N/A', changeClass: 'neutral' },
  { label: 'MORTGAGE APPS WOW', value: 'N/A', changeClass: 'neutral' },
];

async function fetchTickerData() {
  // Check cache first
  try {
    const cached = localStorage.getItem(TICKER_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < TICKER_CACHE_TTL) {
        return data;
      }
    }
  } catch (e) { /* cache miss */ }

  // Fetch all FRED series in parallel
  const results = await Promise.all(
    TICKER_POINTS.map(point =>
      fetch(fredUrl(point.series))
        .then(r => r.json())
        .then(data => {
          const obs      = data.observations || [];
          const latest   = obs[0] ? parseFloat(obs[0].value)  : null;
          const previous = obs[1] ? parseFloat(obs[1].value)  : null;
          let changeClass = 'neutral';
          if (latest !== null && previous !== null) {
            if (latest > previous)      changeClass = 'positive';
            else if (latest < previous) changeClass = 'negative';
          }
          return {
            label: point.label,
            value: latest !== null ? point.format(latest.toFixed(2)) : 'N/A',
            changeClass,
          };
        })
        .catch(() => ({
          label: point.label,
          value: 'N/A',
          changeClass: 'neutral',
        }))
    )
  );

  const allPoints = [...results, ...STATIC_POINTS];

  // Cache results
  try {
    localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify({
      data:      allPoints,
      timestamp: Date.now(),
    }));
  } catch (e) { /* storage full */ }

  return allPoints;
}

function buildTickerHTML(points) {
  // Double the content for seamless loop:
  // The CSS animation drives from translateX(0) → translateX(-50%), so the
  // second copy fills the viewport exactly as the first copy scrolls away.
  const buildItems = () => points.map(p => `
    <span class="ticker-item">
      <span class="ticker-label">${p.label}</span>
      <span class="ticker-value ${p.changeClass}">${p.value}</span>
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
    const fallback = [
      ...TICKER_POINTS.map(p => ({ label: p.label, value: 'N/A', changeClass: 'neutral' })),
      ...STATIC_POINTS,
    ];
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
