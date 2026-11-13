// Service Worker - HAITI REH-CARE ERP & Public Site
// Network-First with Offline Cache Fallback + precache de l'app shell.
// Les requêtes REST Supabase (lecture/écriture) sont gérées dans la page
// par assets/js/offline.js (IndexedDB), pas ici.

const CACHE_NAME = 'haiti-rehcare-cache-v20261113-1';

// App shell pré-chargée : l'ERP s'ouvre hors-ligne même avant la première visite
const APP_SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './module.html',
  './manifest.json',
  './assets/css/variables.css',
  './assets/css/main.css',
  './assets/css/layout.css',
  './assets/css/components.css',
  './assets/css/dashboard.css',
  './assets/js/supabase.js',
  './assets/js/offline.js',
  './assets/js/auth.js',
  './assets/js/layout.js',
  './assets/img/logohaitirecare.png',
  './assets/img/icons/icon-192.png',
  './assets/img/icons/icon-512.png',
  './assets/img/icons/icon-maskable-512.png',
  './assets/img/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((e) => console.warn('[SW] Precache partial:', e))
      .then(() => self.skipWaiting())
  );
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

  // Skip non-GET requests and Supabase API calls
  // (offline.js intercepte /rest/v1/* au niveau page pour le cache + la file de sync)
  if (req.method !== 'GET'
      || url.pathname.includes('/rest/v1/')
      || url.pathname.includes('/auth/v1/')
      || url.pathname.includes('/realtime/')
      || url.pathname.includes('/storage/v1/')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200
            && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
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
          if (url.pathname.startsWith('/modules/')) {
            return (await caches.match(req.url)) || (await caches.match('/module.html')) || caches.match('/dashboard.html');
          }
          return (await caches.match('/dashboard.html')) || caches.match('/index.html');
        }
      })
  );
});
