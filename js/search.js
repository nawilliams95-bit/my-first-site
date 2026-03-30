(function () {
let allArticles = [];
let debounceTimer;
function getElements() {
return {
searchInput:   document.getElementById('search-input'),
sortSelect:    document.getElementById('sort-select'),
sourceSelect:  document.getElementById('source-select'),
resultsCount:  document.getElementById('results-count'),
articlesGrid:  document.getElementById('articles-grid') || document.querySelector('.articles-grid'),
loadMoreBtn:   document.getElementById('load-more-btn'),
};
}
let displayedCount = 12;
const PAGE_SIZE = 12;
function applyFilters() {
const el = getElements();
if (!el.articlesGrid) return;
const searchVal  = el.searchInput  ? el.searchInput.value.toLowerCase().trim()  : '';
const sortVal    = el.sortSelect   ? el.sortSelect.value   : 'latest';
const sourceVal  = el.sourceSelect ? el.sourceSelect.value : 'all';
let filtered = allArticles.filter(art => {
const body = (art.excerpt || art.description || '').toLowerCase();
const matchSearch = !searchVal ||
art.title.toLowerCase().includes(searchVal) ||
body.includes(searchVal) ||
art.source.toLowerCase().includes(searchVal);
const matchSource = sourceVal === 'all' || art.source === sourceVal;
return matchSearch && matchSource;
});
if (sortVal === 'newest' || sortVal === 'latest') {
filtered.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
} else if (sortVal === 'oldest') {
filtered.sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
} else if (sortVal === 'az') {
filtered.sort((a, b) => a.title.localeCompare(b.title));
} else {
if (searchVal) {
filtered.sort((a, b) => {
const bodyA = (a.excerpt || a.description || '').toLowerCase();
const bodyB = (b.excerpt || b.description || '').toLowerCase();
const scoreA = (a.title.toLowerCase().split(searchVal).length - 1) * 2 +
(bodyA.split(searchVal).length - 1);
const scoreB = (b.title.toLowerCase().split(searchVal).length - 1) * 2 +
(bodyB.split(searchVal).length - 1);
return scoreB - scoreA;
});
} else {
filtered.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
}
}
if (el.resultsCount) {
el.resultsCount.textContent = filtered.length + ' article' + (filtered.length !== 1 ? 's' : '');
}
const toShow = filtered.slice(0, displayedCount);
window.RDLCards.renderCards(el.articlesGrid, toShow);
if (el.loadMoreBtn) {
el.loadMoreBtn.style.display = filtered.length > displayedCount ? 'flex' : 'none';
el.loadMoreBtn.dataset.total = filtered.length;
el.loadMoreBtn._filtered = filtered;
}
}
function populateSourceFilter(articles) {
const el = getElements();
if (!el.sourceSelect) return;
const sources = [...new Set(articles.map(a => a.source))].sort();
sources.forEach(src => {
const opt = document.createElement('option');
opt.value = src;
opt.textContent = src;
el.sourceSelect.appendChild(opt);
});
}
function initSearch(articles) {
allArticles = articles;
displayedCount = PAGE_SIZE;
const el = getElements();
populateSourceFilter(articles);
if (el.searchInput) {
el.searchInput.addEventListener('input', () => {
clearTimeout(debounceTimer);
debounceTimer = setTimeout(() => {
displayedCount = PAGE_SIZE;
applyFilters();
}, 300);
});
}
if (el.sortSelect) {
el.sortSelect.addEventListener('change', () => {
displayedCount = PAGE_SIZE;
applyFilters();
});
}
if (el.sourceSelect) {
el.sourceSelect.addEventListener('change', () => {
displayedCount = PAGE_SIZE;
applyFilters();
});
}
if (el.loadMoreBtn) {
el.loadMoreBtn.addEventListener('click', () => {
displayedCount += PAGE_SIZE;
applyFilters();
const cards = el.articlesGrid.querySelectorAll('.article-card');
const newCard = cards[displayedCount - PAGE_SIZE];
if (newCard) newCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
}
applyFilters();
}
window.RDLSearch = { initSearch };
})();