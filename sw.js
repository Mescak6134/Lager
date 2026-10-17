// Service Worker: speichert die App-Dateien, damit sie schnell und auch offline startet.
// Daten (Supabase) werden NIE zwischengespeichert – die kommen immer frisch.
const VERSION = 'lager-v1.0.0';
const SHELL = [
  './', './index.html', './style.css', './config.js', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/db.js', './js/calc.js', './js/ui.js', './js/charts.js', './js/scanner.js', './js/exports.js',
  './js/views/overview.js', './js/views/stock.js', './js/views/book.js', './js/views/history.js', './js/views/more.js',
  './js/views/settle.js', './js/views/inventory.js', './js/views/masterdata.js', './js/views/reports.js',
  './vendor/supabase-2.117.3.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-64.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase & Co.: nicht anfassen
  // Erst Netz (immer aktuell), bei Funkloch aus dem Speicher
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
