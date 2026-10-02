// Service Worker - HAITI REH-CARE ERP & Public Site
// Enables 100% offline functionality (Cache-First / Network Fallback)

const CACHE_NAME = 'haiti-rehcare-cache-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/module.html',
  '/onboarding.html',
  '/manifest.json',
  '/assets/css/variables.css?v=8',
  '/assets/css/main.css?v=8',
  '/assets/css/layout.css?v=8',
  '/assets/css/components.css?v=8',
  '/assets/css/dashboard.css?v=8',
  '/assets/js/supabase.js?v=9',
  '/assets/js/auth.js?v=9',
  '/assets/js/layout.js?v=9',
  '/assets/js/modular-dashboard.js',
  '/assets/js/stock.js',
  '/assets/js/clients.js',
  '/assets/js/finances.js',
  '/assets/js/rh.js',
  '/assets/js/taches.js',
  '/assets/js/rapports.js',
  '/assets/js/users.js',
  '/assets/js/patients.js?v=10',
  '/assets/js/annexes.js?v=10',
  '/assets/img/logohaitirecare.png',
  '/modules/stock/inventaire.html',
  '/modules/stock/catalogue.html',
  '/modules/stock/entrees.html',
  '/modules/stock/sorties.html',
  '/modules/stock/alertes.html',
  '/modules/clients/liste.html',
  '/modules/clients/fiche.html',
  '/modules/finances/revenus.html',
  '/modules/finances/caisse.html',
  '/modules/rh/employes.html',
  '/modules/rh/presences.html',
  '/modules/taches/kanban.html',
  '/modules/communication/messages.html',
  '/modules/rapports/global.html',
  '/modules/parametres/entreprise.html',
  '/modules/users/liste.html',
  '/modules/siteweb/index.html',
  '/site/index.html',
  '/site/soins.html',
  '/site/materiel.html',
  '/site/annonces.html',
  '/site/contact.html',
  '/site/compte.html',
  '/site/rendez-vous.html',
  '/site/assets/site.css',
  '/site/assets/site.js',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
];

// Install Event — Pre-cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets for offline use...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to pre-cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Network-First with Cache Fallback for dynamic pages, Cache-First for static assets
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and Supabase realtime / API post requests (handled by OfflineStorage queue in JS)
  if (req.method !== 'GET' || url.pathname.includes('/rest/v1/') || url.pathname.includes('/realtime/')) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache freshness
        fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkResponse));
          }
        }).catch(() => { /* Offline, ignore network fetch error */ });
        
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        // Fallback for HTML navigation requests when completely offline
        if (req.headers.get('accept')?.includes('text/html')) {
          if (url.pathname.startsWith('/site/')) {
            return caches.match('/site/materiel.html');
          }
          return caches.match('/dashboard.html') || caches.match('/index.html');
        }
      });
    })
  );
});
