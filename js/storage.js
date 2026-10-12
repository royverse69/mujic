/* Mujic backend: IndexedDB access, settings persistence, and statistics. */
        const StorageAdapter = {
            db: null,
            init: () => {
                return new Promise((resolve, reject) => {
                    const req = indexedDB.open('MujicDB', 6);
                    req.onerror = (e) => reject(e);
                    req.onsuccess = (e) => { StorageAdapter.db = e.target.result; resolve(); };
                    req.onupgradeneeded = (e) => {
                        const db = e.target.result;
                        if(!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
                        if(!db.objectStoreNames.contains('audioBlobs')) db.createObjectStore('audioBlobs'); 
                        if(!db.objectStoreNames.contains('artworks')) db.createObjectStore('artworks'); 
                        if(!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
                        if(!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
                        if(!db.objectStoreNames.contains('lyricsCache')) db.createObjectStore('lyricsCache');
                        if(!db.objectStoreNames.contains('playHistory')) db.createObjectStore('playHistory', { keyPath: 'entryId', autoIncrement: true });
                    };
                });
            },
            _put: (storeName, val, key) => new Promise(r => {
                if(!StorageAdapter.db) return r();
                const tx = StorageAdapter.db.transaction(storeName, 'readwrite');
                const req = key ? tx.objectStore(storeName).put(val, key) : tx.objectStore(storeName).put(val);
                req.onsuccess = () => r(req.result); req.onerror = () => r(null);
            }),
            _get: (storeName, key) => new Promise(r => {
                if(!StorageAdapter.db) return r(null);
                const req = StorageAdapter.db.transaction(storeName).objectStore(storeName).get(key);
                req.onsuccess = () => r(req.result); req.onerror = () => r(null);
            }),
            _delete: (storeName, key) => new Promise(r => {
                if(!StorageAdapter.db) return r();
                const req = StorageAdapter.db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
                req.onsuccess = () => r();
            }),
            _getAll: (storeName) => new Promise(r => {
                if(!StorageAdapter.db) return r([]);
                const req = StorageAdapter.db.transaction(storeName).objectStore(storeName).getAll();
                req.onsuccess = () => r(req.result || []);
            }),
            
            saveTrackMeta: (t) => StorageAdapter._put('tracks', t),
            deleteTrack: async (id) => { await StorageAdapter._delete('tracks', id); await StorageAdapter._delete('audioBlobs', id); },
            getLibrary: () => StorageAdapter._getAll('tracks'),
            saveAudioBlob: (id, file) => StorageAdapter._put('audioBlobs', file, id),
            getAudioBlob: (id) => StorageAdapter._get('audioBlobs', id),
            saveArtwork: (artId, blob) => StorageAdapter._put('artworks', blob, artId),
            getArtwork: (artId) => StorageAdapter._get('artworks', artId),
            saveLyricsCache: (trackId, data) => StorageAdapter._put('lyricsCache', data, trackId),
            getLyricsCache: (trackId) => StorageAdapter._get('lyricsCache', trackId),
            recordPlayHistory: async (track) => {
                if (!track || !StorageAdapter.db) return null;
                const entry = { trackId: track.id || null, title: String(track.title || 'Unknown Title'), artist: String(track.artist || 'Unknown Artist'), album: String(track.album || ''), playedAt: Date.now() };
                try { const entryId = await StorageAdapter._put('playHistory', entry); return entryId == null ? null : { ...entry, entryId }; } catch (e) { console.warn('Unable to persist play history', e); return null; }
            },
            getRecentPlayHistory: (limit = 150, offset = 0) => new Promise(resolve => {
                if (!StorageAdapter.db || !StorageAdapter.db.objectStoreNames.contains('playHistory')) return resolve([]);
                const list = []; let request; let skipped = 0;
                try { request = StorageAdapter.db.transaction('playHistory').objectStore('playHistory').openCursor(null, 'prev'); }
                catch (e) { return resolve([]); }
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (!cursor) return resolve(list);
                    if (skipped < Math.max(0, Number(offset) || 0)) { skipped++; cursor.continue(); return; }
                    if (list.length >= limit) return resolve(list);
                    list.push(cursor.value); cursor.continue();
                };
                request.onerror = () => resolve(list);
            }),
            getAllPlayHistory: () => StorageAdapter._getAll('playHistory'),
            getArtworkBytes: async () => { const arts=await StorageAdapter._getAll('artworks'); return arts.reduce((n,b)=>n+(b?.size||0),0); },
            getBinaryStorageBytes: async () => {
                const sumStore = (storeName) => new Promise(resolve => {
                    if (!StorageAdapter.db) return resolve(0);
                    let total = 0; const req = StorageAdapter.db.transaction(storeName).objectStore(storeName).openCursor();
                    req.onsuccess = () => { const c=req.result; if(!c) return resolve(total); const v=c.value; total += Number(v?.size)||0; c.continue(); };
                    req.onerror = () => resolve(total);
                });
                const [audio, art] = await Promise.all([sumStore('audioBlobs'), sumStore('artworks')]); return audio + art;
            },
            
            saveSettings: () => {
                const s = { 
                    favorites: State.favorites, favoriteArtists: State.favoriteArtists, history: State.history, queue: State.queue, 
                    currentTrackId: State.currentTrackId, volume: State.volume, muted: State.muted, repeat: State.repeat, shuffle: State.shuffle, 
                    rate: State.playbackRate, eq: State.eq, eqPreset: State.eqPreset, eqBands: State.eqBands, theme: State.theme, accentPreset: State.accentPreset, accentColor: State.accentColor, surfaceTheme: State.surfaceTheme, textScale: State.textScale, layoutDensity: State.layoutDensity, lowEndMode: State.lowEndMode, performanceProfile: State.performanceProfile, aiSongIdentification: State.aiSongIdentification, geminiApiKeys: (Array.isArray(State.geminiApiKeys) ? State.geminiApiKeys : []).map(k => String(k || '').trim()).filter(Boolean).slice(0,4), geminiNextKeyIndex: Number(State.geminiNextKeyIndex) || 0,
                    interfaceStyle: State.interfaceStyle, cornerRadius: State.cornerRadius, motion: State.motion, lyricsStyle: State.lyricsStyle,
                    lyricsPosition: State.lyricsPosition, lyricsVerticalOffset: State.lyricsVerticalOffset, lyricsFontSize: State.lyricsFontSize, lyricsLineSpacing: State.lyricsLineSpacing, lyricsWidth: State.lyricsWidth, lyricsEmphasis: State.lyricsEmphasis,
                    playerBackground: State.playerBackground, playerArtworkMode: State.playerArtworkMode, visualizerMode: State.visualizerMode,
                    resumePlayback: State.resumePlayback, resumePosition: State.resumePosition, librarySort: State.librarySort, librarySortDir: State.librarySortDir,
                    showArtworkLists: State.showArtworkLists, playStats: State.playStats,
                    crossfade: State.crossfade, skipSilence: State.skipSilence, instantSkipSilence: State.instantSkipSilence,
                    loudnessControl: State.loudnessControl, loudnessLevel: State.loudnessLevel,
                    autoSkipOnError: State.autoSkipOnError, preventDuplicateQueue: State.preventDuplicateQueue,
                    preservePitch: State.preservePitch, varispeed: State.varispeed, progressiveSeek: State.progressiveSeek,
                    pauseWhenMuted: State.pauseWhenMuted, stopOnPageHide: State.stopOnPageHide, waveformStyle: State.waveformStyle,
                    seekStep: State.seekStep, keepScreenAwake: State.keepScreenAwake, lyricsPlusEnabled: State.lyricsPlusEnabled
                };
                return StorageAdapter._put('settings', s, 'app_state');
            },
            loadSettings: async () => {
                const s = await StorageAdapter._get('settings', 'app_state');
                if(s) {
                    State.favorites = s.favorites || []; State.favoriteArtists = s.favoriteArtists || []; State.history = s.history || [];
                    State.queue = s.queue || []; State.currentTrackId = s.currentTrackId || null;
                    if(s.volume !== undefined) State.volume = s.volume; if(s.muted !== undefined) State.muted = s.muted;
                    if(s.repeat !== undefined) State.repeat = s.repeat; if(s.shuffle !== undefined) State.shuffle = s.shuffle;
                    if(s.rate !== undefined) State.playbackRate = s.rate;
                    if (Array.isArray(s.eqBands) && s.eqBands.length === 5) State.eqBands = s.eqBands.map(v => Math.max(-12, Math.min(12, Number(v) || 0)));
                    if(s.eq !== undefined) State.eq = s.eq;
                    else State.eq = 'off';
                    if(s.eqPreset !== undefined) State.eqPreset = s.eqPreset;
                    else State.eqPreset = (State.eq === 'off' ? 'flat' : 'custom');
                    if (!Array.isArray(s.eqBands)) {
                        const legacy = {off:[0,0,0,0,0], low:[3,0,0,0,0], med:[6,1,0,0,0], high:[9,2,0,0,0]};
                        State.eqBands = legacy[State.eq] || [0,0,0,0,0];
                    }
                    
                    if(s.theme !== undefined) State.theme = s.theme; if(s.accentPreset !== undefined) State.accentPreset = s.accentPreset; if(s.lowEndMode !== undefined) State.lowEndMode = !!s.lowEndMode; if(s.performanceProfile !== undefined && ['auto','low-end','full'].includes(s.performanceProfile)) State.performanceProfile = s.performanceProfile; if(s.aiSongIdentification !== undefined) State.aiSongIdentification = !!s.aiSongIdentification; if(Array.isArray(s.geminiApiKeys)) State.geminiApiKeys = [...new Set(s.geminiApiKeys.map(k => String(k || '').trim()).filter(k => k && k.length <= 256))].slice(0,4); if(s.geminiNextKeyIndex !== undefined) State.geminiNextKeyIndex = Math.max(0, Number(s.geminiNextKeyIndex) || 0);
                    if(s.accentColor !== undefined) State.accentColor = s.accentColor; if(s.surfaceTheme !== undefined && ['oled','graphite','midnight','warm','forest'].includes(s.surfaceTheme)) State.surfaceTheme = s.surfaceTheme; if(s.textScale !== undefined && ['compact','normal','large'].includes(s.textScale)) State.textScale=s.textScale; if(s.layoutDensity !== undefined && ['compact','comfortable','spacious'].includes(s.layoutDensity)) State.layoutDensity=s.layoutDensity; if(s.aiSongIdentification !== undefined) State.aiSongIdentification = !!s.aiSongIdentification; if(s.interfaceStyle !== undefined) State.interfaceStyle = s.interfaceStyle;
                    if(s.cornerRadius !== undefined) State.cornerRadius = s.cornerRadius; if(s.motion !== undefined) State.motion = s.motion;
                    if(s.lyricsStyle !== undefined && ['apple','spotify','neon'].includes(s.lyricsStyle)) State.lyricsStyle = s.lyricsStyle;
                    if(s.lyricsPosition !== undefined && ['upper','center','lower'].includes(s.lyricsPosition)) State.lyricsPosition=s.lyricsPosition;
                    if(s.lyricsVerticalOffset !== undefined) State.lyricsVerticalOffset=Math.max(-8,Math.min(8,Number(s.lyricsVerticalOffset)||0));
                    if(s.lyricsFontSize !== undefined && ['compact','normal','large','extra-large'].includes(s.lyricsFontSize)) State.lyricsFontSize=s.lyricsFontSize;
                    if(s.lyricsLineSpacing !== undefined && ['compact','normal','relaxed'].includes(s.lyricsLineSpacing)) State.lyricsLineSpacing=s.lyricsLineSpacing;
                    if(s.lyricsWidth !== undefined && ['narrow','standard','wide'].includes(s.lyricsWidth)) State.lyricsWidth=s.lyricsWidth;
                    if(s.lyricsEmphasis !== undefined && ['soft','standard','strong','off'].includes(s.lyricsEmphasis)) State.lyricsEmphasis=s.lyricsEmphasis;
                    if(s.playerBackground !== undefined) State.playerBackground = s.playerBackground;
                    if(s.playerArtworkMode !== undefined) State.playerArtworkMode = s.playerArtworkMode; if(s.visualizerMode !== undefined) State.visualizerMode = s.visualizerMode;
                    if(State.visualizerMode === 'aurora') State.visualizerMode = 'pulse';
                    if(s.resumePlayback !== undefined) State.resumePlayback = s.resumePlayback;
                    if(s.resumePosition !== undefined) State.resumePosition = Number(s.resumePosition) || 0;
                    if(s.librarySort !== undefined) State.librarySort = s.librarySort; if(s.librarySortDir !== undefined) State.librarySortDir = s.librarySortDir;
                    if(s.showArtworkLists !== undefined) State.showArtworkLists = s.showArtworkLists;
                    if(s.playStats && typeof s.playStats === 'object') State.playStats = s.playStats;
                    if(s.crossfade !== undefined) State.crossfade = !!s.crossfade;
                    if(s.skipSilence !== undefined) State.skipSilence = !!s.skipSilence;
                    if(s.instantSkipSilence !== undefined) State.instantSkipSilence = !!s.instantSkipSilence;
                    if(s.loudnessControl !== undefined) State.loudnessControl = !!s.loudnessControl;
                    if(s.loudnessLevel !== undefined && ['soft','balanced','strong'].includes(s.loudnessLevel)) State.loudnessLevel = s.loudnessLevel;
                    if(s.autoSkipOnError !== undefined) State.autoSkipOnError = !!s.autoSkipOnError;
                    if(s.preventDuplicateQueue !== undefined) State.preventDuplicateQueue = !!s.preventDuplicateQueue;
                    if(s.preservePitch !== undefined) State.preservePitch = !!s.preservePitch;
                    if(s.varispeed !== undefined) State.varispeed = !!s.varispeed; else State.varispeed = s.preservePitch === false;
                    if(s.progressiveSeek !== undefined) State.progressiveSeek = !!s.progressiveSeek;
                    if(s.pauseWhenMuted !== undefined) State.pauseWhenMuted = !!s.pauseWhenMuted;
                    if(s.stopOnPageHide !== undefined) State.stopOnPageHide = !!s.stopOnPageHide;
                    if(s.waveformStyle !== undefined && ['default','wavy','slim','squiggly'].includes(s.waveformStyle)) State.waveformStyle = s.waveformStyle;
                    if(s.seekStep !== undefined) State.seekStep = [5,10,15,30].includes(Number(s.seekStep)) ? Number(s.seekStep) : 10;
                    if(s.keepScreenAwake !== undefined) State.keepScreenAwake = !!s.keepScreenAwake;
                    if(s.lyricsPlusEnabled !== undefined) State.lyricsPlusEnabled = s.lyricsPlusEnabled !== false;
                }
            },
            savePlaylist: (p) => StorageAdapter._put('playlists', p),
            deletePlaylist: (id) => StorageAdapter._delete('playlists', id),
            getPlaylists: async () => {
                const ps = await StorageAdapter._getAll('playlists');
                return ps.sort((a,b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
            },
            clearAll: async () => {
                if(!StorageAdapter.db) return;
                const stores = ['tracks', 'audioBlobs', 'artworks', 'playlists', 'settings', 'lyricsCache', 'playHistory'];
                const tx = StorageAdapter.db.transaction(stores, 'readwrite');
                stores.forEach(s => tx.objectStore(s).clear());
            }
        };

        const Stats = {
            _dayKey: (date = new Date()) => {
                const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            },
            _ensureDay: (key = Stats._dayKey()) => {
                if (!State.playStats || typeof State.playStats !== 'object') State.playStats = { days: {} };
                if (!State.playStats.days || typeof State.playStats.days !== 'object') State.playStats.days = {};
                if (!State.playStats.days[key]) State.playStats.days[key] = { plays: 0, seconds: 0, tracks: {} };
                return State.playStats.days[key];
            },
            _trim: () => {
                const days = State.playStats?.days || {};
                const keys = Object.keys(days).sort();
                while (keys.length > 400) delete days[keys.shift()];
            },
            persist: () => {
                if (State.statsSaveTimer) return;
                State.statsSaveTimer = setTimeout(() => { State.statsSaveTimer = null; StorageAdapter.saveSettings(); }, 10000);
            },
            recordPlay: (track) => {
                if (!track?.id) return;
                const day = Stats._ensureDay();
                day.plays += 1;
                day.tracks[track.id] = (day.tracks[track.id] || 0) + 1;
                State.statsLastAudioTime = Number(AudioAdapter.audio.currentTime) || 0;
                // Preserve the complete listening history; never discard older day totals.
                Stats.persist();
                UI.updateStatsUI();
            },
            consumeAudioDelta: (currentTime) => {
                const now = Number(currentTime);
                const prev = Number(State.statsLastAudioTime);
                State.statsLastAudioTime = Number.isFinite(now) ? now : null;
                if (!State.isPlaying || !Number.isFinite(now) || !Number.isFinite(prev)) return;
                const delta = now - prev;
                if (delta <= 0 || delta > 3) return;
                const day = Stats._ensureDay();
                day.seconds += delta;
                Stats.persist();
            },
            flush: () => {
                if (State.statsSaveTimer) { clearTimeout(State.statsSaveTimer); State.statsSaveTimer = null; }
                if (State.statsLastAudioTime !== null) StorageAdapter.saveSettings();
            },
            _rangeDays: (count) => {
                const out = [];
                const now = new Date();
                for (let i = 0; i < count; i++) { const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() - i); out.push(Stats._dayKey(d)); }
                return out;
            },
            _monthKeys: () => {
                const out=[]; const now=new Date(); const y=now.getFullYear(), m=now.getMonth();
                for(let d=1; d<=new Date(y,m+1,0).getDate(); d++){ const dt=new Date(y,m,d); out.push(Stats._dayKey(dt)); }
                return out;
            },
            summary: () => {
                const days = State.playStats?.days || {};
                const sumKeys = (keys) => {
                    let plays=0, seconds=0; const tracks={};
                    keys.forEach(k => { const x=days[k]; if(!x)return; plays+=Number(x.plays)||0; seconds+=Number(x.seconds)||0; Object.entries(x.tracks||{}).forEach(([id,n]) => tracks[id]=(tracks[id]||0)+(Number(n)||0)); });
                    let topId=null, topCount=0; Object.entries(tracks).forEach(([id,n])=>{if(n>topCount){topId=id;topCount=n;}});
                    return {plays,seconds,topId,topCount};
                };
                const today=Stats._rangeDays(1), week=Stats._rangeDays(7), month=Stats._monthKeys();
                return {today:sumKeys(today), week:sumKeys(week), month:sumKeys(month), all:sumKeys(Object.keys(days))};
            },
            formatMinutes: (seconds) => {
                const mins=Math.round((Number(seconds)||0)/60);
                if(mins<60) return `${mins} min`;
                const h=Math.floor(mins/60), m=mins%60; return `${h}h ${m}m`;
            }
        };
