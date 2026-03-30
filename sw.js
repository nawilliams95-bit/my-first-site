const CACHE_NAME = 'rdl-cache-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/about.html',
  '/advertise.html',
  '/contact.html',
  '/disclaimer.html',
  '/investment-rental.html',
  '/market-data.html',
  '/media-insights.html',
  '/privacy-policy.html',
  '/rates-market-data.html',
  '/terms-of-service.html',
  '/thank-you.html',
  '/css/base.css',
  '/css/cards.css',
  '/css/category.css',
  '/css/footer.css',
  '/css/forms.css',
  '/css/header.css',
  '/css/homepage.css',
  '/css/media.css',
  '/css/mobile.css',
  '/css/ticker.css',
  '/js/cards.js',
  '/js/feeds.js',
  '/js/main.js',
  '/js/search.js',
  '/js/ticker.js',
  '/images/background.jpg',
  '/images/nick-williams.jpeg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(function() {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
