const CACHE_NAME = 'higherhistory-v1';
const ASSETS = [
  './',
  './index.html',
  './assets/styles.css?v=1',
  './assets/data.js?v=1',
  './assets/app.js?v=1',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Relative paths so this works at cazzam15.github.io/History/
// Install — cache the app
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network-first for the app itself (so updates reach users),
// cache-first for everything else (icons etc.)
self.addEventListener('fetch', function(event) {
  const isAppShell = event.request.mode === 'navigate' ||
    event.request.url.endsWith('/index.html');
  if (isAppShell) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(function() {
        // Offline — serve the cached app
        return caches.match(event.request).then(c => c || caches.match('./index.html'));
      })
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
