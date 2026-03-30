const TICKER_CACHE_KEY = 'rdl_ticker_v2';
const RATES_RAW_KEY   = 'rdl_rates_raw';   // shared with rates page
const TICKER_CACHE_TTL = 60 * 60 * 1000; // 1 hour
function freshnessClass(dateStr) {
if (!dateStr) return 'fresh-unknown';
const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
if (ageDays <= 1)  return 'fresh-green';   // updated within 24h
if (ageDays <= 7)  return 'fresh-yellow';  // 1-7 days old
return 'fresh-gray';                        // older or unavailable
}
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
: latest > previous ? 'negative'
: latest < previous ? 'positive' : 'neutral',
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
const latest  = parseFloat(obs[0]?.value);
const yearAgo = parseFloat(obs[Math.min(12, obs.length - 1)]?.value);
if (isNaN(latest)) return { value: 'N/A', changeClass: 'neutral', timestamp: obs[0]?.date };
const yoy = isNaN(yearAgo) ? null : ((latest - yearAgo) / yearAgo * 100);
return {
value:       latest.toFixed(1) + 'mo' + (yoy !== null ? ' (' + (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '% YoY)' : ''),
changeClass: yoy === null ? 'neutral' : yoy > 0 ? 'negative' : yoy < 0 ? 'positive' : 'neutral',
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
async function fetchTickerData() {
try {
const cached = localStorage.getItem(TICKER_CACHE_KEY);
if (cached) {
const { data, timestamp } = JSON.parse(cached);
if (Date.now() - timestamp < TICKER_CACHE_TTL) return data;
}
} catch (e) {}
let apiData;
try {
const raw = localStorage.getItem(RATES_RAW_KEY);
if (raw) {
const { data, timestamp } = JSON.parse(raw);
if (Date.now() - timestamp < TICKER_CACHE_TTL) apiData = data;
}
} catch (e) {}
if (!apiData) {
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 8000);
try {
const res = await fetch('/api/rates', { signal: controller.signal });
clearTimeout(timeout);
apiData = await res.json();
try {
localStorage.setItem(RATES_RAW_KEY, JSON.stringify({ data: apiData, timestamp: Date.now() }));
} catch (e) {}
} catch {
clearTimeout(timeout);
return TICKER_POINTS.map(p => ({
label:          p.label,
value:          p.fallback,
changeClass:    'neutral',
freshnessClass: 'fresh-unknown'
}));
}
}
const results = TICKER_POINTS.map(point => {
const obs = apiData[point.series] || [];
if (!obs.length) {
return { label: point.label, value: point.fallback, changeClass: 'neutral', freshnessClass: 'fresh-unknown' };
}
const formatted = point.format(obs);
return {
label:          point.label,
value:          formatted.value,
changeClass:    formatted.changeClass,
freshnessClass: freshnessClass(formatted.timestamp)
};
});
try {
localStorage.setItem(TICKER_CACHE_KEY, JSON.stringify({ data: results, timestamp: Date.now() }));
} catch (e) {}
return results;
}
function buildTickerHTML(points) {
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
showSkeleton(track);
let points;
try {
points = await fetchTickerData();
track.innerHTML = buildTickerHTML(points);
} catch (e) {
points = TICKER_POINTS.map(p => ({
label:          p.label,
value:          p.fallback,
changeClass:    'neutral',
freshnessClass: 'fresh-unknown'
}));
track.innerHTML = buildTickerHTML(points);
}
document.dispatchEvent(new CustomEvent('rdl:tickerReady', { detail: points }));
track.addEventListener('mouseenter', () => {
track.style.animationPlayState = 'paused';
});
track.addEventListener('mouseleave', () => {
track.style.animationPlayState = 'running';
});
}
document.addEventListener('DOMContentLoaded', initTicker);