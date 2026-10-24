/* Copyright mujic@royverse69 */
        const BACKEND_BASE = `${window.MujicBackend.PRIMARY}/`;

        const LyricsFetcher = {
            cache: new Map(),
            getCachedOnly: async (track) => {
                if (!track) return null;
                if (track.lyrics && String(track.lyrics).trim()) {
                    const embedded = LyricsFetcher.makeData(track.lyrics, LyricsFetcher.isLRC(track.lyrics));
                    if (embedded.isSynced) embedded.parsed = LyricsFetcher.parseLRC(embedded.text);
                    return embedded;
                }
                if (LyricsFetcher.cache.has(track.id)) return LyricsFetcher.cache.get(track.id);
                try { return await StorageAdapter.getLyricsCache(track.id); } catch(e) { return null; }
            },
            fetchWithTimeout: async (url, timeout = 3000, requestOptions = {}) => {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                let timer = null;
                try {
                    const options = { ...(requestOptions || {}) };
                    if (controller) options.signal = controller.signal;
                    const parsedUrl = new URL(url, location.href);
                    const isBackend = window.MujicBackend.isBackendOrigin(parsedUrl.origin);
                    const request = isBackend
                        ? window.MujicBackend.fetchWithWorker(parsedUrl.pathname + parsedUrl.search, options, { timeoutMs: timeout })
                        : fetch(url, options);
                    const timeoutPromise = new Promise((_, reject) => {
                        const parsedUrl = new URL(url, location.href);
                        if (!window.MujicBackend.isBackendOrigin(parsedUrl.origin)) timer = setTimeout(() => {
                            try { if (controller) controller.abort(); } catch (e) { Utils.warn(e); }
                            reject(new Error('Timeout'));
                        }, timeout);
                    });
                    return await Promise.race([request, timeoutPromise]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            },
            normalizeTitle: (value) => String(value || '')
                .toLowerCase()
                .replace(/\([^)]*\)/g, '')
                .replace(/\[[^\]]*\]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .trim(),
            normalizeArtist: (value) => String(value || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim(),
            isLRC: (text) => /\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/.test(String(text || '')),
            makeData: (text, isSynced) => ({ text: String(text || '').trim(), isSynced: !!isSynced }),
            matchesSearchResult: (track, result) => {
                if (!track || !result) return false;
                const wantedTitle = LyricsFetcher.normalizeTitle(track.title);
                const resultTitle = LyricsFetcher.normalizeTitle(result.trackName || result.title || result.name);
                if (!wantedTitle || !resultTitle || wantedTitle !== resultTitle) return false;
                if (track.duration && result.duration) {
                    const diff = Math.abs(Number(track.duration) - Number(result.duration));
                    if (!Number.isFinite(diff) || diff > 3) return false;
                } else if (track.duration && !result.duration) {
                    return false;
                }
                const wantedArtist = LyricsFetcher.normalizeArtist(String(track.artist || '').split(',')[0]);
                const resultArtist = LyricsFetcher.normalizeArtist(result.artistName || result.artist || result.artists);
                return !wantedArtist || !resultArtist || wantedArtist === resultArtist || wantedArtist.includes(resultArtist) || resultArtist.includes(wantedArtist);
            },
            getLyrics: async (track) => {
                if (!track) return { text: 'Lyrics unavailable', isSynced: false, unavailable: true };

                if (track.lyrics && String(track.lyrics).trim()) {
                    const embedded = LyricsFetcher.makeData(track.lyrics, LyricsFetcher.isLRC(track.lyrics));
                    if (embedded.isSynced) embedded.parsed = LyricsFetcher.parseLRC(embedded.text);
                    LyricsFetcher.cache.set(track.id, embedded);
                    StorageAdapter.saveLyricsCache(track.id, embedded).catch(()=>{});
                    return embedded;
                }

                let musicSourceLyrics = null;
                if (track.source === 'machhar-online' && navigator.onLine && window.OnlineLyrics?.fetchFromMusicSource) {
                    try { musicSourceLyrics = await OnlineLyrics.fetchFromMusicSource(track); } catch (_) { musicSourceLyrics = null; }
                    if (musicSourceLyrics?.text) {
                        const authoritative = LyricsFetcher.makeData(musicSourceLyrics.text, musicSourceLyrics.isSynced);
                        if (authoritative.isSynced) authoritative.parsed = LyricsFetcher.parseLRC(authoritative.text);
                        authoritative.source = musicSourceLyrics.source || 'Music catalogue';
                        LyricsFetcher.cache.set(track.id, authoritative);
                        return authoritative;
                    }
                }

                if (LyricsFetcher.cache.has(track.id)) {
                    const cached = LyricsFetcher.cache.get(track.id);
                    if (!(cached?.unavailable && navigator.onLine)) return cached;
                    LyricsFetcher.cache.delete(track.id);
                }
                if (track.source !== 'machhar-online') {
                    try {
                        const stored = await StorageAdapter.getLyricsCache(track.id);
                        if (stored?.text) { LyricsFetcher.cache.set(track.id, stored); return stored; }
                    } catch (e) { Utils.warn(e); }
                }

                let lyricsData = null;
                const lookupTrack = track;
                const cleanTitle = String(lookupTrack.title || '').split('(')[0].trim();
                const cleanArtist = String(lookupTrack.artist || '').split(',')[0].trim();

                if (navigator.onLine) {
                    if (!lyricsData) try {
                        const durParams = lookupTrack.duration ? `&duration=${Math.round(lookupTrack.duration)}` : '';
                        const query = `track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}&album_name=${encodeURIComponent(lookupTrack.album || '')}${durParams}`;
                        const res = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/get?${query}`, 4000);
                        if (res.ok) {
                            const data = await res.json();
                            const exactResult = LyricsFetcher.matchesSearchResult(lookupTrack, data) ? data : null;
                            const candidate = exactResult || (!data.trackName && !data.artistName ? data : null);
                            if (candidate?.syncedLyrics) lyricsData = { text: candidate.syncedLyrics, isSynced: true };
                            else if (candidate?.plainLyrics) lyricsData = { text: candidate.plainLyrics, isSynced: false };
                        }
                    } catch (e) { Utils.warn(e); }

                    if (!lyricsData) {
                        try {
                            const res = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`, 4000);
                            if (res.ok) {
                                const results = await res.json();
                                const match = Array.isArray(results) ? results.find(r => LyricsFetcher.matchesSearchResult(lookupTrack, r)) : null;
                                if (match?.syncedLyrics) lyricsData = { text: match.syncedLyrics, isSynced: true };
                                else if (match?.plainLyrics) lyricsData = { text: match.plainLyrics, isSynced: false };
                            }
                        } catch (e) { Utils.warn(e); }
                    }

                    if (!lyricsData && track.source !== 'machhar-online' && cleanTitle && State.lyricsRenderEnabled !== false) {
                        try {
                            const res = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics?track=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`, 5000);
                            if (res.ok) {
                                const payload = await res.json();
                                const text = payload?.lyrics || payload?.syncedLyrics || payload?.plainLyrics || payload?.text || payload?.data?.lyrics || '';
                                if (text && String(text).trim()) {
                                    const synced = Boolean(payload?.synced || payload?.isSynced || payload?.syncedLyrics) || LyricsFetcher.isLRC(text);
                                    lyricsData = { text: String(text), isSynced: synced };
                                }
                            }
                        } catch (e) { Utils.warn(e); }
                    }
                }

                if(!lyricsData&&navigator.onLine&&cleanTitle&&cleanArtist){
                    const artists=[...new Set([cleanArtist,String(lookupTrack.artist||'').split(/,|&|\bfeat(?:uring)?\.?\b|\bft\.?\b/i)[0].trim()].filter(Boolean))];
                    for(const artistName of artists.slice(0,2)){
                        try{
                            const params=new URLSearchParams({track_name:cleanTitle,artist_name:artistName});
                            const res=await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/ovh?${params.toString()}`,5000);
                            if(!res.ok)continue;
                            const payload=await res.json();
                            const text=payload?.lyrics||payload?.text||payload?.data?.lyrics||'';
                            if(typeof text==='string'&&text.trim()){
                                lyricsData={text:text.trim(),isSynced:LyricsFetcher.isLRC(text),source:'Lyrics.ovh'};
                                break;
                            }
                        }catch(e){Utils.warn(e);}
                    }
                }

                if (!lyricsData && navigator.onLine && State.lyricsPlusEnabled !== false && cleanTitle && cleanArtist) {
                    try { lyricsData = await LyricsFetcher.fetchLyricsPlus(lookupTrack, cleanTitle, cleanArtist); } catch (e) { }
                }

                if (!lyricsData) {
                    lyricsData = { text: navigator.onLine ? 'Lyrics unavailable\n\nNo verified lyrics source matched this track.' : 'Lyrics unavailable offline.', isSynced: false, unavailable: true };
                }

                if (lyricsData.isSynced) lyricsData.parsed = LyricsFetcher.parseLRC(lyricsData.text);
                LyricsFetcher.cache.set(track.id, lyricsData);
                if (!lyricsData.unavailable && lyricsData.text) StorageAdapter.saveLyricsCache(track.id, lyricsData).catch(()=>{});
                return lyricsData;
            },
            fetchLyricsPlus: async (track, cleanTitle, cleanArtist) => {
                const hosts = [`${BACKEND_BASE.replace(/\/$/, '')}/lyricsplus`];
                const params = new URLSearchParams({ title: cleanTitle, artist: cleanArtist, album: track.album || '', duration: String(Number(track.duration) || 0), source: 'apple,musixmatch,spotify,qq' });
                const requestOne = async (host) => {
                    const res = await LyricsFetcher.fetchWithTimeout(`${host}/v2/lyrics/get?${params.toString()}`, 1500);
                    if (!res.ok) throw new Error(`LyricsPlus HTTP ${res.status}`);
                    const payload = await res.json();
                    const entries = Array.isArray(payload?.lyrics) ? payload.lyrics : (Array.isArray(payload?.data?.lyrics) ? payload.data.lyrics : []);
                    if (!entries.length) throw new Error('No lyrics returned');
                    const meta = payload.metadata || payload.meta || {};
                    const responseTitle = meta.title || meta.trackName || meta.songTitle;
                    const responseArtist = meta.artist || meta.artistName || meta.songArtist;
                    if (responseTitle && LyricsFetcher.normalizeTitle(responseTitle) !== LyricsFetcher.normalizeTitle(cleanTitle)) throw new Error('Title mismatch');
                    if (responseArtist) {
                        const a = LyricsFetcher.normalizeArtist(String(responseArtist).split(',')[0]);
                        const b = LyricsFetcher.normalizeArtist(cleanArtist);
                        if (a && b && !(a === b || a.includes(b) || b.includes(a))) throw new Error('Artist mismatch');
                    }
                    const grouped = new Map();
                    entries.forEach((entry, index) => {
                        const text = String(entry.text || entry.words || entry.line || '').trim();
                        if (!text) return;
                        const startRaw = Number(entry.time ?? entry.start ?? entry.startTime ?? 0);
                        if (!Number.isFinite(startRaw)) return;
                        const seconds = startRaw / 1000;
                        const key = entry.element?.key || entry.lineKey || entry.key || `line-${index}`;
                        const group = grouped.get(key) || { time: seconds, parts: [], text: '' };
                        group.time = Math.min(group.time, seconds);
                        if (text !== group.parts[group.parts.length - 1]) group.parts.push(text);
                        grouped.set(key, group);
                    });
                    let lines = [...grouped.values()].sort((a,b)=>a.time-b.time).map(g => {
                        let text = g.parts.join(' ').replace(/\s+/g,' ').trim();
                        text = text.replace(/\s+([,.;!?])/g,'$1');
                        const cs = Math.max(0, Math.floor(g.time * 100));
                        const mm = Math.floor(cs / 6000), ss = Math.floor((cs % 6000) / 100), cc = cs % 100;
                        return text ? `[${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}.${String(cc).padStart(2,'0')}]${text}` : '';
                    }).filter(Boolean);
                    if (!lines.length && typeof payload.lyrics === 'string') {
                        const raw = payload.lyrics;
                        if (LyricsFetcher.isLRC(raw)) return { text: raw, isSynced: true, source: 'LyricsPlus' };
                    }
                    if (!lines.length) throw new Error('LyricsPlus format not recognized');
                    return { text: lines.join('\n'), isSynced: true, source: 'LyricsPlus' };
                };
                try { return await Promise.any(hosts.map(requestOne)); } catch (e) { return null; }
            },
            parseLRC: (lrcText) => {
                const lines = String(lrcText || '').split('\n');
                const result = []; const timeReg = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
                lines.forEach(raw => {
                    let match; let text = raw; let firstTime = null;
                    while ((match = timeReg.exec(raw))) {
                        const min = parseInt(match[1],10), sec = parseInt(match[2],10), msRaw = match[3] || '0';
                        const ms = parseInt(msRaw.padEnd(3,'0'),10);
                        firstTime = min * 60 + sec + ms / 1000;
                    }
                    if (firstTime !== null) {
                        text = raw.replace(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g,'').trim();
                        if (text) result.push({ time:firstTime, text });
                    }
                });
                return result.sort((a,b)=>a.time-b.time);
            }
        };
