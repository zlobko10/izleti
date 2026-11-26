// Izleti – service worker: aplikacijo shrani za hiter zagon; podatki, vreme in zemljevidi gredo vedno na splet.
const CACHE = 'izleti-v1';
const LUPINA = ['./', 'index.html', 'app.js', 'style.css', 'manifest.json', 'icon-192.png', 'icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(LUPINA))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const lupina = u.origin === location.origin || u.hostname === 'unpkg.com';
  if (e.request.method !== 'GET' || !lupina) return;
  // najprej splet (da dobiš novo verzijo), ob napaki iz predpomnilnika
  e.respondWith(fetch(e.request).then(r => {
    const kopija = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, kopija));
    return r;
  }).catch(() => caches.match(e.request)));
});
