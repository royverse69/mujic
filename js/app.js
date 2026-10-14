/* ©royverse69 */
/* Mujic app bootstrap, lifecycle and PWA registration. */
        const App = {
            init: async () => {
                try {
                    UI.init();
                    await StorageAdapter.init(); await StorageAdapter.loadSettings();
                    if (!State.eqPreset) State.eqPreset = State.eq === 'off' ? 'flat' : 'custom';
                    try { if (navigator.storage?.persist) navigator.storage.persist().catch(()=>{}); } catch(e) {}
                    UI.applySettings();
                    
                    State.library = await StorageAdapter.getLibrary(); State.playlists = await StorageAdapter.getPlaylists();
                    const historyPage = await StorageAdapter.getRecentPlayHistory(151);
                    State.playHistory = historyPage.slice(0, 150);
                    State.playHistoryOffset = State.playHistory.length;
                    State.playHistoryHasMore = historyPage.length > 150;
                    Library.sortLibrary();
                    ArtworkCache.warmLibrary(State.library);
                    
                    AudioAdapter.init(); AudioAdapter.applySettings(); UI.updateVolumeUI(); UI.updatePlayerSettingsLabels(); UI.updateVisualizerUI(); UI.updateStatsUI(); UI.renderHome(); AudioAdapter.resizeVisualizer(); UI.updateLibraryStorageStats();
                    
                    UI.renderLibrary(); UI.renderPlaylists();
                    
                    const rb = document.getElementById('repeat-btn'); rb.classList.toggle('active-state', State.repeat > 0);
                    rb.innerHTML = `<span class="material-symbols-rounded">${State.repeat === 2 ? 'repeat_one' : 'repeat'}</span>`;
                    const sb = document.getElementById('shuffle-btn'); sb.classList.toggle('active-state', State.shuffle);
                    
                    if (State.resumePlayback && State.queue.length > 0 && State.currentTrackId) {
                        State.playbackOrder = State.shuffle ? Player._generateShuffle(State.queue, State.currentTrackId) : [...State.queue];
                        const idx = State.playbackOrder.indexOf(State.currentTrackId); State.queueIndex = idx > -1 ? idx : 0;
                        
                        const track = Player.getCurrentTrack();
                        if (track) {
                            UI.showMiniPlayer(); UI.renderQueue();
                            // Keep startup responsive: restore metadata now, leave lyrics retrieval until lyrics mode opens.
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
                    } else { State.queue = []; State.playbackOrder = []; State.currentTrackId = null; State.queueIndex = -1; }
                } catch (e) {
                    console.error("Initialization failed", e); UI.showToast("Database initialization failed.", "error");
                }
            }
        };

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
