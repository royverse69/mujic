/* Copyright mujic@royverse69 */
const OnlineMusic = (() => {
    const LEGACY_BASE = `${window.MujicBackend.PRIMARY}/`;
    const API_BASE = 'https://saavn.sumit.co/api';
    const LEGACY_API_BASE = `${LEGACY_BASE.replace(/\/$/, '')}/api`;
    const refreshingSearchCache = new Set();
    const ONLINE_PREFIX = 'machhar:';
    const streamCache = new Map();
    const onlineTracks = new Map();
    const searchCache = new Map();
    const entitySearchCache = new Map();
    const entityDetailsCache = new Map();
    const relatedCache = new Map();
    let relatedRateLimitedUntil = 0;
    const audioPreloaders = new Map();
    let latestSearchRequest = 0;
    let activeController = null;
    let activeStreamController = null;
    let modeAnimationTimer = null;
    let searchMeta = { query: '', page: 0, limit: 40, total: 0, hasMore: false, provider: 'saavn' };

    const isOnlineId = id => typeof id === 'string' && id.startsWith(ONLINE_PREFIX);
    const isOnlineTrack = track => track?.source === 'machhar-online' || isOnlineId(track?.id);
    const getTrack = id => onlineTracks.get(String(id)) || null;
    const decodeText = value => {
        if (value === null || value === undefined) return '';
        const input = String(value);
        if (!input.includes('&')) return input.trim();
        const node = document.createElement('textarea'); node.innerHTML = input; return node.value.trim();
    };
    const safeHttpUrl = value => {
        try {
            const raw = typeof value === 'string' ? value.trim() : '';
            const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
            const u = new URL(normalized);
            return ['https:', 'http:'].includes(u.protocol) ? u.href : '';
        } catch (_) { return ''; }
    };
    const BACKEND_ORIGIN = window.MujicBackend.PRIMARY;
    const BACKEND_ORIGINS = window.MujicBackend.origins();
    const isCatalogueMediaHost = hostname => {
        const host = String(hostname || '').toLowerCase();
        return host === 'saavncdn.com' || host.endsWith('.saavncdn.com') ||
            host === 'jiosaavn.com' || host.endsWith('.jiosaavn.com');
    };
    const proxyMediaUrl = value => {
        const normalized = safeHttpUrl(value);
        if (!normalized) return '';
        try {
            const url = new URL(normalized);
            if (BACKEND_ORIGINS.includes(url.origin) && url.pathname === '/media') return normalized;
            if (!isCatalogueMediaHost(url.hostname)) return normalized;
            if (typeof location !== 'undefined' && location.protocol !== 'file:' && !BACKEND_ORIGINS.includes(location.origin) && navigator.serviceWorker?.controller) {
                const local = new URL('__mujic_media__', location.href);
                local.searchParams.set('src', normalized);
                return local.href;
            }
            return `${BACKEND_ORIGIN}/media?url=${encodeURIComponent(normalized)}`;
        } catch (_) { return ''; }
    };
    const qualityNumber = value => {
        const q = String(value || '').toLowerCase();
        const m = q.match(/(\d+(?:\.\d+)?)\s*(kbps|kb\/s|k|bps)?/);
        if (!m) return 0;
        const n = Number(m[1]); return m[2] === 'bps' || (!m[2] && n >= 10000) ? n / 1000 : n;
    };
    const pickImage = value => {
        const images = Array.isArray(value) ? value : (value ? [value] : []);
        const candidates = images.map(item => ({
            source: typeof item === 'string' ? item : (item?.url || item?.link || item?.src || item?.imageUrl || item?.image_url || item?.thumbnail),
            quality: qualityNumber(item?.quality || item?.size || item?.width || item?.height)
        })).filter(item => typeof item.source === 'string' && item.source.trim());
        candidates.sort((a,b) => b.quality-a.quality);
        return candidates.length ? proxyMediaUrl(candidates[0].source) : '';
    };
    const getImage = raw => {
        if (!raw || typeof raw !== 'object') return '';
        const candidates = [];
        for (const value of [raw.image, raw.images, raw.artwork, raw.imageUrl, raw.image_url, raw.thumbnail,
            raw.more_info?.image, raw.more_info?.image_url, raw.more_info?.imageUrl, raw.more_info?.thumbnail]) {
            if (Array.isArray(value)) candidates.push(...value);
            else if (value) candidates.push(value);
        }
        return pickImage(candidates);
    };
    const imageLooksGeneric = value => /(?:placeholder|no[-_]?image|default[-_]?artist|artist[-_]?default|unknown[-_]?artist|blank[-_]?avatar)/i.test(String(value || ''));
    const artistNameKey = value => decodeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    const resolveArtistArtwork = (raw, artistId = '', artistName = '') => {
        if (!raw || typeof raw !== 'object') return '';
        const targetId = String(artistId || raw.id || raw.artistId || '').trim();
        const targetName = artistNameKey(artistName || raw.name || raw.title || '');
        const rawId = String(raw.id || raw.artistId || '').trim();
        const rawName = artistNameKey(raw.name || raw.title || '');
        const direct = getImage(raw);
        const directBelongsToTarget = (!targetId && !targetName) || (targetId && rawId === targetId) || (targetName && rawName === targetName);
        if (directBelongsToTarget && direct && !imageLooksGeneric(direct)) return direct;
        const candidates = [];
        const add = value => { if (Array.isArray(value)) candidates.push(...value.filter(item => item && typeof item === 'object')); };
        const addSongArtists = song => {
            if (!song || typeof song !== 'object') return;
            add(song.artists?.primary); add(song.artists?.all); add(song.artists?.featured);
            add(song.artistMap?.primary_artists); add(song.more_info?.artistMap?.primary_artists);
        };
        add(raw.artists?.primary); add(raw.artists?.all); add(raw.artists?.featured);
        add(raw.artistMap?.primary_artists); add(raw.more_info?.artistMap?.primary_artists);
        for (const song of [...(Array.isArray(raw.topSongs) ? raw.topSongs : []), ...(Array.isArray(raw.songs) ? raw.songs : []), ...(Array.isArray(raw.results) ? raw.results : [])]) addSongArtists(song);
        const seen = new Set();
        for (const candidate of candidates) {
            const id = String(candidate.id || candidate.artistId || '').trim();
            const name = artistNameKey(candidate.name || candidate.title || '');
            const matched = (targetId && id && targetId === id) || (targetName && name && targetName === name);
            if (!matched) continue;
            const image = getImage(candidate);
            if (image && !imageLooksGeneric(image) && !seen.has(image)) return image;
            if (image) seen.add(image);
        }
        return directBelongsToTarget && direct && !imageLooksGeneric(direct) ? direct : '';
    };
    const getEntityImage = (kind, raw) => {
        if (kind !== 'artists') return getImage(raw);
        const fallback = getImage(raw);
        return resolveArtistArtwork(raw, raw?.id || raw?.artistId || '', raw?.name || raw?.title || '') || (imageLooksGeneric(fallback) ? '' : fallback);
    };
    const getArtist = raw => {
        const artistLists = [raw?.artists?.primary,raw?.artists?.featured,raw?.artists?.all,raw?.artistMap?.primary_artists,raw?.more_info?.artistMap?.primary_artists].find(list=>Array.isArray(list)&&list.length);
        if (Array.isArray(artistLists) && artistLists.length) return artistLists.map(a => decodeText(a?.name || a)).filter(Boolean).join(', ');
        const value = raw?.subtitle || raw?.primaryArtists || raw?.singers || raw?.artist || raw?.more_info?.singers;
        if (typeof value === 'string') return decodeText(value) || 'Unknown Artist';
        if (Array.isArray(value)) return value.map(x => decodeText(x?.name || x)).filter(Boolean).join(', ') || 'Unknown Artist';
        if (value && typeof value === 'object') {
            if (Array.isArray(value.primary)) return value.primary.map(x => decodeText(x?.name || x)).filter(Boolean).join(', ') || 'Unknown Artist';
            return decodeText(value.name) || 'Unknown Artist';
        }
        return 'Unknown Artist';
    };
    const extractRawSongs = payload => {
        const data = payload?.data;
        const groups = [
            data?.results,
            data?.songs?.results,
            data?.topQuery?.results,
            data?.data?.results,
            data?.data?.songs?.results,
            payload?.songs?.results,
            payload?.results,
            Array.isArray(data) ? data : null,
            Array.isArray(payload) ? payload : null
        ];
        const seen = new Set(), out = [];
        for (const group of groups) {
            if (!Array.isArray(group)) continue;
            for (const raw of group) {
                if (!raw || typeof raw !== 'object') continue;
                const type = String(raw.type || raw.resultType || '').toLowerCase();
                if (['artist','artists','album','albums','playlist','playlists','podcast','podcasts','episode','episodes','channel','channels','label','labels'].includes(type)) continue;
                const id = raw.id || raw.songId || raw.song_id || raw.more_info?.song_id;
                if (id === undefined || id === null || !String(id).trim()) continue;
                const key = String(id); if (seen.has(key)) continue;
                const songShape = Array.isArray(raw.downloadUrl) || Array.isArray(raw.download_url) || raw.duration !== undefined || raw.album !== undefined && (raw.artists !== undefined || raw.primaryArtists !== undefined || raw.singers !== undefined) || raw.primaryArtists !== undefined || raw.singers !== undefined || raw.more_info?.song_id !== undefined;
                if (!songShape) continue;
                seen.add(key); out.push(raw);
            }
        }
        return out;
    };
    const normalizeTrack = raw => {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.source === 'machhar-online' && raw.onlineTrackId && raw.id) { onlineTracks.set(String(raw.id), raw); return raw; }
        const rawId = raw.onlineTrackId || raw.id || raw.songId || raw.song_id || raw.more_info?.song_id;
        if (rawId === undefined || rawId === null || String(rawId).trim() === '') return null;
        const provider = raw.provider || (String(raw.id || '').startsWith('machhar:machhar:') ? 'machhar' : 'saavn');
        const providerId = String(rawId).replace(/^machhar:(?:saavn|machhar):/, '');
        const id = isOnlineId(raw.id) ? String(raw.id) : `${ONLINE_PREFIX}${provider}:${providerId}`;
        const albumRaw = raw.album?.name || raw.album || raw.more_info?.album || 'Unknown Album';
        const title = decodeText(raw.title || raw.name || raw.song || 'Unknown track') || 'Unknown track';
        const duration = Number(raw.duration ?? raw.more_info?.duration) || 0;
        const artists = getArtist(raw);
        const track = {
            id, title, artist: artists, album: decodeText(typeof albumRaw === 'object' ? albumRaw.name : albumRaw) || 'Unknown Album',
            duration: duration > 0 ? duration : 0, year: raw.year || raw.more_info?.year || '',
            language: raw.language || '', genre: raw.genre || raw.more_info?.genre || '',
            composer: raw.composer || raw.more_info?.music || raw.more_info?.composer || '',
            copyright: raw.copyright || raw.more_info?.copyright_text || '',
            albumArtist: raw.albumArtist || raw.more_info?.album_artist || '',
            trackNumber: raw.trackNumber || raw.track_number || raw.more_info?.track_number || '',
            isrc: raw.isrc || raw.more_info?.isrc || '', lyrics: raw.lyrics || raw.more_info?.lyrics || raw.more_info?.syncedLyrics || '',
            lyricsId: raw.lyricsId || raw.lyrics_id || null, hasLyrics: Boolean(raw.hasLyrics || raw.has_lyrics),
            raw, fileName: `${title}.m4a`, artworkId: null, artworkUrl: getImage(raw),
            source: 'machhar-online', provider, onlineTrackId: providerId, isOnline: true
        };
        onlineTracks.set(id, track);
        while (onlineTracks.size > 400) {
            const oldest = onlineTracks.keys().next().value;
            if (oldest === State.currentTrackId || State.playbackOrder.includes(oldest)) break;
            onlineTracks.delete(oldest);
        }
        return track;
    };
    const registerTrack = record => {
        if (!record || !record.onlineTrackId) return null;
        const track = { ...record, source: 'machhar-online', isOnline: true, raw: record.raw || {} };
        onlineTracks.set(String(track.id), track); return track;
    };
    const request = async (url, signal, timeoutMs = 10000) => {
        if (!navigator.onLine) throw new Error('No internet connection. Reconnect and try again.');
        const controller = new AbortController();
        const relayAbort = () => controller.abort(signal?.reason);
        if (signal?.aborted) relayAbort();
        else signal?.addEventListener('abort', relayAbort, { once:true });
        const parsedForTimeout = new URL(url, typeof location !== 'undefined' ? location.href : LEGACY_BASE);
        const usesBackend = window.MujicBackend.isBackendOrigin(parsedForTimeout.origin);
        const timer = usesBackend ? null : setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
        try {
            const requestInit = { method:'GET', headers:{ Accept:'application/json' }, cache:'no-store', credentials:'omit', signal:controller.signal };
            const parsedUrl = new URL(url, typeof location !== 'undefined' ? location.href : LEGACY_BASE);
            const response = window.MujicBackend.isBackendOrigin(parsedUrl.origin)
                ? await window.MujicBackend.fetchWithFallback(parsedUrl.pathname + parsedUrl.search, requestInit, { timeoutMs })
                : await fetch(url, requestInit);
            if (!response.ok) throw new Error(`Music service returned HTTP ${response.status}`);
            const body = await response.text();
            try { return JSON.parse(body); } catch (_) { return body; }
        } finally {
            if (timer) clearTimeout(timer);
            signal?.removeEventListener('abort', relayAbort);
        }
    };
    const requestSaavn = async (path, signal, timeout = 10000) => {
        const cleanPath = path.replace(/^\//, '');
        if (signal?.aborted) throw new Error('Catalogue request cancelled.');
        if (!navigator.onLine) throw new Error('No internet connection.');
        const directController = new AbortController();
        const proxyController = new AbortController();
        const relayAbort = () => { directController.abort(signal?.reason); proxyController.abort(signal?.reason); };
        signal?.addEventListener('abort', relayAbort, { once:true });
        const asResult = (source, promise) => promise.then(value => ({source,value}), error => ({source,error}));
        const directPromise = asResult('direct', request(`${API_BASE}/${cleanPath}`, directController.signal, Math.min(Math.max(1000, timeout), 4200)));
        let fallbackTimer = null;
        let proxyPromise = null;
        try {
            const first = await Promise.race([
                directPromise,
                new Promise(resolve => { fallbackTimer = setTimeout(() => resolve({source:'fallback-start'}), 650); })
            ]);
            if (first.source === 'direct' && !first.error) {
                proxyController.abort();
                return first.value;
            }
            if (signal?.aborted || !navigator.onLine) throw first.error || new Error('Catalogue request cancelled.');
            proxyPromise = asResult('proxy', request(`${LEGACY_API_BASE}/${cleanPath}`, proxyController.signal, Math.min(Math.max(1000, timeout), 7000)));
            const winner = first.source === 'direct'
                ? await proxyPromise
                : await Promise.race([directPromise, proxyPromise]);
            if (winner.error) {
                if (winner.source === 'direct' && proxyPromise) {
                    const proxy = await proxyPromise;
                    if (!proxy.error) { directController.abort(); return proxy.value; }
                    throw proxy.error;
                }
                if (winner.source === 'proxy' && first.source === 'fallback-start') {
                    const direct = await directPromise;
                    if (!direct.error) { proxyController.abort(); return direct.value; }
                    throw winner.error;
                }
                throw winner.error;
            }
            if (winner.source === 'direct') proxyController.abort();
            else directController.abort();
            return winner.value;
        } finally {
            if (fallbackTimer !== null) clearTimeout(fallbackTimer);
            signal?.removeEventListener('abort', relayAbort);
        }
    };
    const requestLegacy = (path, signal, timeout = 10000) => request(`${LEGACY_BASE}${path.replace(/^\//,'')}`, signal, timeout);
    const requestLegacyApi = (path, signal, timeout = 9000) => request(`${LEGACY_API_BASE}/${path.replace(/^\//,'')}`, signal, timeout);
    const parseStreamChoices = payload => {
        if (typeof payload === 'string' && /^https?:\/\//i.test(payload)) return [{url:payload, quality:'unknown', codec:'', format:''}];
        if (payload?.stream && typeof payload.stream === 'string') return [{url:payload.stream, quality:payload.quality || 'unknown', codec:payload.codec || '', format:payload.format || ''}];
        const items = Array.isArray(payload?.data) ? payload.data : (payload?.data ? [payload.data] : (Array.isArray(payload) ? payload : [payload]));
        const out = [];
        for (const item of items) {
            const urls = item?.downloadUrl || item?.download_url || item?.url;
            if (typeof urls === 'string') out.push({url:urls, quality:item?.quality || 'unknown', codec:item?.codec || '', format:item?.format || ''});
            else if (Array.isArray(urls)) for (const entry of urls) out.push({
                url: entry?.url || entry?.link || entry?.downloadUrl || '',
                quality: String(entry?.quality || entry?.bitrate || item?.quality || 'unknown'),
                codec: String(entry?.codec || entry?.mimeType || entry?.mime_type || item?.codec || ''),
                format: String(entry?.format || entry?.container || item?.format || ''), raw: entry
            });
        }
        if (!out.length && Array.isArray(payload?.downloadUrl)) return payload.downloadUrl.map(entry => ({url:entry?.url || entry?.link || '', quality:String(entry?.quality || ''), codec:'', format:''}));
        return out.filter(entry => safeHttpUrl(entry.url));
    };
    const fetchSongsByIdsOrLink = async reference => {
        const value=String(reference||'').trim();if(!value)throw new Error('Enter a song ID or share link.');
        const isLink=/^https?:\/\//i.test(value);
        const query=isLink?`link=${encodeURIComponent(value)}`:`ids=${encodeURIComponent(value.replace(/^songs?:/i,''))}`;
        const payload=await requestSaavn(`songs?${query}`,null,18000);const data=unwrapData(payload);
        const rows=Array.isArray(data)?data:(Array.isArray(data?.songs)?data.songs:(Array.isArray(data?.results)?data.results:[]));
        const one=!rows.length&&data&&typeof data==='object'&&(data.id||data.songId||data.downloadUrl)?[data]:rows;
        return one.map(raw=>normalizeTrack({...raw,provider:'saavn'})).filter(Boolean);
    };
    const fetchSongDetails = async track => {
        const id = encodeURIComponent(track.onlineTrackId);
        if (track.provider === 'machhar') return requestLegacy(`stream/${id}`, null, 18000);
        let candidate=null;
        try {
            const payload = await requestSaavn(`songs/${id}`, null, 18000);
            candidate = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
        } catch (_) { }
        if (!candidate) {
            const fallback=await fetchSongsByIdsOrLink(track.onlineTrackId);
            candidate=fallback[0]?.raw || null;
        }
        if (!candidate) throw new Error('Song details were not returned by the catalogue.');
        track.raw = { ...(track.raw || {}), ...candidate };
        track.artworkUrl = track.artworkUrl || getImage(candidate);
        track.lyricsId = track.lyricsId || candidate.lyricsId || null;
        if (window.OnlineCache) OnlineCache.rememberTrack(track);
        return candidate;
    };
    const fetchRelated = async track => {
        if (State.playbackSourceMode !== 'online') throw new Error('Streaming mode is turned off.');
        if (!navigator.onLine) throw new Error('No internet connection.');
        if (!track?.onlineTrackId) return [];
        const cacheKey = `${track.provider || 'saavn'}:${track.onlineTrackId}`;
        const cached = relatedCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.items;
        // The public suggestions route frequently returns HTTP 429. Respect that signal and
        // avoid hammering it on every track transition; recommendations can use search fallback.
        if (track.provider !== 'machhar' && Date.now() < relatedRateLimitedUntil) return [];
        try {
            const payload = track.provider === 'machhar'
                ? await requestLegacy(`queue/${encodeURIComponent(track.onlineTrackId)}`, null, 6500)
                : await requestSaavn(`songs/${encodeURIComponent(track.onlineTrackId)}/suggestions?limit=20`, null, 5200);
            const candidates = [
                payload?.data?.results, payload?.data?.songs?.results, payload?.data?.suggestions,
                payload?.data?.songs, payload?.data?.queue, payload?.queue, payload?.songs,
                payload?.results, Array.isArray(payload?.data) ? payload.data : null,
                Array.isArray(payload) ? payload : null
            ].find(Array.isArray);
            const items = candidates || (() => { const one = Array.isArray(payload?.data) ? payload.data[0] : (payload?.data || payload?.song || payload); return one && typeof one === 'object' && (one.id || one.songId || one.name || one.title) ? [one] : []; })();
            relatedCache.set(cacheKey, {items, expiresAt:Date.now() + (items.length ? 8*60*1000 : 45*1000)});
            while (relatedCache.size > 80) relatedCache.delete(relatedCache.keys().next().value);
            return items;
        } catch (error) {
            if (/429|rate limit/i.test(String(error?.message || error))) relatedRateLimitedUntil = Date.now() + 90*1000;
            relatedCache.set(cacheKey, {items:[], expiresAt:Date.now()+30*1000});
            throw error;
        }
    };
    // Recommendation shelves intentionally use Render directly. Do not route these calls through
    // MujicBackend.fetchWithFallback: that helper prefers the Cloudflare primary by design.
    const RENDER_RECOMMENDATIONS_BASE = String(window.MujicBackend.FALLBACK || 'https://gaana-suno-varna-machhar-aajayega.onrender.com').replace(/\/$/, '');
    const requestRenderRecommendation = async (path, timeoutMs = 10000) => {
        if (!navigator.onLine) throw new Error('No internet connection.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
        try {
            const response = await fetch(`${RENDER_RECOMMENDATIONS_BASE}/${String(path || '').replace(/^\//, '')}`, {
                method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store', signal: controller.signal
            });
            if (!response.ok) throw new Error(`Render recommendations returned HTTP ${response.status}`);
            const body = await response.text();
            let payload;
            try { payload = JSON.parse(body); } catch (_) { throw new Error('Render returned a non-JSON recommendation response.'); }
            if (payload && typeof payload === 'object' && payload.error && !Array.isArray(payload)) throw new Error(String(payload.error));
            return payload;
        } finally { clearTimeout(timer); }
    };
    const extractRenderRecommendationRows = payload => {
        const groups = [
            payload?.queue, payload?.songs, payload?.data?.queue, payload?.data?.songs?.results,
            payload?.data?.songs, payload?.data?.results, payload?.results,
            Array.isArray(payload?.data) ? payload.data : null,
            Array.isArray(payload) ? payload : null
        ];
        const rows = groups.find(Array.isArray);
        if (rows) return rows;
        return extractRawSongs(payload);
    };
    const normalizeRenderRecommendationRows = payload => extractRenderRecommendationRows(payload)
        .map(raw => normalizeTrack({ ...raw, provider: 'machhar' }))
        .filter(Boolean);
    const fetchRenderQuickPicks = async () => {
        const payload = await requestRenderRecommendation('trending', 13000);
        return normalizeRenderRecommendationRows(payload);
    };
    const fetchRenderSuggestions = async track => {
        if (!track?.onlineTrackId) return [];
        const payload = await requestRenderRecommendation(`queue/${encodeURIComponent(track.onlineTrackId)}`, 11000);
        return normalizeRenderRecommendationRows(payload).filter(candidate => candidate.id !== track.id);
    };
    const searchRenderSongs = async query => {
        const q = String(query || '').trim();
        if (!q) return [];
        const payload = await requestRenderRecommendation(`search?q=${encodeURIComponent(q)}`, 10000);
        return normalizeRenderRecommendationRows(payload);
    };

    const fetchTrending = async () => {
        if (State.playbackSourceMode !== 'online' || !navigator.onLine) return [];
        // The supplied OpenAPI contract has no dedicated charts/trending route. Use its documented
        // paginated song-search endpoint for fresh discovery queries, then merge/dedupe results.
        const queries = ['trending songs 2026', 'latest new songs 2026', 'trending English songs'];
        const pages = await Promise.all(queries.map(async query => {
            try {
                const payload = await requestSaavn(`search/songs?query=${encodeURIComponent(query)}&page=0&limit=20`, null, 12000);
                return extractRawSongs(payload).map(raw => normalizeTrack({...raw, provider:'saavn'})).filter(Boolean);
            } catch (_) { return []; }
        }));
        const seen = new Set(), merged=[];
        for (const track of pages.flat()) {
            const key = `${String(track.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}|${String(track.artist||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}`;
            if (!key || key === '|' || seen.has(key)) continue;
            seen.add(key); merged.push(track);
        }
        if (merged.length) return merged.slice(0,40);
        try {
            const data = await requestLegacy('trending', null, 9000);
            const list = Array.isArray(data?.songs) ? data.songs : extractRawSongs(data);
            return list.map(raw => normalizeTrack({...raw, provider:'machhar'})).filter(Boolean);
        } catch (_) { return []; }
    };
    const unwrapData = payload => payload?.data ?? payload?.result ?? payload;
    const getEntityTitle = item => decodeText(item?.name || item?.title || item?.album?.name || 'Untitled');
    const normalizeEntity = (kind, raw) => {
        if (!raw || typeof raw !== 'object') return null;
        const sourceId = String(raw.id || raw.albumId || raw.artistId || raw.playlistId || '').trim();
        if (!sourceId) return null;
        const artist = getArtist(raw);
        return {
            id: `${kind}:${sourceId}`, sourceId, type:kind, title:getEntityTitle(raw), artist:kind === 'artists' || artist === 'Unknown Artist' ? '' : artist,
            image:getEntityImage(kind, raw), description:decodeText(raw.description || raw.subtitle || ''),
            year:raw.year || '', language:raw.language || '', songCount:Number(raw.songCount || raw.songs?.length || 0),
            playCount:Number(raw.playCount || 0), raw
        };
    };
    const entityResponse = (payload, kind, query, page, limit) => {
        const data = unwrapData(payload) || {};
        const rows = Array.isArray(data.results) ? data.results : (Array.isArray(data[kind]) ? data[kind] : []);
        const items = rows.map(row => normalizeEntity(kind, row)).filter(Boolean);
        const total = Math.max(0, Number(data.total || data.totalCount || 0));
        const start = Math.max(0, Number(data.start ?? (page * (items.length || limit))) || 0);
        return {query, type:kind, page, limit, total:total || start + items.length, start, items,
            hasMore:items.length > 0 && (total ? start + items.length < total : items.length >= Math.min(3, limit))};
    };
    const searchEntities = async (kind, query, options = {}) => {
        const types = new Set(['playlists','albums','artists']);
        if (!types.has(kind)) throw new Error('Unsupported catalogue category.');
        const q = String(query || '').trim(); if (!q) return {query:'',type:kind,page:0,limit:20,total:0,start:0,items:[],hasMore:false};
        if (State.playbackSourceMode !== 'online') throw new Error('Switch to streaming playback to search the catalogue.');
        if (!navigator.onLine) throw new Error('No internet connection.');
        const page = Math.max(0, Number.parseInt(options.page, 10) || 0);
        const limit = Math.min(50, Math.max(10, Number.parseInt(options.limit, 10) || 20));
        const key = `${kind}|${q.toLocaleLowerCase()}|${page}|${limit}`;
        const cached = entitySearchCache.get(key);
        if (cached && cached.expiresAt > Date.now()) return cached.value;
        const payload = await requestSaavn(`search/${kind}?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, null, 8500);
        const value = entityResponse(payload, kind, q, page, limit);
        entitySearchCache.set(key, {value,expiresAt:Date.now()+10*60*1000});
        while (entitySearchCache.size > 100) entitySearchCache.delete(entitySearchCache.keys().next().value);
        return value;
    };
    const globalSearch = async (query) => {
        const q = String(query || '').trim();
        if (!q) return { topQuery: [], songs: [], albums: [], artists: [], playlists: [] };
        if (State.playbackSourceMode !== 'online') throw new Error('Switch to streaming playback to search the catalogue.');
        if (!navigator.onLine) throw new Error('No internet connection.');
        const payload = await requestSaavn(`search?query=${encodeURIComponent(q)}`, null, 8500);
        const data = unwrapData(payload) || {};
        const rows = (kind) => {
            const collection = data?.[kind];
            const list = Array.isArray(collection?.results) ? collection.results : (Array.isArray(collection) ? collection : []);
            return list.map(row => normalizeEntity(kind, row)).filter(Boolean);
        };
        const topRaw = Array.isArray(data?.topQuery?.results) ? data.topQuery.results : [];
        const topQuery = topRaw.map(raw => {
            const type = String(raw?.type || '').toLowerCase();
            if (type.includes('artist')) return normalizeEntity('artists', raw);
            if (type.includes('album')) return normalizeEntity('albums', raw);
            if (type.includes('playlist')) return normalizeEntity('playlists', raw);
            return normalizeTrack({...raw, provider:'saavn'});
        }).filter(Boolean);
        const songRows = Array.isArray(data?.songs?.results) ? data.songs.results : (Array.isArray(data?.songs) ? data.songs : []);
        const songs = songRows.map(raw => normalizeTrack({...raw, provider:'saavn'})).filter(Boolean);
        return {
            topQuery,
            songs: dedupeById(songs),
            albums: rows('albums'),
            artists: rows('artists'),
            playlists: rows('playlists'),
            raw: payload
        };
    };
    const dedupeById = list => {
        const seen = new Set();
        return (Array.isArray(list) ? list : []).filter(item => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id); return true;
        });
    };
    const fetchPublicPlaylist = async (id, options = {}) => {
        const reference = String(id || '').replace(/^playlists:/, '').trim();
        if (!reference) throw new Error('Playlist ID or link is missing.');
        const isLink=/^https?:\/\//i.test(reference), page = Math.max(0, Number.parseInt(options.page,10) || 0);
        const limit = Math.min(50, Math.max(10, Number.parseInt(options.limit,10) || 50));
        const key = `playlist|${reference}|${page}|${limit}`;
        const cached = entityDetailsCache.get(key); if (cached && cached.expiresAt>Date.now()) return cached.value;
        const payload = await requestSaavn(`playlists?${isLink?'link':'id'}=${encodeURIComponent(reference)}&page=${page}&limit=${limit}`, null, 18000);
        const raw = unwrapData(payload);
        if (!raw || typeof raw !== 'object') throw new Error('Playlist details were not returned.');
        const songs = Array.isArray(raw.songs) ? raw.songs : [];
        const sourceId=String(raw.id||raw.playlistId||reference);
        const value = {...normalizeEntity('playlists', raw), id:`playlists:${sourceId}`, sourceId,
            title:getEntityTitle(raw), image:getImage(raw), description:decodeText(raw.description || ''),
            total:Number(raw.songCount || songs.length || 0), page, limit,
            tracks:songs.map(song => normalizeTrack({...song,provider:'saavn'})).filter(Boolean), raw};
        entityDetailsCache.set(key,{value,expiresAt:Date.now()+10*60*1000});
        return value;
    };
    const fetchAlbumDetails = async id => {
        const reference=String(id||'').replace(/^albums:/,'').trim(); if(!reference)throw new Error('Album ID or link is missing.');
        const isLink=/^https?:\/\//i.test(reference),key=`album|${reference}`;const cached=entityDetailsCache.get(key);if(cached&&cached.expiresAt>Date.now())return cached.value;
        const payload=await requestSaavn(`albums?${isLink?'link':'id'}=${encodeURIComponent(reference)}`,null,18000);const raw=unwrapData(payload);
        if(!raw||typeof raw!=='object')throw new Error('Album details were not returned.');
        const songs=Array.isArray(raw.songs)?raw.songs:[];const sourceId=String(raw.id||raw.albumId||reference);
        const value={...normalizeEntity('albums',raw),id:`albums:${sourceId}`,sourceId,title:getEntityTitle(raw),image:getImage(raw),description:decodeText(raw.description||''),total:Number(raw.songCount||songs.length||0),tracks:songs.map(song=>normalizeTrack({...song,provider:'saavn'})).filter(Boolean),raw};
        entityDetailsCache.set(key,{value,expiresAt:10*60*1000+Date.now()});return value;
    };
    const fetchArtistDetails = async id => {
        const reference=String(id||'').replace(/^artists:/,'').trim();if(!reference)throw new Error('Artist ID or link is missing.');
        const isLink=/^https?:\/\//i.test(reference),key=`artist|${reference}`;const cached=entityDetailsCache.get(key);if(cached&&cached.expiresAt>Date.now())return cached.value;
        const query='page=0&songCount=0&albumCount=6&sortBy=popularity&sortOrder=desc';
        const lookup=isLink?`link=${encodeURIComponent(reference)}`:`id=${encodeURIComponent(reference)}`;
        const payload=await requestSaavn(`artists?${lookup}&${query}`,null,18000);
        let raw=unwrapData(payload);if(Array.isArray(raw))raw=raw[0];if(raw?.artist&&typeof raw.artist==='object')raw=raw.artist;
        if(!raw||typeof raw!=='object')throw new Error('Artist details were not returned.');
        const sourceId=String(raw.id||raw.artistId||reference);
        const bioRows=(Array.isArray(raw.bio)?raw.bio:[]).filter(Boolean).sort((a,b)=>(Number(a?.sequence)||0)-(Number(b?.sequence)||0));
        const description=decodeText(bioRows.map(row=>row?.text||row?.title||'').filter(Boolean).join(' ').replace(/\s+/g,' ').trim()||raw.description||'');
        const topTracks=(Array.isArray(raw.topSongs)?raw.topSongs:[]).map(song=>normalizeTrack({...song,provider:'saavn'})).filter(Boolean);
        const singles=(Array.isArray(raw.singles)?raw.singles:[]).map(song=>normalizeTrack({...song,provider:'saavn'})).filter(Boolean);
        const albums=(Array.isArray(raw.topAlbums)?raw.topAlbums:[]).map(row=>normalizeEntity('albums',row)).filter(Boolean);
        const similarArtists=(Array.isArray(raw.similarArtists)?raw.similarArtists:[]).map(row=>normalizeEntity('artists',row)).filter(Boolean);
        const value={...normalizeEntity('artists',raw),id:`artists:${sourceId}`,sourceId,title:getEntityTitle(raw),image:getEntityImage('artists',raw),description,tracks:topTracks,topTracks,singles,albums,artists:similarArtists,totalSongs:Number(raw.songCount||raw.totalSongs||0),totalAlbums:Number(raw.albumCount||raw.totalAlbums||albums.length||0),followerCount:raw.followerCount??null,fanCount:raw.fanCount??'',isVerified:Boolean(raw.isVerified),dominantLanguage:decodeText(raw.dominantLanguage||''),dominantType:decodeText(raw.dominantType||''),availableLanguages:Array.isArray(raw.availableLanguages)?raw.availableLanguages:[],dob:decodeText(raw.dob||''),isRadioPresent:Boolean(raw.isRadioPresent),social:{url:raw.url||'',fb:raw.fb||'',twitter:raw.twitter||'',wiki:raw.wiki||''},bioRows,raw};
        entityDetailsCache.set(key,{value,expiresAt:10*60*1000+Date.now()});return value;
    };
    const songBelongsToArtist = (track, artistId, artistName) => {
        const raw=track?.raw||track||{};
        const targetId=String(artistId||'').replace(/^artists:/,'').trim();
        const targetName=artistNameKey(artistName||'');
        const candidates=[];
        const add=list=>{if(Array.isArray(list))candidates.push(...list.filter(item=>item&&typeof item==='object'));};
        add(raw.artists?.primary);add(raw.artists?.featured);add(raw.artists?.all);
        add(raw.artistMap?.primary_artists);add(raw.more_info?.artistMap?.primary_artists);
        for(const item of candidates){
            const id=String(item.id||item.artistId||'').trim();
            if(targetId&&id&&id===targetId)return true;
        }
        if(!targetName)return false;
        const names=candidates.map(item=>item.name||item.title||'');
        for(const field of [raw.primaryArtists,raw.singers,raw.subtitle,raw.artist,raw.more_info?.singers]){
            if(typeof field==='string')names.push(...field.split(/[,;|]|\s+(?:feat(?:uring)?|ft\.?|with)\s+/i));
            else if(Array.isArray(field))names.push(...field.map(item=>typeof item==='string'?item:item?.name||''));
        }
        return names.some(name=>artistNameKey(name)===targetName);
    };
    const fetchArtistSongs = async (id, page = 0, artistName = '') => {
        const sourceId=String(id||'').replace(/^artists:/,'').trim();if(!sourceId)throw new Error('Artist ID is missing.');
        const pageIndex=Math.max(0,Number(page)||0);
        const parseArtistPage=(payload,pageSizeFallback=10)=>{
            let raw=unwrapData(payload)||{};if(raw?.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))raw=raw.data;
            const collection=raw.songs??raw.results??raw.data?.songs??raw.data?.results;
            const songs=Array.isArray(collection)?collection:(Array.isArray(collection?.results)?collection.results:[]);
            const declaredTotal=raw.total ?? raw.songCount ?? payload?.total;
            const hasTotal=declaredTotal!==undefined&&declaredTotal!==null&&Number.isFinite(Number(declaredTotal))&&Number(declaredTotal)>0;
            const declaredPageSize=Number(raw.pageSize ?? raw.page_size ?? 0);
            const pageSize=declaredPageSize>0?declaredPageSize:(songs.length||pageSizeFallback);
            const start=Number(raw.start ?? raw.offset ?? pageIndex*pageSize);
            const tracks=songs.map(song=>normalizeTrack({...song,provider:'saavn'})).filter(Boolean);
            const total=hasTotal?Number(declaredTotal):Math.max(start+tracks.length,tracks.length);
            const hasMore=hasTotal?(start+tracks.length<total):(tracks.length>=pageSize&&tracks.length>0);
            return {total,start,page:pageIndex,pageSize,hasTotal,hasMore,tracks,raw};
        };
        let endpointPage=null, endpointError=null;
        try{
            const payload=await requestSaavn(`artists/${encodeURIComponent(sourceId)}/songs?page=${pageIndex}&sortBy=popularity&sortOrder=desc`,null,18000);
            endpointPage=parseArtistPage(payload,10);
            if(endpointPage.tracks.length)return {...endpointPage,tracks:endpointPage.tracks};
        }catch(error){endpointError=error;}

        if(String(artistName||'').trim()){
            try{
                const candidates=await search(String(artistName).trim(),{page:pageIndex,limit:40,background:true});
                const tracks=dedupeById(candidates.filter(track=>songBelongsToArtist(track,sourceId,artistName)));
                if(tracks.length){
                    const meta=candidates.searchMeta||{};
                    const hasTotal=Number(meta.total)>0;
                    return {
                        total:Math.max(tracks.length,Number(meta.total)||0,Number(endpointPage?.total)||0),
                        start:Number(meta.start)||pageIndex*40,page:pageIndex,pageSize:40,hasTotal,
                        hasMore:Boolean(meta.hasMore)||tracks.length>=40,tracks,fallback:true
                    };
                }
            }catch(fallbackError){if(endpointError)throw endpointError;}
        }
        if(endpointError)throw endpointError;
        return endpointPage||{total:0,start:0,page:pageIndex,pageSize:10,tracks:[]};
    };
    const fetchArtistAlbums = async (id, page = 0) => {
        const sourceId=String(id||'').replace(/^artists:/,'').trim();if(!sourceId)throw new Error('Artist ID is missing.');
        const pageIndex=Math.max(0,Number(page)||0);
        const payload=await requestSaavn(`artists/${encodeURIComponent(sourceId)}/albums?page=${pageIndex}&sortBy=popularity&sortOrder=desc`,null,18000);
        let raw=unwrapData(payload)||{};if(raw?.data&&typeof raw.data==='object'&&!Array.isArray(raw.data))raw=raw.data;
        const collection=raw.albums??raw.results??raw.data?.albums??raw.data?.results;
        const rows=Array.isArray(collection)?collection:(Array.isArray(collection?.results)?collection.results:[]);
        const total=Number(raw.total ?? raw.albumCount ?? payload?.total ?? 0) || rows.length;
        const declaredPageSize=Number(raw.pageSize ?? raw.page_size ?? 0);
        const pageSize=declaredPageSize>0?declaredPageSize:(rows.length||10);
        return {total,start:Number(raw.start ?? raw.offset ?? pageIndex*pageSize),page:pageIndex,pageSize,items:rows.map(row=>normalizeEntity('albums',row)).filter(Boolean)};
    };
    const getSearchMeta = () => ({...searchMeta});
    const decorateSearchResults = (tracks, meta) => {
        try { Object.defineProperty(tracks, 'searchMeta', {value:{...meta}, enumerable:false, configurable:true}); } catch (_) {}
        return tracks;
    };
    const rankRelevantSearchTracks = (tracks, query) => {
        const normalize=value=>String(value||'').toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
        const stop=new Set(['a','an','the','and','or','of','for','from','to','in','on','song','songs','music','audio','video','official','full','track','tracks','hits','hit','top','best','trending','latest','popular','new','playlist','playlists','hindi','indian','bollywood','punjabi','tamil','telugu','english','lofi','chill','romantic','love']);
        const queryText=normalize(query),tokens=queryText.split(/\s+/).filter(token=>token.length>1&&!stop.has(token));
        if(tokens.length<2)return tracks;
        const ranked=[];
        for(const track of tracks||[]){
            const title=normalize(track.title),artist=normalize(track.artist),album=normalize(track.album),all=`${title} ${artist} ${album}`;
            const allTokens=tokens.every(token=>all.split(/\s+/).includes(token)||all.includes(token));
            if(!allTokens)continue;
            const phrase=title.includes(queryText)?120:all.includes(queryText)?100:0;
            const titleHits=tokens.filter(token=>title.split(/\s+/).includes(token)).length;
            const score=phrase+titleHits*8+(tokens.every(token=>title.split(/\s+/).includes(token))?25:0)+(track.artworkUrl?1:0);
            ranked.push({track,score});
        }
        return ranked.sort((a,b)=>b.score-a.score).map(row=>row.track);
    };
    const search = async (query, options = {}) => {
        const q = String(query || '').trim();
        if (!q) return decorateSearchResults([], {query:'',page:0,limit:40,total:0,hasMore:false,provider:'saavn'});
        if (State.playbackSourceMode !== 'online') throw new Error('Switch to streaming playback to search the catalogue.');
        if (!navigator.onLine) throw new Error('You are offline. Reconnect to search the music catalogue.');
        const page = Math.max(0, Number.parseInt(options.page,10) || 0);
        const limit = Math.min(50, Math.max(10, Number.parseInt(options.limit,10) || 40));
        const background = options.background === true;
        const forceRefresh = options.forceRefresh === true;
        const cacheKey = `${q.toLocaleLowerCase()}|${page}|${limit}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            if (!background) searchMeta = {...cached.meta};
            return decorateSearchResults(cached.tracks.map(track => onlineTracks.get(track.id) || track), cached.meta);
        }
        if (cached && cached.tracks.length && !forceRefresh) {
            if (!refreshingSearchCache.has(cacheKey)) {
                refreshingSearchCache.add(cacheKey);
                search(q, {...options, background:true, forceRefresh:true}).catch(() => {}).finally(() => refreshingSearchCache.delete(cacheKey));
            }
            if (!background) searchMeta = {...cached.meta};
            return decorateSearchResults(cached.tracks.map(track => onlineTracks.get(track.id) || track), cached.meta);
        }
        let requestId = 0;
        const controller = new AbortController();
        if (!background) {
            latestSearchRequest++; requestId = latestSearchRequest;
            if (activeController) activeController.abort();
            activeController = controller;
        }
        const timeout = setTimeout(() => controller.abort(), 16000);
        let payload, rawSongs = [], chosenProvider = 'saavn', resultMeta = null;
        try {
            try {
                payload = await requestSaavn(`search/songs?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, controller.signal, 8500);
                rawSongs = extractRawSongs(payload);
                if (!rawSongs.length && page === 0 && !controller.signal.aborted) {
                    const global = await requestSaavn(`search?query=${encodeURIComponent(q)}`, controller.signal, 7500);
                    const globalRows = extractRawSongs(global);
                    if (globalRows.length) { rawSongs = globalRows; payload = global; }
                }
                const info = unwrapData(payload) || payload?.data || {};
                const explicitTotal = Number(info.total ?? info.totalCount ?? info.data?.total ?? payload?.total) || 0;
                const explicitStartValue = info.start ?? info.offset;
                const startIndex = explicitStartValue !== undefined && Number.isFinite(Number(explicitStartValue))
                    ? Math.max(0, Number(explicitStartValue))
                    : page * (rawSongs.length || limit);
                const observedEnd = startIndex + rawSongs.length;
                const hasMore = rawSongs.length > 0 && (explicitTotal ? observedEnd < explicitTotal : rawSongs.length >= limit);
                const total = explicitTotal || (hasMore ? Math.max(observedEnd + limit, (page + 1) * limit + 1) : observedEnd);
                resultMeta = {query:q, page, limit, total:Math.max(total, observedEnd), start:startIndex, hasMore, provider:'saavn'};
            } catch (primaryError) {
                if (controller.signal.aborted || !navigator.onLine) throw primaryError;
                chosenProvider = 'machhar';
                try {
                    payload = await requestLegacy(`search?q=${encodeURIComponent(q)}`, controller.signal, 8000);
                } catch (_) {
                    payload = await requestLegacyApi(`search/songs?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, controller.signal, 8000);
                }
                rawSongs = extractRawSongs(payload);
                const info = unwrapData(payload) || payload?.data || {};
                const explicitTotal = Number(info.total ?? info.totalCount ?? payload?.total) || 0;
                const startIndex = Number(info.start ?? info.offset ?? page * (rawSongs.length || limit)) || 0;
                const observedEnd = startIndex + rawSongs.length;
                const hasMore = rawSongs.length > 0 && (explicitTotal ? observedEnd < explicitTotal : rawSongs.length >= limit);
                resultMeta = {query:q, page, limit, total:explicitTotal||observedEnd+(hasMore?limit:0), start:startIndex, hasMore, provider:'machhar'};
            }
            if ((!background && requestId !== latestSearchRequest) || State.playbackSourceMode !== 'online') return decorateSearchResults([], resultMeta || {query:q,page,limit,total:0,hasMore:false,provider:chosenProvider});
            const normalized = rankRelevantSearchTracks(rawSongs.map(raw => normalizeTrack({...raw, provider:raw.provider || chosenProvider})).filter(Boolean),q);
            const meta = resultMeta || {query:q,page,limit,total:normalized.length,hasMore:false,provider:chosenProvider};
            if (!background && requestId === latestSearchRequest) searchMeta = {...meta};
            searchCache.set(cacheKey, {tracks:normalized.slice(), meta:{...meta}, expiresAt:Date.now()+180_000});
            while (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
            if (window.OnlineCache) OnlineCache.warmTracks(normalized.slice(0,50));
            return decorateSearchResults(normalized, meta);
        } finally {
            clearTimeout(timeout);
            if (!background && requestId === latestSearchRequest) activeController = null;
        }
    };
    const invalidateStream = trackId => streamCache.delete(String(trackId || ''));
    const getStreamChoices = async (track, options = {}) => {
        let choices = parseStreamChoices(track?.raw || {});
        if (!choices.length || options.refresh) choices = parseStreamChoices(await fetchSongDetails(track));
        const valid=choices.filter(item=>safeHttpUrl(item.url));
        valid.sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality));
        return options.all ? valid : (valid.length?[valid[0]]:[]);
    };
    // Build a bounded list of playable URLs rather than trusting a single proxy route.
    // The service-worker URL is attempted first when controlled; direct primary/fallback
    // proxy URLs are then tried because a SW's cross-origin fetch can be rejected by CORS.
    const playbackUrlsFor = value => {
        const normalized = safeHttpUrl(value);
        if (!normalized) return [];
        let source = normalized;
        let inputWasMediaProxy = false;
        try {
            const input = new URL(normalized);
            if (BACKEND_ORIGINS.includes(input.origin) && input.pathname === '/media') {
                inputWasMediaProxy = true;
                source = safeHttpUrl(input.searchParams.get('url') || '');
                if (!source) return [normalized];
            }
            const sourceURL = new URL(source);
            if (!isCatalogueMediaHost(sourceURL.hostname)) return [normalized];
        } catch (_) { return [normalized]; }
        const result = [];
        const add = candidate => { const safe = safeHttpUrl(candidate); if (safe && !result.includes(safe)) result.push(safe); };
        if (inputWasMediaProxy) add(normalized);
        add(proxyMediaUrl(source));
        for (const origin of BACKEND_ORIGINS) add(`${origin}/media?url=${encodeURIComponent(source)}`);
        add(source); // Last-resort direct CDN URL; some catalogues permit it, others geo-block it.
        return result;
    };
    const resolvePlaybackCandidates = async (track, options = {}) => {
        if (!track?.onlineTrackId) throw new Error('This streaming result has no song ID. Search again to refresh it.');
        if (State.playbackSourceMode !== 'online') throw new Error('Streaming playback is turned off.');
        if (!navigator.onLine) throw new Error('An internet connection is required for streaming playback.');
        const forceRefresh = Boolean(options.forceRefresh);
        const cached = streamCache.get(String(track.id));
        if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
            if (Array.isArray(cached.candidates) && cached.candidates.length) return cached.candidates.slice();
            if (cached.url) {
                const upgraded = playbackUrlsFor(cached.url);
                if (upgraded.length) {
                    streamCache.set(String(track.id), {url:upgraded[0], candidates:upgraded, expiresAt:cached.expiresAt});
                    return upgraded;
                }
            }
        }
        streamCache.delete(String(track.id));
        if (activeStreamController) activeStreamController.abort();
        const controller = new AbortController(); activeStreamController = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            const choices = await getStreamChoices(track, {all:true, refresh:forceRefresh});
            let usable = choices.filter(item => safeHttpUrl(item.url)).sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality));
            if (!usable.length && track.provider === 'machhar') {
                const data = await requestLegacy(`stream/${encodeURIComponent(track.onlineTrackId)}`, controller.signal, 15000);
                usable = parseStreamChoices(data).filter(item=>safeHttpUrl(item.url)).sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality));
            }
            const candidates = [];
            for (const choice of usable.slice(0, 3)) {
                for (const url of playbackUrlsFor(choice.url)) {
                    if (!candidates.includes(url)) candidates.push(url);
                }
            }
            if (!candidates.length) throw new Error('The music service did not return a usable audio URL.');
            // Try the highest-quality source through every supported route, then a second
            // source quality. Avoid making a slow connection wait through every catalogue URL.
            const bounded = candidates.slice(0, 7);
            streamCache.set(String(track.id), {url:bounded[0], candidates:bounded, expiresAt:Date.now()+4*60*1000});
            return bounded;
        } finally { clearTimeout(timer); if (activeStreamController === controller) activeStreamController = null; }
    };
    const markStreamWorking = (trackId, url) => {
        const key = String(trackId || '');
        const cached = streamCache.get(key);
        if (!cached || !url) return false;
        const candidates = [url, ...(cached.candidates || [])].filter((item, index, all) => item && all.indexOf(item) === index);
        streamCache.set(key, {url:candidates[0], candidates, expiresAt:Date.now()+4*60*1000});
        return true;
    };
    const resolveStream = async track => {
        const candidates = await resolvePlaybackCandidates(track);
        return candidates[0] || null;
    };
    const resolveDownloadSource = async track => {
        if (!track?.onlineTrackId) throw new Error('This result has no song ID. Search again to refresh it.');
        if (State.playbackSourceMode !== 'online') throw new Error('Switch to streaming playback before downloading.');
        if (!navigator.onLine) throw new Error('Reconnect to download AAC audio.');
        const choices = (await getStreamChoices(track, {all:true})).filter(item => safeHttpUrl(item.url));
        if (!choices.length) throw new Error('The catalogue returned no download source.');
        const explicitAAC = choices.filter(item => /aac|mp4a/i.test(`${item.codec} ${item.format}`) || /\.(?:m4a|mp4)(?:$|[?#])/i.test(item.url));
        const eligible = explicitAAC.filter(item => !/mp3|mpeg/i.test(`${item.codec} ${item.format}`) && !/\.mp3(?:$|[?#])/i.test(item.url));
        if (!eligible.length) throw new Error('The catalogue did not identify an AAC/M4A source. Mujic will not relabel or transcode MP3.');
        eligible.sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality));
        return {...eligible[0], url:proxyMediaUrl(eligible[0].url)};
    };
    const renderBlank = () => {
        if (window.OnlineWorkspace && document.getElementById('view-online-search')?.classList.contains('active')) {
            OnlineWorkspace.renderSearchBlank(); return;
        }
        const c = document.getElementById('search-results'); if (!c) return;
        if (State.playbackSourceMode === 'online') {
            c.innerHTML = `<div class="online-network-state"><span class="material-symbols-rounded">${navigator.onLine ? 'search' : 'wifi_off'}</span><div class="empty-title">${navigator.onLine ? 'Search music' : 'You are offline'}</div><div class="empty-desc">${navigator.onLine ? 'Find songs, artists, albums and playlists.' : 'Reconnect to continue listening to the catalogue.'}</div></div>`;
        } else c.innerHTML = '<div class="empty-state"><div class="empty-desc">Search your local library.</div></div>';
    };
    const searchAndRender = query => {
        if (window.OnlineWorkspace) return OnlineWorkspace.performSearch(query);
        return Promise.resolve(search(query));
    };
    const prefetchedChunks = new Map();
    let activeChunkPrefetch = null;
    const prefetchStreams = async tracks => {
        const next = (Array.isArray(tracks) ? tracks : []).find(track => isOnlineTrack(track) && track?.id && track?.id !== Player.getCurrentTrack()?.id);
        if (!next || !navigator.onLine) return false;
        const swControlled = location.protocol !== 'file:' && Boolean(navigator.serviceWorker?.controller);
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection?.saveData || /^(?:slow-2g|2g)$/i.test(String(connection?.effectiveType || ''))) return false;
        if (prefetchedChunks.has(String(next.id))) return true;
        if (activeChunkPrefetch) { try { activeChunkPrefetch.abort(); } catch (_) {} }
        const controller = new AbortController(); activeChunkPrefetch = controller;
        const timeout = setTimeout(() => controller.abort(), 9000);
        try {
            const mediaUrl = await resolveStream(next);
            if (controller.signal.aborted || State.playbackSourceMode !== 'online') return false;
            let url = new URL(mediaUrl, location.href), fetchCache='default', credentials='omit';
            if (swControlled) {
                if (BACKEND_ORIGINS.includes(url.origin) && url.pathname === '/media') {
                    const source = safeHttpUrl(url.searchParams.get('url') || '');
                    if (!source || !isCatalogueMediaHost(new URL(source).hostname)) return false;
                    const local = new URL('__mujic_media__', location.href); local.searchParams.set('src', source); url = local;
                }
                if (url.origin !== location.origin || !url.pathname.endsWith('/__mujic_media__')) return false;
                streamCache.set(next.id, {url:url.href, expiresAt:Date.now()+4*60*1000});
                url.searchParams.set('_mujic_prefetch', '1'); fetchCache='no-store'; credentials='same-origin';
            } else if (!BACKEND_ORIGINS.includes(url.origin) || url.pathname !== '/media') {
                return false;
            }
            const mediaInit = { method:'GET', headers:{Range:'bytes=0-262143',Accept:'audio/*'}, cache:fetchCache, credentials, signal:controller.signal };
            const response = window.MujicBackend.isBackendOrigin(url.origin)
                ? await window.MujicBackend.fetchWithFallback(url.pathname + url.search, mediaInit, { timeoutMs: 15000 })
                : await fetch(url.href, mediaInit);
            const contentRange=String(response.headers.get('Content-Range')||'').match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
            const lengthHint=Number(response.headers.get('Content-Length'));
            if(response.status!==206 || !contentRange || Number(contentRange[1])!==0 || !Number.isFinite(Number(contentRange[3])) || Number(contentRange[2])-Number(contentRange[1])+1>262144 || (Number.isFinite(lengthHint)&&lengthHint>262144)) { try { await response.body?.cancel(); } catch (_) {} return false; }
            const bytes = await response.arrayBuffer();
            if (bytes.byteLength > 0 && bytes.byteLength <= 262144 && !controller.signal.aborted) {
                prefetchedChunks.set(String(next.id), { at:Date.now(), bytes:bytes.byteLength });
                while(prefetchedChunks.size > 6) prefetchedChunks.delete(prefetchedChunks.keys().next().value);
                return true;
            }
            return false;
        } catch (_) { return false; }
        finally { clearTimeout(timeout); if(activeChunkPrefetch===controller)activeChunkPrefetch=null; }
    };
    const clearCache = () => {
        streamCache.clear(); searchCache.clear(); entitySearchCache.clear(); entityDetailsCache.clear(); relatedCache.clear(); relatedRateLimitedUntil = 0;
        for (const audio of audioPreloaders.values()) { try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (_) {} }
        audioPreloaders.clear(); prefetchedChunks.clear(); if(activeChunkPrefetch){try{activeChunkPrefetch.abort();}catch(_){}} activeChunkPrefetch=null; navigator.serviceWorker?.controller?.postMessage({type:'CLEAR_ONLINE_MEDIA_CACHE'}); if (window.OnlineCache) OnlineCache.clear();
    };
    const stopRemotePlayback = () => {
        const current = Player.getCurrentTrack(); if (!current || current.source !== 'machhar-online') return;
        State.playbackRequestId++; AudioAdapter.pause(); AudioAdapter.audio.removeAttribute('src'); AudioAdapter.audio.load();
        State.currentTrackId = null; State.queue = []; State.playbackOrder = []; State.queueIndex = -1; delete AudioAdapter.audio.dataset.mujicTrackId;
        State.currentTime = 0; State.duration = 0; State.resumePosition = 0; State.isPlaying = false;
        document.getElementById('mini-player')?.classList.remove('visible');
        if (State.isFullPlayerOpen) UI.closeFullPlayer();
        UI.updateProgress(); UI.updateDuration(); UI.updatePlayPause(); UI.renderQueue(); StorageAdapter.saveSettings();
    };
    const updateModeUI = () => {
        const online = State.playbackSourceMode === 'online';
        document.body.classList.toggle('online-mode', online);
        document.getElementById('app-layout')?.classList.toggle('online-mode', online);
        document.querySelectorAll('[data-workspace="offline"]').forEach(el => { el.hidden = online; });
        document.querySelectorAll('[data-workspace="online"]').forEach(el => { el.hidden = !online; });
        const offlineButtons = document.querySelectorAll('[data-action="set-playback-mode"][data-mode="offline"]');
        const onlineButtons = document.querySelectorAll('[data-action="set-playback-mode"][data-mode="online"]');
        offlineButtons.forEach(el => { el.classList.toggle('active', !online); el.setAttribute('aria-pressed',String(!online)); });
        onlineButtons.forEach(el => { el.classList.toggle('active', online); el.setAttribute('aria-pressed',String(online)); });
        document.querySelectorAll('[data-action="toggle-playback-mode"]').forEach(el => { el.classList.toggle('is-online', online); el.classList.toggle('is-offline', !online); el.setAttribute('aria-pressed', String(online)); el.setAttribute('data-current-mode', online ? 'online' : 'offline'); });
        const indicator = document.getElementById('workspace-online-pill');
        if (indicator) { indicator.hidden = true; indicator.textContent = ''; }
        const hint = document.getElementById('playback-mode-hint');
        if (hint) hint.textContent = '';
        const warning = document.getElementById('online-beta-note'); if (warning) warning.hidden = !online;
        const input = document.getElementById('search-input'); if (input) input.placeholder = 'Search your offline library…';
        const onlineInput = document.getElementById('online-search-input'); if (onlineInput) onlineInput.placeholder = 'Search songs, artists, albums…';
        if (window.OnlineWorkspace) OnlineWorkspace.updateWorkspaceUI();
    };
    const stopLocalPlaybackForModeSwitch = () => {
        const current=Player.getCurrentTrack();
        if(!current || isOnlineTrack(current)) return;
        State.playbackRequestId++;
        AudioAdapter.pause();
        if(AudioAdapter.currentObjectUrl){try{URL.revokeObjectURL(AudioAdapter.currentObjectUrl);}catch(_){}AudioAdapter.currentObjectUrl=null;}
        AudioAdapter.audio.removeAttribute('src'); AudioAdapter.audio.load(); delete AudioAdapter.audio.dataset.mujicTrackId;
        UI.updatePlayPause();
    };
    const transitionMode = async work => {
        const reduced = document.body.classList.contains('reduced-motion') || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (typeof document.startViewTransition === 'function' && !reduced) {
            try {
                const transition = document.startViewTransition(() => { work(); });
                await transition.updateCallbackDone;
                return;
            } catch (_) { return; }
        }
        document.body.classList.add('workspace-switching');
        if (modeAnimationTimer) clearTimeout(modeAnimationTimer);
        modeAnimationTimer = setTimeout(() => document.body.classList.remove('workspace-switching'), 340);
        work();
    };
    const setMode = async mode => {
        const next = mode === 'online' ? 'online' : 'offline';
        if (next === State.playbackSourceMode) {
            updateModeUI();
            if (window.OnlineWorkspace) OnlineWorkspace.onModeChange(next);
            return true;
        }
        if (next === 'online') {
            const accepted = localStorage.getItem('mujic-online-beta-accepted') === 'yes';
            if (!accepted) {
                const confirmed = await Dialog.show({
                    title:'Streaming · Beta',
                    message:'Streaming playback is experimental and may be temporarily unavailable. Your local library stays separate. Enable streaming?',
                    confirmText:'Enable', cancelText:'Stay offline'
                });
                if (!confirmed) { updateModeUI(); return false; }
                localStorage.setItem('mujic-online-beta-accepted','yes');
            }
        }
        const previous = State.playbackSourceMode;
        if (window.OnlineWorkspace) OnlineWorkspace.beforeModeChange(next, previous);
        if (next === 'online') stopLocalPlaybackForModeSwitch();
        const applyMode = () => {
            State.playbackSourceMode = next; StorageAdapter.saveSettings(); updateModeUI();
            if (next === 'offline') {
                latestSearchRequest++; if (activeController) activeController.abort();
                if (activeStreamController) activeStreamController.abort();
                stopRemotePlayback();
            }
            if (window.OnlineWorkspace) OnlineWorkspace.onModeChange(next, previous);
            else if (window.UI) UI.switchView(next === 'online' ? 'online-home' : 'home');
        };
        await transitionMode(applyMode);
        return true;
    };
    window.addEventListener('offline', () => {
        updateModeUI(); if (State.playbackSourceMode === 'online') {
            if (window.OnlineWorkspace) OnlineWorkspace.renderConnectivityState(); else renderBlank();
        }
    });
    window.addEventListener('online', () => {
        updateModeUI(); if (State.playbackSourceMode === 'online' && window.OnlineWorkspace) OnlineWorkspace.refreshActiveView();
    });
    return { API_BASE, BACKEND_BASE:LEGACY_BASE, LEGACY_BASE, RENDER_RECOMMENDATIONS_BASE, requestRenderRecommendation, fetchRenderQuickPicks, fetchRenderSuggestions, searchRenderSongs, proxyMediaUrl, isOnlineId, isOnlineTrack, getTrack, registerTrack, normalizeTrack, extractSongs:extractRawSongs, search, searchEntities, globalSearch, getImage, resolveArtistArtwork, isGenericArtistArtwork:imageLooksGeneric, fetchSongsByIdsOrLink, fetchPublicPlaylist, fetchAlbumDetails, fetchArtistDetails, fetchArtistSongs, fetchArtistAlbums, getSearchMeta, searchAndRender, resolveStream, resolvePlaybackCandidates, markStreamWorking, resolveDownloadSource, fetchSongDetails, fetchRelated, fetchTrending, prefetchStreams, invalidateStream, clearCache, renderBlank, updateModeUI, setMode, stopRemotePlayback };
})();
window.OnlineMusic = OnlineMusic;
