/* Copyright mujic@royverse69 */
        const BACKEND_BASE = `${window.MujicBackend.PRIMARY}/`;

        const LyricsFetcher = {
            cache: new Map(),
            embeddedData: (track) => {
                if (!track) return null;
                const raw = track.raw || {};
                const candidates = [
                    track.syncedLyrics, raw.syncedLyrics, raw.more_info?.syncedLyrics,
                    track.lyrics, track.plainLyrics, raw.plainLyrics, raw.lyrics,
                    raw.more_info?.plainLyrics, raw.more_info?.lyrics
                ].map(value => String(value || '').trim()).filter(Boolean);
                if (!candidates.length) return null;
                const timed = candidates.find(value => LyricsFetcher.isLRC(value));
                const text = timed || candidates[0];
                const data = LyricsFetcher.makeData(text, !!timed);
                data.source = timed ? 'Embedded synced lyrics' : 'Embedded lyrics';
                if (data.isSynced) data.parsed = LyricsFetcher.parseLRC(data.text);
                return data;
            },
            getCachedOnly: async (track) => {
                if (!track) return null;
                const embedded = LyricsFetcher.embeddedData(track);
                if (embedded) return embedded;
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
                        ? window.MujicBackend.fetchWithFallback(parsedUrl.pathname + parsedUrl.search, options, { timeoutMs: timeout })
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
                const commit = (value, persist = true) => {
                    const text = String(value?.text || '').trim();
                    if (!text) return null;
                    const data = { ...value, text, isSynced: LyricsFetcher.isLRC(text) };
                    if (data.isSynced) data.parsed = LyricsFetcher.parseLRC(data.text);
                    LyricsFetcher.cache.set(track.id, data);
                    if (persist && !data.unavailable) StorageAdapter.saveLyricsCache(track.id, data).catch(() => {});
                    return data;
                };
                let plainFallback = null;
                const rememberPlain = (value, source) => {
                    const text = String(value?.text || '').trim();
                    if (!text) return;
                    if (LyricsFetcher.isLRC(text)) return;
                    if (!plainFallback) plainFallback = { text, isSynced: false, source: value?.source || source || 'Lyrics source' };
                };
                const embedded = LyricsFetcher.embeddedData(track);
                if (embedded?.isSynced) return commit(embedded);
                if (embedded?.text) rememberPlain(embedded, embedded.source);

                const memory = LyricsFetcher.cache.get(track.id);
                if (memory?.text && memory.isSynced && LyricsFetcher.isLRC(memory.text)) return commit(memory);
                if (memory?.text && !memory.unavailable) rememberPlain(memory, memory.source || 'Cached lyrics');
                if (memory?.unavailable && navigator.onLine) LyricsFetcher.cache.delete(track.id);

                if (track.source !== 'machhar-online') {
                    try {
                        const stored = await StorageAdapter.getLyricsCache(track.id);
                        if (stored?.text && LyricsFetcher.isLRC(stored.text)) return commit({ ...stored, isSynced: true });
                        if (stored?.text) rememberPlain(stored, stored.source || 'Saved lyrics');
                    } catch (e) { Utils.warn(e); }
                }

                const lookupTrack = track;
                const cleanTitle = String(lookupTrack.title || '').split('(')[0].trim();
                const cleanArtist = String(lookupTrack.artist || '').split(',')[0].trim();

                if (navigator.onLine && track.source === 'machhar-online' && window.OnlineLyrics?.fetchFromMusicSource) {
                    try {
                        const result = await OnlineLyrics.fetchFromMusicSource(track);
                        if (result?.text) {
                            if (LyricsFetcher.isLRC(result.text)) return commit({ ...result, isSynced: true }, false);
                            rememberPlain(result, result.source || 'Music catalogue');
                        }
                    } catch (_) { }
                }

                if (navigator.onLine && cleanTitle && cleanArtist) {
                    if (track.source !== 'machhar-online') {
                        try {
                            const duration = lookupTrack.duration ? `&duration=${Math.round(lookupTrack.duration)}` : '';
                            const query = `track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}&album_name=${encodeURIComponent(lookupTrack.album || '')}${duration}`;
                            const response = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/get?${query}`, 4000);
                            if (response.ok) {
                                const item = await response.json();
                                const matches = LyricsFetcher.matchesSearchResult(lookupTrack, item) || (!item.trackName && !item.artistName);
                                if (matches) {
                                    const timed = String(item.syncedLyrics || '').trim();
                                    if (LyricsFetcher.isLRC(timed)) return commit({ text: timed, source: 'LRCLIB' });
                                    rememberPlain({ text: item.plainLyrics || item.syncedLyrics || '', source: 'LRCLIB' });
                                }
                            }
                        } catch (e) { Utils.warn(e); }

                        try {
                            const response = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/search?q=${encodeURIComponent(cleanTitle + ' ' + cleanArtist)}`, 4000);
                            if (response.ok) {
                                const payload = await response.json();
                                const results = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
                                const matches = results.filter(item => LyricsFetcher.matchesSearchResult(lookupTrack, item));
                                const timed = matches.find(item => LyricsFetcher.isLRC(item.syncedLyrics || item.lyrics || ''));
                                if (timed) return commit({ text: timed.syncedLyrics || timed.lyrics, source: 'LRCLIB' });
                                const plain = matches.find(item => item.plainLyrics || item.syncedLyrics || item.lyrics);
                                if (plain) rememberPlain({ text: plain.plainLyrics || plain.syncedLyrics || plain.lyrics, source: 'LRCLIB' });
                            }
                        } catch (e) { Utils.warn(e); }

                        if (State.lyricsRenderEnabled !== false) {
                            try {
                                const response = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics?track=${encodeURIComponent(cleanTitle)}&artist=${encodeURIComponent(cleanArtist)}`, 5000);
                                if (response.ok) {
                                    const payload = await response.json();
                                    const text = payload?.syncedLyrics || payload?.data?.syncedLyrics || payload?.lyrics || payload?.plainLyrics || payload?.text || payload?.data?.lyrics || '';
                                    if (LyricsFetcher.isLRC(text)) return commit({ text, source: payload?.source || 'Lyrics service' });
                                    rememberPlain({ text, source: payload?.source || 'Lyrics service' });
                                }
                            } catch (e) { Utils.warn(e); }
                        }
                    }

                    const artists = [...new Set([cleanArtist, String(lookupTrack.artist || '').split(/,|&|\bfeat(?:uring)?\.?|\bft\.?/i)[0].trim()].filter(Boolean))];
                    for (const artistName of artists.slice(0, 2)) {
                        try {
                            const params = new URLSearchParams({ track_name: cleanTitle, artist_name: artistName });
                            const response = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/ovh?${params.toString()}`, 5000);
                            if (!response.ok) continue;
                            const payload = await response.json();
                            const text = payload?.lyrics || payload?.text || payload?.data?.lyrics || '';
                            if (LyricsFetcher.isLRC(text)) return commit({ text, source: 'Lyrics.ovh' });
                            rememberPlain({ text, source: 'Lyrics.ovh' });
                        } catch (e) { Utils.warn(e); }
                    }

                    if (State.lyricsPlusEnabled !== false) {
                        try {
                            const result = await LyricsFetcher.fetchLyricsPlus(lookupTrack, cleanTitle, cleanArtist);
                            if (result?.text && LyricsFetcher.isLRC(result.text)) return commit(result);
                            rememberPlain(result, result?.source || 'LyricsPlus');
                        } catch (_) { }
                    }
                }

                if (plainFallback) return commit(plainFallback);
                return commit({ text: navigator.onLine ? 'Lyrics unavailable\n\nNo verified lyrics source matched this track.' : 'Lyrics unavailable offline.', isSynced: false, unavailable: true }, false);
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
                        const rawUnit = String(entry.unit || entry.timeUnit || payload.timeUnit || '').toLowerCase();
                        const duration = Number(track.duration) || 0;
                        const isMilliseconds = /ms|millisecond/.test(rawUnit) || (duration > 0 ? startRaw > duration * 1.5 : startRaw > 600);
                        const seconds = isMilliseconds ? startRaw / 1000 : startRaw;
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
            retryLookup: async (track) => {
                if (!track || !navigator.onLine) return null;
                if (track.source === 'machhar-online' && window.OnlineLyrics?.retryLrclib) {
                    const onlineResult = await window.OnlineLyrics.retryLrclib(track);
                    if (onlineResult?.text) {
                        const data = LyricsFetcher.makeData(onlineResult.text, LyricsFetcher.isLRC(onlineResult.text));
                        data.source = onlineResult.source || 'LRCLIB';
                        if (data.isSynced) data.parsed = LyricsFetcher.parseLRC(data.text);
                        LyricsFetcher.cache.set(track.id, data);
                        StorageAdapter.saveLyricsCache(track.id, data).catch(()=>{});
                        return data;
                    }
                    return null;
                }
                const title = String(track.title || '').split('(')[0].trim();
                const artist = String(track.artist || '').split(',')[0].trim();
                if (!title || !artist) return null;
                const params = new URLSearchParams({track_name:title,artist_name:artist});
                if (track.album) params.set('album_name',String(track.album));
                if (Number(track.duration)>0) params.set('duration',String(Math.round(Number(track.duration))));
                try {
                    const response = await LyricsFetcher.fetchWithTimeout(`${BACKEND_BASE}lyrics/get?${params.toString()}`,3000, {headers:{Accept:'application/json'}});
                    if (!response.ok) return null;
                    const item = await response.json();
                    if (!LyricsFetcher.matchesSearchResult(track,item)) return null;
                    const text = String(item.syncedLyrics || item.plainLyrics || '').trim();
                    if (!text) return null;
                    const data = LyricsFetcher.makeData(text, LyricsFetcher.isLRC(text));
                    data.source = 'LRCLIB';
                    if (data.isSynced) data.parsed = LyricsFetcher.parseLRC(data.text);
                    LyricsFetcher.cache.set(track.id,data);
                    StorageAdapter.saveLyricsCache(track.id,data).catch(()=>{});
                    return data;
                } catch (_) { return null; }
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
