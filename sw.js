const CACHE = 'koalendario-cache';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req.url, { cache: 'no-store' });
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const c = await caches.open(CACHE);
      const m = await c.match(req, { ignoreSearch: true });
      if (m) return m;
      throw err;
    }
  })());
});
