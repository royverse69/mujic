/* Online catalogue and playback provider. The supplied API specification defines the primary endpoints.
 * Legacy stream endpoints remain a compatibility fallback. Signed stream URLs are memory-only.
 */
const OnlineMusic = (() => {
    const LEGACY_BASE = 'https://gaana-suno-varna-machhar-aajayega.onrender.com/';
    // Catalogue endpoints are routed through the Render backend proxy; never call the upstream host from the browser.
    const API_BASE = `${LEGACY_BASE.replace(/\/$/, '')}/api`;
    const ONLINE_PREFIX = 'machhar:';
    const streamCache = new Map();
    const onlineTracks = new Map();
    const searchCache = new Map();
    const entitySearchCache = new Map();
    const entityDetailsCache = new Map();
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
    const BACKEND_ORIGIN = new URL(LEGACY_BASE).origin;
    const isCatalogueMediaHost = hostname => {
        const host = String(hostname || '').toLowerCase();
        return host === 'saavncdn.com' || host.endsWith('.saavncdn.com') ||
            host === 'jiosaavn.com' || host.endsWith('.jiosaavn.com');
    };
    // Route known music-provider audio/artwork CDNs through Render too. Unknown external
    // media hosts are left intact for compatibility rather than sent to an untrusted proxy.
    const proxyMediaUrl = value => {
        const normalized = safeHttpUrl(value);
        if (!normalized) return '';
        try {
            const url = new URL(normalized);
            if (url.origin === BACKEND_ORIGIN && url.pathname === '/media') return normalized;
            if (!isCatalogueMediaHost(url.hostname)) return normalized;
            // Once controlled by the PWA service worker, use a same-origin media route so a
            // small byte-range chunk can be warmed and reused by the native audio element.
            if (typeof location !== 'undefined' && location.protocol !== 'file:' && location.origin !== BACKEND_ORIGIN && navigator.serviceWorker?.controller) {
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
        // Rank metadata first and proxy only the one highest-quality artwork URL we will display.
        const candidates = images.map(item => ({
            source: typeof item === 'string' ? item : (item?.url || item?.link || item?.src || item?.imageUrl || item?.image_url || item?.thumbnail),
            quality: qualityNumber(item?.quality || item?.size || item?.width || item?.height)
        })).filter(item => typeof item.source === 'string' && item.source.trim());
        candidates.sort((a,b) => b.quality-a.quality);
        return candidates.length ? proxyMediaUrl(candidates[0].source) : '';
    };
    const getImage = raw => {
        if (!raw || typeof raw !== 'object') return '';
        // Consider all documented artwork fields together, then keep just the highest-quality URL.
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
                // The global endpoint mixes tracks with artists/albums/playlists. A name/title by itself is not a song schema.
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
    const request = async (url, signal, timeoutMs = 15000) => {
        if (!navigator.onLine) throw new Error('No internet connection. Reconnect and try again.');
        const controller = signal ? null : new AbortController();
        const requestSignal = signal || controller.signal;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
            const response = await fetch(url, { method:'GET', headers:{ Accept:'application/json' }, cache:'no-store', credentials:'omit', signal:requestSignal });
            if (!response.ok) throw new Error(`Music service returned HTTP ${response.status}`);
            const body = await response.text();
            try { return JSON.parse(body); } catch (_) { return body; }
        } finally { if (timer) clearTimeout(timer); }
    };
    const requestSaavn = (path, signal, timeout = 15000) => request(`${API_BASE}/${path.replace(/^\//,'')}`, signal, timeout);
    const requestLegacy = (path, signal, timeout = 15000) => request(`${LEGACY_BASE}${path.replace(/^\//,'')}`, signal, timeout);
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
        } catch (_) { /* fall through to the documented multi-ID lookup */ }
        if (!candidate) {
            const fallback=await fetchSongsByIdsOrLink(track.onlineTrackId);
            candidate=fallback[0]?.raw || null;
        }
        if (!candidate) throw new Error('Song details were not returned by the catalogue.');
        // Preserve the richest raw metadata on this session track without persisting signed links.
        track.raw = { ...(track.raw || {}), ...candidate };
        track.artworkUrl = track.artworkUrl || getImage(candidate);
        track.lyricsId = track.lyricsId || candidate.lyricsId || null;
        if (window.OnlineCache) OnlineCache.rememberTrack(track); // sanitized metadata only; no signed URLs
        return candidate;
    };
    const fetchRelated = async track => {
        if (State.playbackSourceMode !== 'online') throw new Error('Streaming mode is turned off.');
        if (!navigator.onLine) throw new Error('No internet connection.');
        if (!track?.onlineTrackId) return [];
        const payload = track.provider === 'machhar'
            ? await requestLegacy(`queue/${encodeURIComponent(track.onlineTrackId)}`, null, 12000)
            : await requestSaavn(`songs/${encodeURIComponent(track.onlineTrackId)}/suggestions?limit=20`, null, 12000);
        const candidates = [
            payload?.data?.results, payload?.data?.songs?.results, payload?.data?.suggestions,
            payload?.data?.songs, payload?.data?.queue, payload?.queue, payload?.songs,
            payload?.results, Array.isArray(payload?.data) ? payload.data : null,
            Array.isArray(payload) ? payload : null
        ].find(Array.isArray);
        if (candidates) return candidates;
        const one = Array.isArray(payload?.data) ? payload.data[0] : (payload?.data || payload?.song || payload);
        return one && typeof one === 'object' && (one.id || one.songId || one.name || one.title) ? [one] : [];
    };
    const fetchTrending = async () => {
        if (State.playbackSourceMode !== 'online' || !navigator.onLine) return [];
        try {
            const data = await requestSaavn('search/songs?query=trending%20Hindi%20songs&page=0&limit=30', null, 12000);
            return extractRawSongs(data).map(raw => normalizeTrack({...raw, provider:'saavn'})).filter(Boolean);
        } catch (_) {
            try {
                const data = await requestLegacy('trending', null, 9000);
                const list = Array.isArray(data?.songs) ? data.songs : extractRawSongs(data);
                return list.map(raw => normalizeTrack({...raw, provider:'machhar'})).filter(Boolean);
            } catch (_) { return []; }
        }
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
        const payload = await requestSaavn(`search/${kind}?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, null, 15000);
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
        const payload = await requestSaavn(`search?query=${encodeURIComponent(q)}`, null, 16000);
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
        // The documented profile endpoint is GET /artists?id=... (or ?link=...), not /artists/{id}.
        const lookup=isLink?`link=${encodeURIComponent(reference)}`:`id=${encodeURIComponent(reference)}`;
        const payload=await requestSaavn(`artists?${lookup}&${query}`,null,18000);
        let raw=unwrapData(payload);if(Array.isArray(raw))raw=raw[0];if(raw?.artist&&typeof raw.artist==='object')raw=raw.artist;
        if(!raw||typeof raw!=='object')throw new Error('Artist details were not returned.');
        const sourceId=String(raw.id||raw.artistId||reference);
        const value={...normalizeEntity('artists',raw),id:`artists:${sourceId}`,sourceId,title:getEntityTitle(raw),image:getEntityImage('artists',raw),description:decodeText(Array.isArray(raw.bio)?raw.bio.map(x=>x?.text||x?.title||'').join(' '):raw.bio||''),tracks:[],albums:(Array.isArray(raw.topAlbums)?raw.topAlbums:[]).map(row=>normalizeEntity('albums',row)).filter(Boolean),artists:(Array.isArray(raw.similarArtists)?raw.similarArtists:[]).map(row=>normalizeEntity('artists',row)).filter(Boolean),totalSongs:Number(raw.songCount||raw.totalSongs||0),totalAlbums:Number(raw.albumCount||raw.totalAlbums||raw.topAlbums?.length||0),raw};
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

        // Some international/foreign artist IDs resolve correctly to profile metadata but the
        // dedicated artist-songs route returns an empty collection. Recover through song search,
        // then retain only rows whose artist ID or normalized artist name matches this profile.
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
        // Return the empty result to the workspace, which keeps page 0 retryable rather than
        // caching an empty catalogue as a successful complete artist page.
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
            if(!allTokens)continue; // e.g. “Happy Birthday” must not retain every unrelated “Happy” song.
            const phrase=title.includes(queryText)?120:all.includes(queryText)?100:0;
            const titleHits=tokens.filter(token=>title.split(/\s+/).includes(token)).length;
            const score=phrase+titleHits*8+(tokens.every(token=>title.split(/\s+/).includes(token))?25:0)+(track.artworkUrl?1:0);
            ranked.push({track,score});
        }
        return ranked.sort((a,b)=>b.score-a.score).map(row=>row.track);
    };
    const search = async (query, options = {}) => {
        const q = String(query || '').trim(); if (!q) return decorateSearchResults([], {query:'',page:0,limit:40,total:0,hasMore:false,provider:'saavn'});
        if (State.playbackSourceMode !== 'online') throw new Error('Switch to streaming playback to search the catalogue.');
        if (!navigator.onLine) throw new Error('You are offline. Reconnect to search the music catalogue.');
        const page = Math.max(0, Number.parseInt(options.page,10) || 0);
        const limit = Math.min(50, Math.max(10, Number.parseInt(options.limit,10) || 40));
        const background = options.background === true;
        const cacheKey = `${q.toLocaleLowerCase()}|${page}|${limit}`;
        const cached = searchCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            if (!background) searchMeta = {...cached.meta};
            return decorateSearchResults(cached.tracks.map(track => onlineTracks.get(track.id) || track), cached.meta);
        }
        let requestId = 0, controller = new AbortController();
        if (!background) {
            latestSearchRequest++; requestId = latestSearchRequest;
            if (activeController) activeController.abort(); activeController = controller;
        }
        const timeout = setTimeout(() => controller.abort(), 16000);
        let payload, rawSongs = [], chosenProvider = 'saavn', resultMeta = null;
        try {
            try {
                payload = await requestSaavn(`search/songs?query=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, controller.signal, 16000);
                rawSongs = extractRawSongs(payload);
                if (!rawSongs.length && page === 0) {
                    // Global catalogue search can include songs when the dedicated search returns an empty collection.
                    const global = await requestSaavn(`search?query=${encodeURIComponent(q)}`, controller.signal, 13000);
                    const globalRows = extractRawSongs(global);
                    if (globalRows.length) { rawSongs = globalRows; payload = global; }
                }
                const info = unwrapData(payload) || payload?.data || {};
                const explicitTotal = Number(info.total ?? info.totalCount ?? info.data?.total ?? payload?.total) || 0;
                const explicitStartValue = info.start ?? info.offset;
                // Some compatible API hosts cap a page at 3–10 items. When start is omitted,
                // infer the returned page stride from the actual response size, not our requested limit.
                const startIndex = explicitStartValue !== undefined && Number.isFinite(Number(explicitStartValue))
                    ? Math.max(0, Number(explicitStartValue))
                    : page * (rawSongs.length || limit);
                const observedEnd = startIndex + rawSongs.length;
                const hasMore = rawSongs.length > 0 && (explicitTotal ? observedEnd < explicitTotal : rawSongs.length >= 3);
                const total = explicitTotal || (hasMore ? Math.max(observedEnd + limit, (page + 1) * limit + 1) : observedEnd);
                resultMeta = {query:q, page, limit, total:Math.max(total, observedEnd), start:startIndex, hasMore, provider:'saavn'};
            } catch (primaryError) {
                if (controller.signal.aborted) throw primaryError;
                // Compatibility fallback; separate metadata avoids corrupting active user-search pagination.
                chosenProvider = 'machhar';
                payload = await requestLegacy(`search?q=${encodeURIComponent(q)}`, controller.signal, 15000);
                rawSongs = extractRawSongs(payload);
                const info = unwrapData(payload) || payload?.data || {};
                const explicitTotal = Number(info.total ?? info.totalCount ?? payload?.total) || 0;
                const startIndex = Number(info.start ?? info.offset ?? 0) || 0;
                const observedEnd = startIndex + rawSongs.length;
                const hasMore = rawSongs.length >= 3 && (!explicitTotal || observedEnd < explicitTotal);
                resultMeta = {query:q, page, limit, total:explicitTotal||observedEnd+(hasMore?limit:0), start:startIndex, hasMore, provider:'machhar'};
            }
            if ((!background && requestId !== latestSearchRequest) || State.playbackSourceMode !== 'online') return decorateSearchResults([], resultMeta || {query:q,page,limit,total:0,hasMore:false,provider:chosenProvider});
            const normalized = rankRelevantSearchTracks(rawSongs.map(raw => normalizeTrack({...raw, provider:raw.provider || chosenProvider})).filter(Boolean),q);
            const meta = resultMeta || {query:q,page,limit,total:normalized.length,hasMore:false,provider:chosenProvider};
            if (!background && requestId === latestSearchRequest) searchMeta = {...meta};
            searchCache.set(cacheKey, {tracks:normalized.slice(), meta:{...meta}, expiresAt:Date.now()+90_000});
            while (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
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
        if (!choices.length) choices = parseStreamChoices(await fetchSongDetails(track));
        // Keep all metadata candidates only for the AAC-only download flow. Playback chooses one
        // highest-quality source, so alternative quality URLs are never opened or preloaded.
        const valid=choices.filter(item=>safeHttpUrl(item.url));
        valid.sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality));
        return options.all ? valid : (valid.length?[valid[0]]:[]);
    };
    const resolveStream = async track => {
        if (!track?.onlineTrackId) return null;
        if (State.playbackSourceMode !== 'online') throw new Error('Streaming playback is turned off.');
        const cached = streamCache.get(track.id);
        if (cached && cached.expiresAt > Date.now()) return cached.url;
        streamCache.delete(track.id);
        if (!navigator.onLine) throw new Error('An internet connection is required for streaming playback.');
        if (activeStreamController) activeStreamController.abort();
        const controller = new AbortController(); activeStreamController = controller;
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
            let choices = await getStreamChoices(track);
            // Playback prefers the highest quality source available. The downloader independently
            // verifies AAC/M4A and never relabels MP3 as AAC.
            choices = choices.filter(item => safeHttpUrl(item.url)).sort((a,b) => qualityNumber(b.quality)-qualityNumber(a.quality));
            let chosen = choices[0];
            if (!chosen && track.provider === 'machhar') {
                const data = await requestLegacy(`stream/${encodeURIComponent(track.onlineTrackId)}`, controller.signal, 15000);
                choices = parseStreamChoices(data).sort((a,b)=>qualityNumber(b.quality)-qualityNumber(a.quality)); chosen = choices[0];
            }
            const originalUrl = safeHttpUrl(chosen?.url);
            const url = proxyMediaUrl(originalUrl);
            if (!url) throw new Error('No playable stream URL was returned by the music service.');
            streamCache.set(track.id, {url, expiresAt:Date.now()+4*60*1000});
            return url;
        } finally { clearTimeout(timer); if (activeStreamController === controller) activeStreamController = null; }
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
        // Warm only the first upcoming track and only its first 256 KiB. The service worker stores
        // the range for reuse when it controls the PWA; plain/local HTTP mode falls back to the
        // backend's normal cacheable 206 response. Never prefetch whole files.
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
                // If a previous resolve was cached before service-worker control, rewrap its safe
                // Render /media URL into the controlled same-origin route for chunk warming.
                if (url.origin === BACKEND_ORIGIN && url.pathname === '/media') {
                    const source = safeHttpUrl(url.searchParams.get('url') || '');
                    if (!source || !isCatalogueMediaHost(new URL(source).hostname)) return false;
                    const local = new URL('__mujic_media__', location.href); local.searchParams.set('src', source); url = local;
                }
                if (url.origin !== location.origin || !url.pathname.endsWith('/__mujic_media__')) return false;
                // Save the exact same same-origin media URL for playback, so the next track hits the
                // cached range instead of accidentally bypassing it with a previously cached Render URL.
                streamCache.set(next.id, {url:url.href, expiresAt:Date.now()+4*60*1000});
                url.searchParams.set('_mujic_prefetch', '1'); fetchCache='no-store'; credentials='same-origin';
            } else if (url.origin !== BACKEND_ORIGIN || url.pathname !== '/media') {
                // Without a controlling service worker only a CORS-enabled, cacheable Render media
                // URL is eligible; raw upstream URLs and unknown hosts are never prefetched.
                return false;
            }
            const response = await fetch(url.href, { method:'GET', headers:{Range:'bytes=0-262143',Accept:'audio/*'}, cache:fetchCache, credentials, signal:controller.signal });
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
        streamCache.clear(); searchCache.clear(); entitySearchCache.clear(); entityDetailsCache.clear();
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
        // Animate the workspace transition without changing either workspace's layout.
        if (document.body?.classList) {
            document.body.classList.add('workspace-switching');
            if (modeAnimationTimer) clearTimeout(modeAnimationTimer);
            modeAnimationTimer = setTimeout(() => document.body?.classList?.remove('workspace-switching'), 340);
        }
        State.playbackSourceMode = next; StorageAdapter.saveSettings(); updateModeUI();
        if (next === 'offline') {
            latestSearchRequest++; if (activeController) activeController.abort();
            if (activeStreamController) activeStreamController.abort();
            stopRemotePlayback();
        }
        if (window.OnlineWorkspace) OnlineWorkspace.onModeChange(next, previous);
        else if (window.UI) UI.switchView(next === 'online' ? 'online-home' : 'home');
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
    return { API_BASE, BACKEND_BASE:LEGACY_BASE, LEGACY_BASE, proxyMediaUrl, isOnlineId, isOnlineTrack, getTrack, registerTrack, normalizeTrack, extractSongs:extractRawSongs, search, searchEntities, globalSearch, getImage, resolveArtistArtwork, isGenericArtistArtwork:imageLooksGeneric, fetchSongsByIdsOrLink, fetchPublicPlaylist, fetchAlbumDetails, fetchArtistDetails, fetchArtistSongs, fetchArtistAlbums, getSearchMeta, searchAndRender, resolveStream, resolveDownloadSource, fetchSongDetails, fetchRelated, fetchTrending, prefetchStreams, invalidateStream, clearCache, renderBlank, updateModeUI, setMode, stopRemotePlayback };
})();
window.OnlineMusic = OnlineMusic;
