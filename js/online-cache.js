/* Copyright mujic@royverse69 */
(() => {
    const KEY = 'mujic-online-metadata-v1';
    const artworkWarmed = new Set();
    const sanitize = track => ({
        id: String(track.id || ''), onlineTrackId: String(track.onlineTrackId || ''), provider: track.provider || 'saavn',
        source: 'machhar-online', isOnline: true, title: String(track.title || ''), artist: String(track.artist || ''),
        album: String(track.album || ''), duration: Number(track.duration) || 0, year: String(track.year || ''),
        language: String(track.language || ''), genre: String(track.genre || ''), composer: String(track.composer || ''),
        copyright: String(track.copyright || ''), albumArtist: String(track.albumArtist || ''),
        trackNumber: track.trackNumber || '', isrc: String(track.isrc || ''), artworkUrl: String(track.artworkUrl || ''),
        lyricsId: track.lyricsId || null, hasLyrics: Boolean(track.hasLyrics), fileName: String(track.fileName || `${track.title || 'Track'}.m4a`)
    });
    const MAX_ENTRIES = 200, FLUSH_DELAY_MS = 400;
    let memory = null, flushTimer = 0;
    // Parse localStorage once; every later read/write works on the in-memory map.
    const load = () => {
        if (memory) return memory;
        try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); memory = v && typeof v === 'object' ? v : {}; } catch (_) { memory = {}; }
        return memory;
    };
    const flush = () => {
        window.clearTimeout(flushTimer); flushTimer = 0;
        if (!memory) return;
        try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch (_) { }
    };
    const scheduleFlush = () => { if (!flushTimer) flushTimer = window.setTimeout(flush, FLUSH_DELAY_MS); };
    const writeTracks = tracks => {
        const items = load();
        for (const track of tracks) {
            if (!track?.id || !track?.onlineTrackId) continue;
            delete items[track.id];                 // re-insert so the newest/most recently used entry is last
            items[track.id] = sanitize(track);
        }
        const keys = Object.keys(items);
        for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete items[keys[i]];   // evict least recently used
        scheduleFlush();
    };
    const rememberTrack = track => { if (track?.id && track?.onlineTrackId) writeTracks([track]); };
    const getTrack = id => { const v = load()[String(id)]; return v ? {...v, raw:{}} : null; };
    const warmArtwork = track => {
        const url = track?.artworkUrl;
        if (!url || artworkWarmed.has(url) || typeof Image === 'undefined') return;
        artworkWarmed.add(url);
        const img = new Image(); img.decoding = 'async'; img.loading = 'eager'; img.src = url;
    };
    const warmTracks = tracks => { const list=(Array.isArray(tracks)?tracks.slice(0,24):[]); writeTracks(list); };
    const clear = () => { memory = {}; window.clearTimeout(flushTimer); flushTimer = 0; try { localStorage.removeItem(KEY); } catch (_) {} artworkWarmed.clear(); };
    // Persist any pending batch before the page goes away.
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    window.OnlineCache = { rememberTrack, getTrack, warmArtwork, warmTracks, clear, sanitize };
})();
