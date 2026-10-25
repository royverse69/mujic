/* Copyright mujic@royverse69 */
const CACHE_NAME = 'mujic-pwa-v13.2.8-secure-media';
const API_CACHE = 'mujic-api-v4';
const ART_CACHE = 'mujic-art-v4';
const CONFIG_CACHE = 'mujic-config-v1';
const API_ORIGIN = 'https://mujic.calverse.online';
const API_FRESH_MS = 30 * 60 * 1000;
const API_SONG_FRESH_MS = 4 * 60 * 1000;
const API_SEARCH_FRESH_MS = 5 * 60 * 1000;
const API_SEARCH_STALE_MS = 60 * 60 * 1000;
const NAVIGATION_TIMEOUT_MS = 3500;
const API_STALE_MS = 20 * 60 * 60 * 1000; // Keep cached encrypted media tokens younger than their 24-hour TTL.
const MAX_API_ENTRIES = 400;
const MAX_ART_ENTRIES = 600;
const MEDIA_CHUNK_CACHE = 'mujic-media-chunks-v4';
const MEDIA_IMAGE_CACHE = 'mujic-media-images-v4';
const BACKEND_ORIGIN = 'https://mujic.calverse.online';
const MAX_MEDIA_CHUNK_BYTES = 262144;
const MAX_MEDIA_IMAGE_ENTRIES = 400;
const MAX_MEDIA_IMAGE_BYTES = 80 * 1024 * 1024;
const APP_SHELL = [
  './', './index.html', './VERSION', './manifest.webmanifest', './css/app.css',
  './js/vendor-loader.js', './js/core.js', './js/storage.js', './js/backend-config.js', './js/module-loader.js', './js/online-provider.js', './js/lyrics.js', './js/dialogs.js', './js/player.js', './js/library.js', './js/ui.js', './js/ui-settings.js', './js/ui-library.js', './js/ui-search.js', './js/ui-lyrics.js', './js/lyrics-share.js', './js/ui-history.js', './js/ui-player.js', './js/track-actions.js', './js/ui-events.js', './js/keyboard.js', './js/onboarding.js', './js/app.js',
  './data/discovery-catalog.json', './icons/icon-192.png', './icons/icon-512.png', './icons/Spotify%20Logo%20-%20Black.png', './icons/Spotify%20Logo%20-%20White.png'
];
const RUNTIME_HOSTS = ['fonts.googleapis.com','fonts.gstatic.com'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(APP_SHELL.map(async path => { try { await cache.add(path); } catch(e) { } }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k =>
    (k.startsWith('mujic-pwa-') && k !== CACHE_NAME) ||
    /^mujic-media-chunks-v\d+$/.test(k) && k !== MEDIA_CHUNK_CACHE ||
    /^mujic-media-images-v\d+$/.test(k) && k !== MEDIA_IMAGE_CACHE ||
    /^mujic-(api|art)-v\d+$/.test(k) && k !== API_CACHE && k !== ART_CACHE
  ).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const MEDIA_TOKEN_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.(?:m4a|mp4|aac|mp3|jpg|jpeg|png|webp|avif))?$/i;
const mediaTokenFromRoute = url => {
  const token = url.searchParams.get('token') || '';
  return MEDIA_TOKEN_RE.test(token) ? token : '';
};
const mediaRouteKey = (pathname, token) => {
  const key = new URL(pathname, self.location.origin);
  key.searchParams.set('token', token);
  return new Request(key.href, { method:'GET' });
};
const fetchBackendSecureMedia = (token, request, rangeOverride = '') => {
  const target = new URL(`/m/${token}`, BACKEND_ORIGIN);
  const headers = new Headers();
  for (const name of ['Range','If-Range','If-None-Match','If-Modified-Since','Accept']) {
    const value = name === 'Range' && rangeOverride ? rangeOverride : request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (rangeOverride) headers.set('Range', rangeOverride);
  const go = () => fetch(target.href, { method:'GET', headers, credentials:'omit', redirect:'follow' });
  return go().catch(() => go());
};
const storeMediaChunk = async (cache, key, response) => {
  const range = response.headers.get('Content-Range') || '';
  const match = range.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (response.status !== 206 || !match || Number(match[1]) !== 0 || !Number.isFinite(Number(match[3])) || Number(match[2]) - Number(match[1]) + 1 > MAX_MEDIA_CHUNK_BYTES + 1024) return false;
  const lengthHint=Number(response.headers.get('Content-Length'));
  if(Number.isFinite(lengthHint)&&lengthHint>MAX_MEDIA_CHUNK_BYTES+1024)return false;
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_MEDIA_CHUNK_BYTES + 1024 || bytes.byteLength !== Number(match[2]) - Number(match[1]) + 1) return false;
  const headers = new Headers({
    'Content-Type':response.headers.get('Content-Type') || 'audio/mpeg',
    'X-Mujic-Chunk-Start':match[1], 'X-Mujic-Chunk-End':match[2],
    'X-Mujic-Total-Length':match[3], 'X-Mujic-Cached-At':String(Date.now()),
    'Accept-Ranges':'bytes'
  });
  await cache.put(key, new Response(bytes, { status:200, headers }));
  const keys = await cache.keys();
  const records = [];
  for (const record of keys) {
    const res = await cache.match(record);
    records.push({record, at:Number(res?.headers.get('X-Mujic-Cached-At'))||0});
  }
  records.sort((a,b)=>b.at-a.at);
  await Promise.all(records.slice(6).map(item=>cache.delete(item.record)));
  return true;
};
const serveCachedMediaRange = async (cache, key, requestRange) => {
  if (!requestRange) return null;
  const match = String(requestRange).match(/^bytes=(\d+)-(\d*)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const entry = await cache.match(key);
  if (!entry) return null;
  if (Date.now() - Number(entry.headers.get('X-Mujic-Cached-At')||0) > 30*60*1000) { await cache.delete(key); return null; }
  const endChunk = Number(entry.headers.get('X-Mujic-Chunk-End'));
  const total = Number(entry.headers.get('X-Mujic-Total-Length'));
  if (!Number.isFinite(endChunk) || !Number.isFinite(total) || start > endChunk || start >= total) return null;
  const requestedEnd = match[2] ? Number(match[2]) : endChunk;
  const end = Math.min(Number.isFinite(requestedEnd) ? requestedEnd : endChunk, endChunk, total-1);
  if (end < start) return null;
  const bytes = await entry.arrayBuffer();
  const body = bytes.slice(start, end+1);
  return new Response(body, { status:206, headers:{
    'Content-Type':entry.headers.get('Content-Type')||'audio/mpeg',
    'Content-Length':String(body.byteLength), 'Content-Range':`bytes ${start}-${end}/${total}`,
    'Accept-Ranges':'bytes', 'Cache-Control':'no-store'
  }});
};
let imagePuts = 0;
const pruneImages = async imageCache => {
  const keys = await imageCache.keys();
  if (keys.length < 30) return;
  const records = [];
  let totalBytes = 0;
  for (const record of keys) {
    const item = await imageCache.match(record);
    const bytes = Number(item?.headers.get('X-Mujic-Size-Bytes')) || 0;
    totalBytes += bytes;
    records.push({record, bytes, at:Number(item?.headers.get('X-Mujic-Cached-At')) || 0});
  }
  records.sort((a, b) => b.at - a.at);
  const remove = new Set(records.slice(MAX_MEDIA_IMAGE_ENTRIES).map(item => item.record.url));
  for (const item of [...records].reverse()) {
    if (totalBytes <= MAX_MEDIA_IMAGE_BYTES) break;
    if (!remove.has(item.record.url)) { remove.add(item.record.url); totalBytes -= item.bytes; }
  }
  await Promise.all(records.filter(item => remove.has(item.record.url)).map(item => imageCache.delete(item.record)));
};
let cachingFlag = null;
const cachingEnabled = async () => {
  if (cachingFlag !== null) return cachingFlag;
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const stored = await cache.match('caching');
    cachingFlag = stored ? (await stored.text()) !== '0' : true;
  } catch (_) { cachingFlag = true; }
  return cachingFlag;
};
const trimEntries = async (cache, max) => {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map(key => cache.delete(key)));
};
const storeApi = async (cache, url, response) => {
  if (!response || response.status !== 200 || !/json/i.test(response.headers.get('Content-Type') || '')) return;
  const body = await response.clone().arrayBuffer();
  if (!body.byteLength || body.byteLength > 1536 * 1024) return;
  const headers = new Headers(response.headers);
  headers.set('X-Mujic-Cached-At', String(Date.now()));
  const cacheUrl = new URL(url);
  await cache.put(cacheUrl.href, new Response(body, {status:200, headers}));
  await trimEntries(cache, MAX_API_ENTRIES);
};
const isCacheableApiPath = pathname => pathname.startsWith('/api/') || /^\/(?:trending|queue\/|search$|suggest$|lyrics(?:\/|$)|lyricsplus\/)/.test(pathname);
const handleApi = async (request, event) => {
  if (!(await cachingEnabled())) return fetch(request);
  const cache = await caches.open(API_CACHE);
  const cacheKey = new URL(request.url);
  const cached = await cache.match(cacheKey.href);
  const age = cached ? Date.now() - Number(cached.headers.get('X-Mujic-Cached-At') || 0) : Infinity;
  const pathname = new URL(request.url).pathname;
  const isSearch = /^\/(?:api\/)?search(?:\/|$)/.test(pathname);
  const isSong = /^\/(?:api\/songs|song|stream)(?:\/|$)/.test(pathname);
  const fresh = isSearch ? API_SEARCH_FRESH_MS : (isSong ? API_SONG_FRESH_MS : API_FRESH_MS);
  const staleLimit = isSearch ? API_SEARCH_STALE_MS : API_STALE_MS;
  if (cached && age < fresh) return cached;
  const refresh = async () => {
    const response = await fetch(request.url, {credentials:'omit', mode:'cors'});
    await storeApi(cache, request.url, response);
    return response;
  };
  if (cached && age < staleLimit && !isSong) {
    event.waitUntil(refresh().catch(() => {}));
    return cached;
  }
  try {
    const response = await fetch(request);
    await storeApi(cache, request.url, response).catch(() => {});
    return response;
  } catch (error) {
    if (cached && age < staleLimit) return cached;
    throw error;
  }
};
const handleArt = async request => {
  if (!(await cachingEnabled())) return fetch(request);
  const cache = await caches.open(ART_CACHE);
  const key = new Request(request.url, {method:'GET'});
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const response = await fetch(request.url, {mode:'cors', credentials:'omit'});
    const contentType = (response.headers.get('Content-Type') || '').toLowerCase();
    if (response.ok && response.status === 200 && contentType.startsWith('image/')) {
      cache.put(key, response.clone()).then(() => trimEntries(cache, MAX_ART_ENTRIES)).catch(() => {});
    }
    return response;
  } catch (error) {
    try {
      const opaque = await fetch(request.url, {mode:'no-cors', credentials:'omit'});
      if (opaque.type === 'opaque') cache.put(key, opaque.clone()).then(() => trimEntries(cache, MAX_ART_ENTRIES)).catch(() => {});
      return opaque;
    } catch (_) {
      const fallback = await cache.match(key);
      if (fallback) return fallback;
      throw error;
    }
  }
};
const handleSecureMediaRoute = async request => {
  const url = new URL(request.url);
  const token = mediaTokenFromRoute(url);
  if (!token) return new Response('Invalid secure media token', {status:404,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
  const prefetch = url.searchParams.get('_mujic_prefetch') === '1';
  const chunkCache = await caches.open(MEDIA_CHUNK_CACHE);
  const key = mediaRouteKey(url.pathname, token);
  if (prefetch) {
    const response = await fetchBackendSecureMedia(token, request, `bytes=0-${MAX_MEDIA_CHUNK_BYTES-1}`);
    if (response.status === 206) {
      const clone = response.clone();
      try { await storeMediaChunk(chunkCache, key, clone); } catch (_) {}
    }
    return response;
  }
  const range = request.headers.get('Range');
  const cachedRange = await serveCachedMediaRange(chunkCache, key, range);
  if (cachedRange) return cachedRange;
  const imageRequest = /(?:^|,|\s)image\//i.test(request.headers.get('Accept')||'');
  const imageCache = await caches.open(MEDIA_IMAGE_CACHE);
  if (imageRequest && !range) {
    const cached = await imageCache.match(key);
    if (cached && Date.now()-Number(cached.headers.get('X-Mujic-Cached-At')||0)<7*24*60*60*1000) return cached;
  }
  const response = await fetchBackendSecureMedia(token, request);
  if (imageRequest && !range && response.ok && response.status===200 && (response.headers.get('Content-Type')||'').toLowerCase().startsWith('image/')) {
    try {
      const headers = new Headers(response.headers);
      headers.set('X-Mujic-Cached-At',String(Date.now()));
      const body = await response.clone().arrayBuffer();
      headers.set('X-Mujic-Size-Bytes',String(body.byteLength));
      if (body.byteLength <= 1536*1024) {
        await imageCache.put(key,new Response(body,{status:200,headers}));
        imagePuts += 1;
        if (imagePuts % 20 === 0) await pruneImages(imageCache);
      }
    } catch (_) {}
  }
  return response;
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && url.pathname.endsWith('/__mujic_secure_media__')) {
    event.respondWith(handleSecureMediaRoute(req).catch(() => new Response('Secure media proxy unavailable', {status:502,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }
  if (url.origin === API_ORIGIN && isCacheableApiPath(url.pathname) && !req.headers.has('Range')) {
    event.respondWith(handleApi(req, event).catch(() => Response.error()));
    return;
  }
  const cacheableImage = req.destination === 'image' && url.protocol === 'https:' && !same;
  if (cacheableImage) {
    event.respondWith(handleArt(req).catch(() => Response.error()));
    return;
  }
  const isFontCss = !same && url.hostname === 'fonts.googleapis.com';
  const isFontFile = !same && url.hostname === 'fonts.gstatic.com';
  if (!same && !isFontCss && !isFontFile) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (req.mode === 'navigate') {
      /* Network first, but never hang: a stalled connection falls back to the cached shell after a short wait. */
      const shell = cached || await cache.match('./index.html');
      const controller = new AbortController();
      const timer = shell ? setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS) : null;
      try {
        const res = await fetch(req, shell ? { signal: controller.signal } : undefined);
        if (res && res.ok) cache.put('./index.html', res.clone()).catch(()=>{});
        return res;
      } catch (e) { return shell || Response.error(); }
      finally { if (timer) clearTimeout(timer); }
    }
    if ((same || isFontCss || isFontFile) && cached) return cached;
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

self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_ONLINE_MEDIA_CACHE') {
    event.waitUntil(Promise.all([caches.delete(MEDIA_CHUNK_CACHE), caches.delete(MEDIA_IMAGE_CACHE), caches.delete(API_CACHE), caches.delete(ART_CACHE)]));
  }
  if (event.data?.type === 'SET_CACHING') {
    cachingFlag = Boolean(event.data.enabled);
    event.waitUntil(caches.open(CONFIG_CACHE).then(cache => cache.put('caching', new Response(cachingFlag ? '1' : '0'))));
  }
});
