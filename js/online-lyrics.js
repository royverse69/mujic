/* Copyright mujic@royverse69 */
(() => {
    const LEGACY_BACKEND = `${window.MujicBackend.PRIMARY}/`;
    const decode = value => {
        const el = document.createElement('textarea'); el.innerHTML = String(value || ''); return el.value.trim();
    };
    const norm = value => {
        const input = String(value || '');
        const base = window.OnlineRecommendations?.cleanTitle ? window.OnlineRecommendations.cleanTitle(input) : input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        return base.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    };
    const isLRC = value => /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/.test(String(value || ''));
    const hasText = payload => {
        const values = [
            payload?.syncedLyrics, payload?.data?.syncedLyrics,
            payload?.more_info?.syncedLyrics, payload?.data?.more_info?.syncedLyrics,
            payload?.lyrics, payload?.data?.lyrics, payload?.more_info?.lyrics, payload?.data?.more_info?.lyrics,
            payload?.plainLyrics, payload?.data?.plainLyrics, payload?.more_info?.plainLyrics, payload?.data?.more_info?.plainLyrics,
            payload?.text
        ].map(value => {
            const text = typeof value === 'string' ? decode(value) : (value?.text || value?.lyrics || '');
            return String(text || '').trim();
        }).filter(Boolean);
        if (!values.length) return null;
        const timed = values.find(isLRC);
        const text = timed || values[0];
        const meta = payload?.metadata || payload?.meta || payload?.track || payload?.data?.metadata || {};
        const title = meta.title || meta.trackName || meta.name;
        const artist = meta.artist || meta.artistName || meta.singers;
        return { text, title, artist, synced: !!timed };
    };
    const metadataMatches = (result, track) => {
        if (!result) return false;
        const title = String(track?.title || '').split('(')[0].trim();
        const artist = String(track?.artist || '').split(',')[0].trim();
        if (result.title && norm(result.title) !== norm(title)) return false;
        if (result.artist) {
            const a = norm(String(result.artist).split(',')[0]); const b = norm(artist);
            if (a && b && a !== b && !a.includes(b) && !b.includes(a)) return false;
        }
        return true;
    };
    const fetchJson = async (url, timeoutMs = 3500) => {
        const controller = new AbortController();
        const parsedForTimeout = new URL(url, location.href);
        const timeout = window.MujicBackend.isBackendOrigin(parsedForTimeout.origin) ? null : setTimeout(() => controller.abort(), timeoutMs);
        try {
            const parsedUrl = new URL(url, location.href);
            const init = { headers: { Accept: 'application/json' }, credentials: 'omit', signal: controller.signal };
            const response = window.MujicBackend.isBackendOrigin(parsedUrl.origin)
                ? await window.MujicBackend.fetchWithFallback(parsedUrl.pathname + parsedUrl.search, init, { timeoutMs })
                : await fetch(url, init);
            if (!response.ok) return null;
            const body = await response.text();
            try { return JSON.parse(body); } catch (_) { return { lyrics: body }; }
        } finally { if (timeout) clearTimeout(timeout); }
    };
    const fetchFromMusicSource = async track => {
        if (!track || track.source !== 'machhar-online' || !navigator.onLine) return null;
        let plainFallback = null;
        const remember = (result, source) => {
            if (!result?.text) return;
            const text = String(result.text).trim();
            if (!text) return;
            if (isLRC(text)) return;
            // Prefer verified provider plain text to a loose embedded string.
            plainFallback = { text, isSynced: false, source: result.source || source || 'Music catalogue' };
        };
        const embedded = hasText(track.raw || track);
        if (embedded && metadataMatches(embedded, track)) {
            if (isLRC(embedded.text)) return { text: embedded.text, isSynced: true, source: 'Music catalogue' };
            remember(embedded, 'Music catalogue');
        }

        if (track.provider !== 'machhar' && window.OnlineMusic?.fetchSongDetails) {
            try {
                const details = await OnlineMusic.fetchSongDetails(track);
                const result = hasText(details);
                if (result && metadataMatches(result, track)) {
                    if (isLRC(result.text)) return { text: result.text, isSynced: true, source: 'Music catalogue' };
                    remember(result, 'Music catalogue');
                }
            } catch (_) { }
        }

        // LRCLIB results can contain both plain and timestamped variants. Always scan
        // matching candidates for LRC first; plain text is retained only as a last resort.
        if (track.title) {
            const cacheKey = `mujic-lrclib:${norm(track.title)}:${norm(track.artist)}`;
            try {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const item = JSON.parse(cached);
                    if (item?.text && metadataMatches(item, track)) {
                        if (isLRC(item.text)) return { ...item, isSynced: true };
                        remember(item, 'LRCLIB');
                    }
                }
            } catch (_) { }
            const title = String(track.title || '').split('(')[0].trim();
            const artist = String(track.artist || '').split(',')[0].trim();
            const duration = Number(track.duration) || 0;
            const params = new URLSearchParams({ track_name:title, artist_name:artist });
            if (track.album) params.set('album_name', String(track.album));
            if (duration > 0) params.set('duration', String(Math.round(duration)));
            try {
                let result = await fetchJson(`${LEGACY_BACKEND}lyrics/get?${params}`, 3200);
                const valid = item => item && (item.syncedLyrics || item.plainLyrics) && metadataMatches({title:item.trackName, artist:item.artistName}, track);
                if (valid(result)) {
                    const timed = String(result.syncedLyrics || '').trim();
                    if (isLRC(timed)) {
                        const lyrics = { text:timed, isSynced:true, source:'LRCLIB' };
                        try { sessionStorage.setItem(cacheKey, JSON.stringify(lyrics)); } catch (_) { }
                        return lyrics;
                    }
                    remember({ text:result.plainLyrics || result.syncedLyrics, source:'LRCLIB' }, 'LRCLIB');
                }
                await new Promise(resolve => setTimeout(resolve, 160));
                const searchParams = new URLSearchParams({ track_name:title, artist_name:artist });
                if (track.album) searchParams.set('album_name', String(track.album));
                const results = await fetchJson(`${LEGACY_BACKEND}lyrics/search?${searchParams}`, 3200);
                const list = Array.isArray(results) ? results : Array.isArray(results?.data) ? results.data : [];
                const matches = list.filter(valid);
                const timedResult = matches.find(item => isLRC(item.syncedLyrics || ''));
                if (timedResult) {
                    const lyrics = { text:String(timedResult.syncedLyrics).trim(), isSynced:true, source:'LRCLIB' };
                    try { sessionStorage.setItem(cacheKey, JSON.stringify(lyrics)); } catch (_) { }
                    return lyrics;
                }
                const plainResult = matches.find(item => item.plainLyrics || item.syncedLyrics);
                if (plainResult) remember({ text:plainResult.plainLyrics || plainResult.syncedLyrics, source:'LRCLIB' }, 'LRCLIB');
                if (plainFallback) {
                    try { sessionStorage.setItem(cacheKey, JSON.stringify(plainFallback)); } catch (_) { }
                }
            } catch (_) { }
        }
        return plainFallback;
    };
    const retryLrclib = async track => {
        if (!track?.title || !navigator.onLine) return null;
        const title = String(track.title || '').split('(')[0].trim();
        const artist = String(track.artist || '').split(',')[0].trim();
        if (!title || !artist) return null;
        const params = new URLSearchParams({track_name:title, artist_name:artist});
        if (track.album) params.set('album_name', String(track.album));
        const duration = Number(track.duration) || 0;
        if (duration > 0) params.set('duration', String(Math.round(duration)));
        const valid = item => item && metadataMatches({title:item.trackName, artist:item.artistName}, track);
        try {
            const result = await fetchJson(`${LEGACY_BACKEND}lyrics/get?${params}`, 3000);
            if (valid(result)) {
                const synced = String(result.syncedLyrics || '').trim();
                if (isLRC(synced)) {
                    const lyrics = {text:synced,isSynced:true,source:'LRCLIB'};
                    try { sessionStorage.setItem(`mujic-lrclib:${norm(title)}:${norm(artist)}`,JSON.stringify(lyrics)); } catch (_) {}
                    return lyrics;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 180));
            const search = new URLSearchParams({track_name:title,artist_name:artist});
            const results = await fetchJson(`${LEGACY_BACKEND}lyrics/search?${search}`, 3000);
            const list = Array.isArray(results) ? results : Array.isArray(results?.data) ? results.data : [];
            const matches = list.filter(valid);
            const timed = matches.find(item => isLRC(item.syncedLyrics || ''));
            if (timed) {
                const lyrics = {text:String(timed.syncedLyrics).trim(),isSynced:true,source:'LRCLIB'};
                try { sessionStorage.setItem(`mujic-lrclib:${norm(title)}:${norm(artist)}`,JSON.stringify(lyrics)); } catch (_) {}
                return lyrics;
            }
            const plain = matches.find(item => item.plainLyrics || item.syncedLyrics);
            const text = String(result?.plainLyrics || (valid(result) ? result.syncedLyrics : '') || plain?.plainLyrics || plain?.syncedLyrics || '').trim();
            if (!text) return null;
            const lyrics = {text,isSynced:false,source:'LRCLIB'};
            try { sessionStorage.setItem(`mujic-lrclib:${norm(title)}:${norm(artist)}`,JSON.stringify(lyrics)); } catch (_) {}
            return lyrics;
        } catch (_) { return null; }
    };
    window.OnlineLyrics = { fetchFromMusicSource, retryLrclib };
})();
