const CACHE_NAME = 'mujic-pwa-v12.0.17-pro-polish';
const APP_SHELL = [
  './', './index.html', './VERSION', './manifest.webmanifest', './changlog.json', './css/app.css',
  './js/vendor-loader.js', './js/core.js', './js/storage.js', './js/lyrics.js', './js/dialogs.js', './js/player.js', './js/library.js', './js/ui.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
const RUNTIME_HOSTS = ['fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async path => { try { await cache.add(path); } catch(e) { /* one missing shell item should not break install */ } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mujic-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const isFontCss = !same && url.hostname === 'fonts.googleapis.com';
  const isFontFile = !same && url.hostname === 'fonts.gstatic.com';
  if (!same && !isFontCss && !isFontFile) return; // lyrics/provider APIs never block the offline shell
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put('./index.html', res.clone()).catch(()=>{});
        return res;
      } catch (e) { return cached || cache.match('./index.html') || Response.error(); }
    }
    // Local app modules and assets use cache-first to keep startup consistent and offline-safe.
    if (same && cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(()=>{});
      return res;
    } catch(e) {
      if (cached) return cached;
      return Response.error();
    }
  })());
});
