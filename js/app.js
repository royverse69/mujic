/* Copyright mujic@royverse69 */
        const App = {
            init: async () => {
                try {
                    UI.init();
                    await StorageAdapter.init(); await StorageAdapter.loadSettings();
                    if (State.playbackSourceMode === 'online') {
                        try { await window.MujicModules?.ensureOnline?.(); window.OnlineWorkspace?.init(); }
                        catch (error) { State.playbackSourceMode = 'offline'; console.warn('Saved streaming workspace could not load; opening local library instead.', error); }
                    }
                    OnlineMusic.updateModeUI();
                    if (!State.eqPreset) State.eqPreset = State.eq === 'off' ? 'flat' : 'custom';
                    try { if (navigator.storage?.persist) navigator.storage.persist().catch(()=>{}); } catch (e) { Utils.warn(e); }
                    UI.applySettings();
                    
                    State.library = await StorageAdapter.getLibrary(); State.playlists = await StorageAdapter.getPlaylists();
                    const historyPage = await StorageAdapter.getRecentPlayHistory(151);
                    State.playHistory = historyPage.slice(0, 150);
                    State.playHistoryOffset = State.playHistory.length;
                    State.playHistoryHasMore = historyPage.length > 150;
                    Library.sortLibrary();
                    try { ArtworkCache.warmLibrary(State.library); } catch (error) { console.warn('Artwork warm-up skipped', error); }
                    
                    AudioAdapter.init(); AudioAdapter.applySettings(); UI.updateVolumeUI(); UI.updatePlayerSettingsLabels(); UI.updateVisualizerUI(); UI.updateStatsUI(); UI.renderHome(); AudioAdapter.resizeVisualizer(); UI.updateLibraryStorageStats();
                    
                    UI.renderLibrary(); UI.renderPlaylists();
                    try { if (window.OnlineWorkspace) OnlineWorkspace.init(); } catch (error) { console.error('Streaming workspace failed to initialise; the rest of the app keeps running.', error); }
                    OnlineMusic.updateModeUI();
                    if (State.playbackSourceMode === 'online') UI.switchView('online-home', true);
                    
                    const rb = document.getElementById('repeat-btn'); rb.classList.toggle('active-state', State.repeat > 0);
                    rb.innerHTML = `<span class="material-symbols-rounded">${State.repeat === 2 ? 'repeat_one' : 'repeat'}</span>`;
                    const sb = document.getElementById('shuffle-btn'); sb.classList.toggle('active-state', State.shuffle);
                    
                    if (State.playbackSourceMode === 'offline' && State.resumePlayback && State.queue.length > 0 && State.currentTrackId) {
                        State.playbackOrder = State.shuffle ? Player._generateShuffle(State.queue, State.currentTrackId) : [...State.queue];
                        const idx = State.playbackOrder.indexOf(State.currentTrackId); State.queueIndex = idx > -1 ? idx : 0;
                        
                        const track = Player.getCurrentTrack();
                        if (track) {
                            UI.showMiniPlayer(); UI.renderQueue();
                            UI.updatePlayerMeta(track).catch(()=>{});
                            const blob = await StorageAdapter.getAudioBlob(track.id);
                            if (blob) {
                                if(AudioAdapter.currentObjectUrl) URL.revokeObjectURL(AudioAdapter.currentObjectUrl);
                                AudioAdapter.currentObjectUrl = URL.createObjectURL(blob); AudioAdapter.audio.src = AudioAdapter.currentObjectUrl;
                                AudioAdapter.audio.addEventListener('loadedmetadata', () => {
                                    if (State.resumePosition > 0 && State.resumePlayback && State.currentTrackId === track.id) {
                                        AudioAdapter.seek(Math.min(State.resumePosition, Math.max(0, AudioAdapter.audio.duration - 0.25)));
                                        State.currentTime = AudioAdapter.audio.currentTime; UI.updateProgress();
                                    }
                                }, { once:true });
                            }
                        }
                    } else if (State.playbackSourceMode === 'offline') {
                        const rememberedOffline=Player.getCurrentTrack();
                        if(rememberedOffline&&State.currentTrackId&&State.queue.length){
                            State.isPlaying=false;UI.showMiniPlayer();UI.updatePlayerMeta(rememberedOffline).catch(()=>{});UI.renderQueue();
                        } else { State.queue = []; State.playbackOrder = []; State.currentTrackId = null; State.queueIndex = -1; }
                    }
                    else { const onlineCurrent=Player.getCurrentTrack(); if(onlineCurrent?.source==='machhar-online') { UI.showMiniPlayer(); UI.updatePlayerMeta(onlineCurrent).catch(()=>{}); } UI.renderQueue(); }
                    const shareParams = new URLSearchParams(location.search);
                    const sharedSongId = shareParams.get('s');
                    const sharedSongTime = Number(shareParams.get('t')) || 0;
                    if (sharedSongId && window.TrackActions) await TrackActions.openSharedSong(sharedSongId, sharedSongTime);
                    // First-run guide + Home install banner. A shared-song link goes straight to the song, so skip the tour then.
                    try { window.Onboarding?.start({ suppressGuide: Boolean(sharedSongId) }); } catch (error) { console.warn('Onboarding failed to start', error); }
                } catch (e) {
                    console.error("Initialization failed", e); UI.showToast("Something went wrong while starting Mujic. Reload if a section looks empty.", "error");
                }
            }
        };

        // One misbehaving promise or listener must never take the player down. Aborted requests (new search,
        // navigation) are expected and silent; everything else is logged for diagnosis.
        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            if (reason?.name === 'AbortError' || /cancel|abort/i.test(String(reason?.message || ''))) { event.preventDefault(); return; }
            console.warn('Unhandled promise rejection', reason);
            event.preventDefault();
        });
        window.addEventListener('error', (event) => {
            if (event.target && event.target !== window) return; // resource load failures are handled where they occur
            console.warn('Uncaught error', event.error || event.message);
        });
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); State.deferredInstallPrompt = e;
            if (document.readyState !== 'loading' && UI.updateInstallUI) UI.updateInstallUI();
        });
        window.addEventListener('resize', () => AudioAdapter.resizeVisualizer());
        window.addEventListener('DOMContentLoaded', async () => { await App.init(); setTimeout(() => UI.checkForUpdates(false), 1800); });

        if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./sw.js').catch(err => console.warn('PWA service worker registration failed', err));
            });
        }
