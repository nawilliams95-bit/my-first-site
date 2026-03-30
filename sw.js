const CACHE_NAME = 'rdl-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/about',
  '/advertise',
  '/contact',
  '/disclaimer',
  '/investment-rental',
  '/market-data',
  '/privacy-policy',
  '/rates-market-data',
  '/terms-of-service',
  '/thank-you',
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
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
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(cached) {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Assets (CSS, JS, images): cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || !response.ok || response.type === 'opaque') {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
