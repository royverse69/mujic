/*
 * Mujic API — Cloudflare Worker.
 * The PWA sends EVERY network request here (catalogue, recommendations, lyrics, media).
 * Responses are cached at the edge with the Cache API, concurrent identical requests are
 * coalesced, and stale entries are served instantly while refreshing in the background, so
 * the upstream catalogue is hit as rarely as possible.
 */
const CATALOGUE = 'https://saavn.sumit.co/api';
const ALLOWED_CATALOGUE = new Set(['search', 'songs', 'albums', 'artists', 'playlists']);
const MEDIA_HOSTS = ['saavncdn.com', 'jiosaavn.com'];
const LYRICSPLUS = [
  'https://lyricsplus.prjktla.my.id',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyricsplus-seven.vercel.app'
];
const TRENDING_QUERIES = ['trending songs', 'latest Hindi songs', 'English pop hits'];

// [fresh seconds, stale-while-revalidate seconds]
const TTL = {
  search: [600, 3600],
  entitySearch: [1800, 7200],
  details: [1800, 21600],
  song: [900, 7200],
  suggestions: [1800, 7200],
  trending: [3600, 14400],
  lyrics: [86400, 604800],
  lyricsMiss: [1800, 3600]
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, If-Range, If-None-Match, If-Modified-Since, Accept, Content-Type',
  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag, Last-Modified, X-Mujic-Cache',
  'Access-Control-Max-Age': '86400'
};

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extra }
});
const fail = (status, message) => json({ success: false, error: message }, status, { 'Cache-Control': 'no-store' });

const sortedQuery = params => {
  const entries = [...params.entries()].sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  return new URLSearchParams(entries).toString();
};

const ttlFor = path => {
  const route = path.toLowerCase().replace(/^\/+|\/+$/g, '');
  if (route === 'search' || route.startsWith('search/songs')) return TTL.search;
  if (route.startsWith('search/')) return TTL.entitySearch;
  if (route.includes('suggestions')) return TTL.suggestions;
  if (route.startsWith('songs')) return TTL.song;
  return TTL.details;
};

const inflight = new Map();

/** Fetch JSON through the edge cache. Returns {payload,status,cache}. */
async function cachedJson(ctx, cacheUrl, ttl, fetcher, { cacheable = payload => payload != null } = {}) {
  const cache = caches.default;
  const key = new Request(cacheUrl);
  const hit = await cache.match(key);
  if (hit) {
    const age = Date.now() - Number(hit.headers.get('X-Mujic-Stored') || 0);
    const payload = await hit.json();
    if (age > ttl[0] * 1000) {
      ctx.waitUntil(refresh(cache, key, ttl, fetcher, cacheable).catch(() => {}));
      return { payload, status: 200, cache: 'STALE' };
    }
    return { payload, status: 200, cache: 'HIT' };
  }
  const result = await refresh(cache, key, ttl, fetcher, cacheable);
  return { ...result, cache: 'MISS' };
}

