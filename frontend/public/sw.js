// Anees service worker. Deliberately tiny: it exists so the site can be installed to the home screen and so a
// page opened with no connection shows a friendly offline screen instead of the browser's error page.
// It never caches the app's pages, scripts or API responses -- every request goes to the network as usual,
// so a new deploy is always picked up straight away and nobody is ever served stale data.

const CACHE = 'anees-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only page navigations get the offline fallback; everything else (assets, /api, video) is untouched.
  if (req.mode !== 'navigate') return;
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
