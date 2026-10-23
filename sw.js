// Service Worker - HAITI REH-CARE ERP & Public Site
// Network-First with Offline Cache Fallback
// Ensures instant updates without browser cache locking

const CACHE_NAME = 'haiti-rehcare-cache-v20261023-4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch Event — Network-First Strategy
// Always fetch fresh files from network; fallback to cache only when offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and Supabase realtime / REST API requests
  if (req.method !== 'GET' || url.pathname.includes('/rest/v1/') || url.pathname.includes('/realtime/')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
        }
        return networkResponse;
      })
      .catch(async () => {
        // Network failed (offline) -> look up in cache
        const cached = await caches.match(req);
        if (cached) return cached;

        // HTML fallback for offline navigation
        if (req.headers.get('accept')?.includes('text/html')) {
          if (url.pathname.startsWith('/site/')) {
            return (await caches.match('/site/materiel.html')) || caches.match('/site/index.html');
          }
          return (await caches.match('/dashboard.html')) || caches.match('/index.html');
        }
      })
  );
});
