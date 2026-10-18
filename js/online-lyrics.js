/* Copyright mujic@royverse69 */
(() => {
    const LEGACY_BACKEND = 'https://gaana-suno-varna-machhar-aajayega.onrender.com/';
    const decode = value => {
        const el = document.createElement('textarea'); el.innerHTML = String(value || ''); return el.value.trim();
    };
    const norm = value => {
        const input = String(value || '');
        const base = window.OnlineRecommendations?.cleanTitle ? window.OnlineRecommendations.cleanTitle(input) : input.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        return base.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    };
    const hasText = payload => {
        const value = payload?.lyrics || payload?.syncedLyrics || payload?.plainLyrics || payload?.text || payload?.data?.lyrics || payload?.data?.syncedLyrics || payload?.data?.plainLyrics;
        const text = typeof value === 'string' ? decode(value) : (value?.text || value?.lyrics || '');
        if (!String(text).trim()) return null;
        const meta = payload?.metadata || payload?.meta || payload?.track || payload?.data?.metadata || {};
        const title = meta.title || meta.trackName || meta.name;
        const artist = meta.artist || meta.artistName || meta.singers;
        return { text: String(text).trim(), title, artist, synced: Boolean(payload?.synced || payload?.isSynced || payload?.syncedLyrics || value?.isSynced) || /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/.test(String(text)) };
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
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit', signal: controller.signal });
            if (!response.ok) return null;
            const body = await response.text();
            try { return JSON.parse(body); } catch (_) { return { lyrics: body }; }
        } finally { clearTimeout(timeout); }
    };
    const fetchFromMusicSource = async track => {
        if (!track || track.source !== 'machhar-online' || !navigator.onLine) return null;
        const embedded = hasText(track.raw || track);
        if (embedded && metadataMatches(embedded, track)) return { text: embedded.text, isSynced: embedded.synced, source: 'Music catalogue' };

        if (track.provider !== 'machhar' && window.OnlineMusic?.fetchSongDetails) {
            try {
                const details = await OnlineMusic.fetchSongDetails(track);
                const result = hasText(details);
                if (result && metadataMatches(result, track)) return { text: result.text, isSynced: result.synced, source: 'Music catalogue' };
            } catch (_) { }
        }

        if (track.provider === 'machhar') {
            const title = String(track.title || '').split('(')[0].trim();
            const artist = String(track.artist || '').split(',')[0].trim();
            if (!title) return null;
            try {
                const payload = await fetchJson(`${LEGACY_BACKEND}lyrics?track=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
                const result = hasText(payload);
                if (result && metadataMatches(result, track)) return { text: result.text, isSynced: result.synced, source: 'Machhar music source' };
            } catch (_) { }
        }
        return null;
    };
    window.OnlineLyrics = { fetchFromMusicSource };
})();
