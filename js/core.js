/* Copyright mujic@royverse69 */

        const Utils = {
            formatTime: (sec) => {
                if (isNaN(sec) || !isFinite(sec) || sec < 0) return "0:00";
                const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
                return `${m}:${s.toString().padStart(2, '0')}`;
            },
            formatBytes: (bytes) => { const n=Number(bytes)||0; if(n<1024) return `${n} B`; const u=['KB','MB','GB','TB']; let v=n/1024,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v.toFixed(v>=100?0:v>=10?1:2)} ${u[i]}`; },
            getAudioExtension: (name = '') => { const m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : 'audio'; },
            debounce: (fn, wait) => {
                let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn(...args), wait); };
            },
            id: () => (window.crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 11) + Date.now().toString(36)),
            warn: (err) => console.debug('[mujic] ignored error:', err),
            isIOS: () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
            isInstalledApp: () => {
                /* Chromium desktop PWAs may run in window-controls-overlay mode rather than
                   plain standalone mode, so check every installed display-mode variant. */
                const modes = ['standalone', 'window-controls-overlay', 'minimal-ui', 'fullscreen'];
                return modes.some(mode => {
                    try { return !!window.matchMedia?.(`(display-mode: ${mode})`).matches; }
                    catch (_) { return false; }
                }) || navigator.standalone === true;
            },
            escapeHTML: (value) => {
                if (value === null || value === undefined) return '';
                return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            },
            _artCache: new Map(),
            generateDefaultArt: (seedStr) => {
                let hash = 0;
                for (let i = 0; i < (seedStr || '').length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
                const hue = Math.abs(hash % 360);
                if (Utils._artCache.has(hue)) return Utils._artCache.get(hue);
                const background = `hsl(${hue}, 34%, 22%)`;
                const foreground = `hsl(${hue}, 54%, 72%)`;
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${background}"/><circle cx="150" cy="150" r="66" fill="none" stroke="${foreground}" stroke-width="7" opacity=".7"/><path d="M98 180v-7c0-19 15-34 34-34h36c19 0 34 15 34 34v7M128 112a22 22 0 1 0 44 0a22 22 0 1 0-44 0" fill="none" stroke="${foreground}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
                const uri = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
                Utils._artCache.set(hue, uri);
                return uri;
            }
        };

        Utils.defaultArt = Utils.generateDefaultArt('Mujic');
        window.Utils = Utils;

        const State = {
            library: [], playlists: [], history: [], favorites: [], favoriteArtists: [],
            queue: [], playbackOrder: [], queueIndex: -1, currentTrackId: null, playbackSourceMode: 'offline',
            isPlaying: false, currentTime: 0, duration: 0, isFullPlayerOpen: false,
            
            volume: 1, muted: false, playbackRate: 1, eq: 'off', eqPreset: 'flat', eqBands: [0,0,0,0,0], shuffle: false, repeat: 0, 
            
            theme: 'system', accentPreset: 'dynamic', accentColor: '#ffffff', surfaceTheme: 'oled', textScale: 'normal', layoutDensity: 'comfortable', lowEndMode: false, lowEndModeActive: false, performanceProfile: 'auto',
            interfaceStyle: 'subtle', cornerRadius: 'rounded', motion: 'auto', lyricsStyle: 'apple',
            lyricsPosition: 'center', lyricsVerticalOffset: 0, lyricsTimingOffset: 0, lyricsWordByWord: false, lyricsShareEnabled: false, lyricsShareStyle: 'spotify', lyricsFontSize: 'normal', lyricsLineSpacing: 'normal', lyricsWidth: 'standard', lyricsEmphasis: 'soft',
            playerBackground: 'artwork', playerArtworkMode: 'full', visualizerMode:'wave', waveDefaultApplied: true, onboardingSeen: false, installBannerDismissedAt: 0, resumePlayback: false,
            librarySort: 'dateAdded', librarySortDir: 'desc', showArtworkLists: true,
            crossfade: false, skipSilence: false, instantSkipSilence: false, loudnessControl: false,
            loudnessLevel: 'balanced', autoSkipOnError: true, preventDuplicateQueue: false,
            preservePitch: true, varispeed: false, progressiveSeek: false, pauseWhenMuted: false,
            stopOnPageHide: false, waveformStyle: 'wavy', seekStep: 10, keepScreenAwake: false, lyricsPlusEnabled: true, lyricsRenderEnabled: true,
            keyboardShortcutsEnabled: true, keyBindings: {},
            transitionFadePending: false, autoSkipErrorTrackId: null,
            playHistory: [], playHistoryHasMore: false, playHistoryLoading: false, playHistoryOffset: 0,
            
            sleepTimer: { active: false, endTime: null, endOfSong: false, label: 'Off', intervalId: null },
            
            currentContextView: [], currentContextType: null, currentPlaylistId: null, playlistActionTargetId: null, playlistImportTargetId: null, searchResults: [], actionTargetId: null,
            currentLyrics: null, activeLyricIndex: -1, isLyricsMode: false,
            
            playbackRequestId: 0, artworkRequestId: 0, artworkUrls: new Map(), toastTimeout: null,
            dialogResolve: null, previousVolume: 1, lyricsTimeout: null, resumePosition: 0, lastPositionSave: 0,
            playStats: { days: {} }, statsLastAudioTime: null, statsSaveTimer: null,
            deferredInstallPrompt: null
        };

        const ArtworkCache = {
            pending: new Map(), colorCache: new Map(), colorPending: new Map(),
            getUrl: async (trackOrArtId, titleFallback) => {
                const artId = typeof trackOrArtId === 'string' ? trackOrArtId : trackOrArtId?.artworkId;
                const seedStr = titleFallback || (typeof trackOrArtId === 'object' ? trackOrArtId?.title : '');
                if (typeof trackOrArtId === 'object' && trackOrArtId?.source === 'machhar-online' && trackOrArtId.artworkUrl) return trackOrArtId.artworkUrl;
                
                if (!artId) return Utils.generateDefaultArt(seedStr);
                if (State.artworkUrls.has(artId)) return State.artworkUrls.get(artId);
                if (ArtworkCache.pending.has(artId)) return ArtworkCache.pending.get(artId);
                
                const loadPromise = (async () => {
                    try {
                        const blob = await StorageAdapter.getArtwork(artId);
                        if (blob) {
                            const url = URL.createObjectURL(blob); State.artworkUrls.set(artId, url); ArtworkCache.trim(artId); return url;
                        }
                    } catch (e) { Utils.warn(e); }
                    return Utils.generateDefaultArt(seedStr);
                })();
                ArtworkCache.pending.set(artId, loadPromise);
                try { return await loadPromise; }
                finally { ArtworkCache.pending.delete(artId); }
            },
            /* Keep the blob-URL map bounded. Oldest entries go first, never the one just created or the current track's,
               and revocation is delayed so an <img> that is still mounting does not lose its source. */
            maxEntries: 400,
            trim: (keepId) => {
                const map = State.artworkUrls;
                if (map.size <= ArtworkCache.maxEntries) return;
                const current = (() => { try { return Player.getCurrentTrack()?.artworkId; } catch (_) { return null; } })();
                for (const [id, url] of map) {
                    if (map.size <= ArtworkCache.maxEntries - 50) break;
                    if (id === keepId || id === current) continue;
                    map.delete(id); ArtworkCache.colorCache.delete(id);
                    setTimeout(() => URL.revokeObjectURL(url), 10000);
                }
            },
            getAverageColor: async (track) => {
                const online = !!(track && track.source === 'machhar-online' && (track.artworkMediumUrl || track.artworkUrl));
                if (!track || (!track.artworkId && !online)) return null;
                const key = track.artworkId || ('online:' + track.id);
                if (ArtworkCache.colorCache.has(key)) return ArtworkCache.colorCache.get(key);
                if (ArtworkCache.colorPending.has(key)) return ArtworkCache.colorPending.get(key);
                const work = (async () => {
                    const url = online ? (track.artworkMediumUrl || track.artworkUrl) : await ArtworkCache.getUrl(track);
                    return await new Promise(resolve => {
                        const img = new Image(); img.decoding = 'async'; img.crossOrigin = 'Anonymous';
                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently:true });
                                canvas.width = 1; canvas.height = 1; ctx.drawImage(img, 0, 0, 1, 1);
                                const [r,g,b] = ctx.getImageData(0, 0, 1, 1).data;
                                const brightness = Math.round((r*299 + g*587 + b*114) / 1000);
                                resolve(brightness < 40 ? `rgb(${Math.min(r+40,255)}, ${Math.min(g+40,255)}, ${Math.min(b+40,255)})` : `rgb(${r},${g},${b})`);
                            } catch(e) { resolve(null); }
                        };
                        img.onerror = () => resolve(null); img.src = url;
                    });
                })();
                ArtworkCache.colorPending.set(key, work);
                try { const color = await work; if (color) { ArtworkCache.colorCache.set(key, color); if (ArtworkCache.colorCache.size > 600) ArtworkCache.colorCache.delete(ArtworkCache.colorCache.keys().next().value); } return color; }
                finally { ArtworkCache.colorPending.delete(key); }
            },
            clearAll: () => { State.artworkUrls.forEach(url => URL.revokeObjectURL(url)); State.artworkUrls.clear(); ArtworkCache.pending.clear(); ArtworkCache.colorCache.clear(); ArtworkCache.colorPending.clear(); },
            warmLibrary: (tracks) => { const items=(tracks||[]).filter(t=>t.artworkId); let i=0; const low=!!(State.lowEndModeActive||State.lowEndMode); const batchSize=low?3:8; const pump=()=>{const b=items.slice(i,i+batchSize);i+=b.length;b.forEach(t=>ArtworkCache.getUrl(t).catch(()=>{}));if(i<items.length)(window.requestIdleCallback||((cb)=>setTimeout(cb,low?220:80)))(pump);}; (window.requestIdleCallback||((cb)=>setTimeout(cb,low?220:80)))(pump); }
        };
