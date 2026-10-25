/* Copyright mujic@royverse69 */
(() => {
    const KEY = 'mujic-online-metadata-v2';
    const artworkWarmed = new Set();
    const sanitize = track => ({
        id: String(track.id || ''), onlineTrackId: String(track.onlineTrackId || ''), provider: track.provider || 'saavn',
        source: 'machhar-online', isOnline: true, title: String(track.title || ''), artist: String(track.artist || ''),
        album: String(track.album || ''), duration: Number(track.duration) || 0, year: String(track.year || ''),
        language: String(track.language || ''), genre: String(track.genre || ''), composer: String(track.composer || ''),
        copyright: String(track.copyright || ''), albumArtist: String(track.albumArtist || ''),
        trackNumber: track.trackNumber || '', isrc: String(track.isrc || ''), artworkUrl: window.OnlineMusic?.proxyMediaUrl?.(String(track.artworkUrl || '')) || '',
        lyricsId: track.lyricsId || null, hasLyrics: Boolean(track.hasLyrics), fileName: String(track.fileName || `${track.title || 'Track'}.m4a`)
    });
    const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } };
    const writeTracks = tracks => {
        try {
            const items=read();
            for (const track of tracks) if(track?.id && track?.onlineTrackId) items[track.id]=sanitize(track);
            const entries=Object.entries(items);
            while(entries.length>200){const [oldest]=entries;delete items[oldest];entries.shift();}
            localStorage.setItem(KEY,JSON.stringify(items));
        } catch (_) { }
    };
    const rememberTrack = track => { if(track?.id && track?.onlineTrackId) writeTracks([track]); };
    const getTrack = id => { const v = read()[String(id)]; return v ? {...v, artworkUrl:window.OnlineMusic?.proxyMediaUrl?.(String(v.artworkUrl || '')) || '', raw:{}} : null; };
    const warmArtwork = track => {
        const url = window.OnlineMusic?.proxyMediaUrl?.(track?.artworkUrl || '') || ''; 
        if (!url || artworkWarmed.has(url) || typeof Image === 'undefined') return;
        artworkWarmed.add(url);
        const img = new Image(); img.decoding = 'async'; img.loading = 'eager'; img.src = url;
    };
    const warmTracks = tracks => { const list=(Array.isArray(tracks)?tracks.slice(0,24):[]); writeTracks(list); };
    const clear = () => { try { localStorage.removeItem(KEY); } catch (_) {} artworkWarmed.clear(); };
    window.OnlineCache = { rememberTrack, getTrack, warmArtwork, warmTracks, clear, sanitize };
})();