function refresh(cache, key, ttl, fetcher, cacheable) {
  const id = key.url;
  if (inflight.has(id)) return inflight.get(id);
  const work = (async () => {
    const { payload, status } = await fetcher();
    if (status === 200 && cacheable(payload)) {
      await cache.put(key, new Response(JSON.stringify(payload), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttl[0] + ttl[1]}`,
          'X-Mujic-Stored': String(Date.now())
        }
      }));
    }
    return { payload, status };
  })().finally(() => inflight.delete(id));
  inflight.set(id, work);
  return work;
}

async function upstreamJson(url, { timeout = 9000, headers = {} } = {}, attempts = 2) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeout),
        cf: { cacheEverything: false }
      });
      let payload = null;
      try { payload = await res.json(); } catch (_) { payload = null; }
      if (res.status >= 500 && i < attempts - 1) { last = new Error(`HTTP ${res.status}`); continue; }
      return { payload, status: res.status };
    } catch (error) { last = error; }
  }
  throw last || new Error('Upstream unavailable');
}

const send = (result, ttl, extra = {}) => json(result.payload ?? { success: false, error: 'Empty upstream response' }, result.status, {
  'Cache-Control': result.status === 200 ? `public, max-age=${Math.min(ttl[0], 300)}, s-maxage=${ttl[0]}, stale-while-revalidate=${ttl[1]}` : 'no-store',
  'X-Mujic-Cache': result.cache || 'MISS',
  ...extra
});

/* ---------- catalogue: /api/* ---------- */
async function catalogue(url, ctx) {
  const path = url.pathname.replace(/^\/api\/?/, '');
  const first = path.split('/')[0].toLowerCase();
  if (!ALLOWED_CATALOGUE.has(first)) return fail(404, 'Catalogue route not allowed');
  const query = sortedQuery(url.searchParams);
  const ttl = ttlFor(path);
  const cacheUrl = `https://cache.mujic.internal/api/${path}?${query}`;
  const target = `${CATALOGUE}/${path}${query ? `?${query}` : ''}`;
  try {
    const result = await cachedJson(ctx, cacheUrl, ttl, () => upstreamJson(target), {
      cacheable: payload => payload && payload.success !== false
    });
    return send(result, ttl);
  } catch (_) { return fail(502, 'Upstream catalogue temporarily unavailable'); }
}

/* ---------- recommendations (legacy routes the PWA still uses) ---------- */
async function searchSongs(ctx, q) {
  const query = String(q || '').trim();
  if (!query) return [];
  const cacheUrl = `https://cache.mujic.internal/api/search?query=${encodeURIComponent(query)}`;
  try {
    const { payload } = await cachedJson(ctx, cacheUrl, TTL.search,
      () => upstreamJson(`${CATALOGUE}/search?query=${encodeURIComponent(query)}`, { timeout: 8000 }),
      { cacheable: p => p && p.success !== false });
    return payload?.data?.songs?.results || [];
  } catch (_) { return []; }
}

async function songRaw(ctx, id) {
  const cacheUrl = `https://cache.mujic.internal/api/songs/${encodeURIComponent(id)}?`;
  try {
    const { payload } = await cachedJson(ctx, cacheUrl, TTL.song,
      () => upstreamJson(`${CATALOGUE}/songs/${encodeURIComponent(id)}`, { timeout: 8000 }),
      { cacheable: p => p && p.success !== false && Array.isArray(p.data) && p.data.length });
    return payload;
  } catch (_) { return null; }
}

const artistNames = song => {
  const primary = song?.artists?.primary;
  if (Array.isArray(primary) && primary.length) return primary.map(a => a.name).filter(Boolean).join(', ');
  return String(song?.primaryArtists || '');
};

async function recommendations(ctx, id) {
  const cacheUrl = `https://cache.mujic.internal/queue/${encodeURIComponent(id)}`;
  const { payload } = await cachedJson(ctx, cacheUrl, TTL.suggestions, async () => {
    const data = await songRaw(ctx, id);
    const current = data?.data?.[0];
    if (!current) return { payload: { current: null, queue: [] }, status: 200 };
    const name = String(current.name || current.title || '');
    const album = typeof current.album === 'object' ? String(current.album?.name || '') : String(current.album || '');
    const language = String(current.language || '').toLowerCase();
    // Prefer the catalogue's purpose-built suggestions endpoint. Only make one contextual
    // fallback search if it returned too few tracks; never fan out into repeated artist searches.
    const suggestionResult = await upstreamJson(`${CATALOGUE}/songs/${encodeURIComponent(id)}/suggestions?limit=20`, { timeout: 6000 }, 1)
      .catch(() => ({ payload: { data: [] }, status: 502 }));
    const baseRows = Array.isArray(suggestionResult.payload?.data)
      ? suggestionResult.payload.data
      : (suggestionResult.payload?.data?.results || []);
    let merged = baseRows.slice();
    if (merged.length < 8) {
      const fallbackQuery = album || name || `${language || 'popular'} songs`;
      if (fallbackQuery) {
        const fallbackRows = await searchSongs(ctx, fallbackQuery);
        merged = merged.concat(fallbackRows.slice(0, 12));
      }
    }
    const seen = new Set([String(id)]);
    const titles = new Set();
    const queue = [];
    for (const song of merged) {
      const sid = song?.id;
      const title = String(song?.name || song?.title || '').toLowerCase().trim();
      if (!sid || seen.has(sid)) continue;
      if (titles.has(title) && name.toLowerCase().trim().includes(title)) continue;
      seen.add(sid); titles.add(title); queue.push(song);
    }
    return { payload: { current, queue: queue.slice(0, 30) }, status: 200 };
  }, { cacheable: p => p && Array.isArray(p.queue) });
  return payload;
}

async function trending(ctx) {
  const cacheUrl = 'https://cache.mujic.internal/trending';
  const { payload, cache } = await cachedJson(ctx, cacheUrl, TTL.trending, async () => {
    const lists = await Promise.all(TRENDING_QUERIES.map(query => searchSongs(ctx, query)));
    const seen = new Set();
    const songs = [];
    for (const song of lists.flat()) {
      const key = String(song?.id || `${song?.name || song?.title || ''}|${artistNames(song)}`).toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key); songs.push(song);
      if (songs.length >= 30) break;
    }
    return { payload: { songs }, status: 200 };
  }, { cacheable: p => p && p.songs?.length });
  return { payload, cache };
}

/* ---------- lyrics ---------- */
const lyricsResponse = (result, hitTtl = TTL.lyrics) => {
  const ok = result.status === 200 && result.payload && result.payload.success !== false;
  return send({ ...result, status: ok ? 200 : result.status }, ok ? hitTtl : TTL.lyricsMiss);
};

async function proxyLyrics(ctx, upstreamUrl, cacheKey) {
  try {
    const result = await cachedJson(ctx, `https://cache.mujic.internal/${cacheKey}`, TTL.lyrics,
      () => upstreamJson(upstreamUrl, { timeout: 7000, headers: { 'X-User-Agent': 'Mujic/13.2.0 (https://royverse69.github.io/mujic/)' } }, 1),
      { cacheable: p => p && !p.error });
    return lyricsResponse(result);
  } catch (_) { return fail(502, 'Lyrics provider temporarily unavailable'); }
}

async function lyricsPlus(url, ctx) {
  const query = sortedQuery(url.searchParams);
  const cacheUrl = `https://cache.mujic.internal/lyricsplus?${query}`;
  try {
    const result = await cachedJson(ctx, cacheUrl, TTL.lyrics, async () => {
      // Race all mirrors: the first healthy answer wins, the slower ones are abandoned.
      const attempts = LYRICSPLUS.map(origin => upstreamJson(`${origin}/v2/lyrics/get?${query}`, { timeout: 5000 }, 1)
        .then(r => { if (r.status === 404 || r.status === 405 || r.status === 410 || r.status >= 500) throw new Error('miss'); return r; }));
      return Promise.any(attempts);
    }, { cacheable: p => p && !p.error });
    return lyricsResponse(result);
  } catch (_) { return fail(502, 'Lyrics providers temporarily unavailable'); }
}

/* ---------- media: /media?url= ---------- */
const allowedMedia = value => {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443')
      && MEDIA_HOSTS.some(d => host === d || host.endsWith(`.${d}`));
  } catch (_) { return false; }
};

async function media(request, url) {
  const target = (url.searchParams.get('url') || '').trim();
  if (!allowedMedia(target)) return fail(403, 'Unsupported catalogue media host');
  const headers = new Headers({ 'Accept-Encoding': 'identity' });
  for (const name of ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since', 'Accept']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const isImage = /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(target) || /(?:^|,|\s)image\//i.test(request.headers.get('Accept') || '');
  let current = target;
  let upstream = null;
  for (let hop = 0; hop < 5; hop++) {
    if (!allowedMedia(current)) return fail(403, 'Redirected media host is not allowed');
    try {
      // Cloudflare caches the object (including byte-range slices) at the edge.
      upstream = await fetch(current, {
        method: 'GET', headers, redirect: 'manual',
        cf: { cacheEverything: true, cacheTtl: isImage ? 604800 : 86400, cacheTtlByStatus: { '200-299': isImage ? 604800 : 86400, '404': 60, '500-599': 0 } }
      });
    } catch (_) { return fail(502, 'Catalogue media is temporarily unavailable'); }
    if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
    const location = upstream.headers.get('Location');
    if (!location) return fail(502, 'Media redirect did not provide a destination');
    current = new URL(location, current).href;
    upstream = null;
  }
  if (!upstream) return fail(502, 'Too many media redirects');
  const out = new Headers();
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
    if (upstream.headers.has(name)) out.set(name, upstream.headers.get(name));
  }
  if (!out.has('Accept-Ranges')) out.set('Accept-Ranges', 'bytes');
  out.set('Cache-Control', upstream.ok ? `public, max-age=${isImage ? 604800 : 3600}, immutable` : 'no-store');
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/* ---------- router ---------- */
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Method not allowed');
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (path === '/') return json({ status: 'online', name: 'Mujic API (Cloudflare Worker)' }, 200, { 'Cache-Control': 'public, max-age=60' });
      if (path === '/health') return json({ status: 'ok', timestamp: Math.floor(Date.now() / 1000) }, 200, { 'Cache-Control': 'no-store' });
      if (path === '/media') return media(request, url);
      if (path === '/api' || path.startsWith('/api/')) return catalogue(url, ctx);

      if (path === '/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return fail(400, 'query required');
        return catalogue(new URL(`${url.origin}/api/search?query=${encodeURIComponent(q)}`), ctx);
      }
      if (path === '/trending') { const r = await trending(ctx); return send({ payload: r.payload, status: 200, cache: r.cache }, TTL.trending); }
      if (path.startsWith('/queue/')) {
        const payload = await recommendations(ctx, decodeURIComponent(path.slice(7)));
        return send({ payload, status: 200 }, TTL.suggestions);
      }
      if (path.startsWith('/song/')) {
        const data = await songRaw(ctx, decodeURIComponent(path.slice(6)));
        return data ? send({ payload: data, status: 200 }, TTL.song) : fail(404, 'Song not found');
      }
      if (path.startsWith('/stream/')) {
        const id = decodeURIComponent(path.slice(8));
        const song = (await songRaw(ctx, id))?.data?.[0];
        const links = song?.downloadUrl || [];
        const order = ['320kbps', '160kbps', '96kbps', '48kbps', '12kbps'];
        const best = order.map(q => links.find(x => x.quality === q)).find(Boolean) || links[0];
        const stream = best?.url || best?.link;
        return stream ? send({ payload: { id, title: song.name || song.title || 'Unknown', stream }, status: 200 }, TTL.song) : fail(404, 'Stream unavailable');
      }
      if (path === '/suggest') {
        const songs = await searchSongs(ctx, url.searchParams.get('q'));
        return send({ payload: songs.slice(0, 10).map(s => ({ id: s.id, title: s.name || s.title, artist: artistNames(s) })), status: 200 }, TTL.search);
      }
      if (path === '/lyrics/search') {
        const q = (url.searchParams.get('q') || url.searchParams.get('track_name') || '').trim();
        if (!q) return fail(400, 'query required');
        return proxyLyrics(ctx, `https://lrclib.net/api/search?${sortedQuery(url.searchParams)}`, `lyrics/search?${sortedQuery(url.searchParams)}`);
      }
      if (path === '/lyrics/get') {
        if (!(url.searchParams.get('track_name') || '').trim()) return fail(400, 'track_name required');
        return proxyLyrics(ctx, `https://lrclib.net/api/get?${sortedQuery(url.searchParams)}`, `lyrics/get?${sortedQuery(url.searchParams)}`);
      }
      if (path === '/lyrics') {
        const track = (url.searchParams.get('track') || '').trim();
        if (!track) return json({ success: false });
        const params = new URLSearchParams({ track_name: track, artist_name: url.searchParams.get('artist') || '' });
        return proxyLyrics(ctx, `https://lrclib.net/api/get?${sortedQuery(params)}`, `lyrics/get?${sortedQuery(params)}`);
      }
      if (path === '/lyrics/ovh') {
        const title = (url.searchParams.get('track_name') || '').trim();
        const artist = (url.searchParams.get('artist_name') || '').trim();
        if (!title || !artist) return fail(400, 'track_name and artist_name required');
        const key = `lyrics/ovh?${sortedQuery(url.searchParams)}`;
        try {
          const result = await cachedJson(ctx, `https://cache.mujic.internal/${key}`, TTL.lyrics, async () => {
            const r = await upstreamJson(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 7000 }, 1);
            const text = typeof r.payload?.lyrics === 'string' ? r.payload.lyrics.trim() : '';
            return text ? { payload: { success: true, lyrics: text, source: 'Lyrics.ovh' }, status: 200 }
              : { payload: { success: false, error: 'Lyrics not found', source: 'Lyrics.ovh' }, status: 404 };
          });
          return lyricsResponse(result);
        } catch (_) { return fail(502, 'Lyrics provider temporarily unavailable'); }
      }
      if (path === '/lyricsplus/v2/lyrics/get') return lyricsPlus(url, ctx);
      return fail(404, 'Not found');
    } catch (_) { return fail(500, 'Internal error'); }
  }
};
