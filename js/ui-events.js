/* Mujic UI module: global event delegation and gestures. Extends the UI object defined in ui.js. */
        Object.assign(UI, {
            setupGlobalDelegation: () => {
                const closePlayerBtn = document.getElementById('close-player-btn');
                if (closePlayerBtn) {
                    let handledPointerUp = false;
                    closePlayerBtn.addEventListener('pointerdown', e => { handledPointerUp=false; e.stopPropagation(); }, {passive:true});
                    closePlayerBtn.addEventListener('pointerup', e => { handledPointerUp=true; e.preventDefault(); e.stopPropagation(); UI.closeFullPlayer(); }, {passive:false});
                    closePlayerBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!handledPointerUp) UI.closeFullPlayer(); handledPointerUp=false; });
                }
                const nav = document.getElementById('bottom-nav');
                if (nav) {
                    const activateNav = (e) => {
                        const item = e.target.closest('.nav-item[data-view]');
                        if (!item) return;
                        const now = Date.now();
                        if (item.dataset.lastNavActivation && now - Number(item.dataset.lastNavActivation) < 350) {
                            // A touch pointerup is followed by a synthetic click on many phones.
                            // Swallow that duplicate instead of letting it reach body delegation.
                            e.preventDefault(); e.stopPropagation(); return;
                        }
                        item.dataset.lastNavActivation = String(now);
                        e.preventDefault(); e.stopPropagation();
                        UI.switchView(item.dataset.view);
                    };
                    nav.addEventListener('click', activateNav, true);
                    nav.addEventListener('pointerup', (e) => {
                        if (e.pointerType === 'touch') activateNav(e);
                    }, true);
                }
                const mini = document.getElementById('mini-player');
                mini?.querySelectorAll('.mini-action').forEach(btn => {
                    ['pointerdown','pointerup','click'].forEach(type => btn.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); }, {passive:false}));
                });
                const miniPlay = mini?.querySelector('[data-action="toggle-play"]');
                const miniNext = mini?.querySelector('[data-action="next-track"]');
                miniPlay?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.togglePlay(); }, true);
                miniNext?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.next(); }, true);
                const miniMore = mini?.querySelector('[data-action="mini-track-options"]');
                miniMore?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const track=Player.getCurrentTrack(); if(track) UI.openTrackOptions(track.id); else UI.showToast('Nothing is playing yet.','info'); }, true);
                mini?.querySelector('.mini-progress-bar')?.addEventListener('click', e => e.stopPropagation());
                mini?.querySelector('.mini-progress-bar')?.addEventListener('pointerdown', e => e.stopPropagation());
                // One long-press controller for playlist cards and Home songs.
                // The press is cancelled by movement, scrolling, wheel, pointer cancel or a
                // second finger, so scrolling can never open a menu. After a long press the
                // trailing click is swallowed so the menu and the item never both fire.
                const LP_MOVE_PX = 8;
                const press = { timer:null, row:null, x:0, y:0, id:null };
                let lastPointerType = 'mouse';
                const cancelPress = () => { if (press.timer) clearTimeout(press.timer); press.timer = null; press.row = null; press.id = null; };
                document.body.addEventListener('pointerdown', (e) => {
                    lastPointerType = e.pointerType || 'mouse';
                    if (press.row && press.id !== null && e.pointerId !== press.id) { cancelPress(); return; }
                    cancelPress();
                    if (e.button > 0 || e.target.closest('button')) return;
                    const plRow = e.target.closest('.playlist-longpress-target[data-key1]');
                    const songRow = plRow ? null : e.target.closest('.home-track-longpress-target[data-id]');
                    const row = plRow || songRow;
                    if (!row || (songRow && e.pointerType === 'mouse')) return;
                    row.dataset.longPressTriggered = '0';
                    press.row = row; press.x = e.clientX; press.y = e.clientY; press.id = e.pointerId;
                    const delay = songRow ? 480 : (e.pointerType === 'mouse' ? 650 : 520);
                    press.timer = setTimeout(() => {
                        if (press.row !== row) return;
                        cancelPress();
                        row.dataset.longPressTriggered = '1';
                        if (navigator.vibrate) navigator.vibrate(18);
                        if (plRow) UI.openPlaylistActions(row.dataset.key1); else UI.openTrackOptions(row.dataset.id);
                    }, delay);
                }, {passive:true});
                document.body.addEventListener('pointermove', (e) => {
                    if (!press.row || e.pointerId !== press.id) return;
                    if (Math.abs(e.clientX - press.x) > LP_MOVE_PX || Math.abs(e.clientY - press.y) > LP_MOVE_PX) cancelPress();
                }, {passive:true});
                ['pointerup','pointercancel','dragstart','wheel','touchmove','blur'].forEach(type => (type === 'blur' ? window : document).addEventListener(type, cancelPress, {passive:true, capture:true}));
                // scroll does not bubble; capture it from any scroller (main content, rails, sheets)
                window.addEventListener('scroll', cancelPress, {passive:true, capture:true});
                document.addEventListener('contextmenu', (e) => {
                    const plRow = e.target.closest('.playlist-longpress-target[data-key1]');
                    const songRow = plRow ? null : e.target.closest('.home-track-longpress-target[data-id]');
                    if (!plRow && !songRow) return;
                    e.preventDefault();
                    // Touch long-press is handled by the timer above; right-click opens the menu on desktop.
                    if (lastPointerType === 'mouse' && !e.target.closest('button')) {
                        const row = plRow || songRow; row.dataset.longPressTriggered = '1';
                        if (plRow) UI.openPlaylistActions(row.dataset.key1); else UI.openTrackOptions(row.dataset.id);
                    }
                });

                document.body.addEventListener('click', async (e) => {
                    try {
                    if (State.suppressNextClickUntil && Date.now() < State.suppressNextClickUntil) { e.preventDefault(); e.stopPropagation(); State.suppressNextClickUntil = 0; return; }
                    const btn = e.target.closest('[data-action]'); if (!btn) return;
                    const action = btn.dataset.action;

                    // Central action dispatcher: the previous build omitted core actions here
                    // (song rows, Settings categories, history, playlist actions and transport).
                    // The UI looked normal, but most taps had no handler. Keep this dispatch
                    // explicit, and isolate failures so one action cannot break future taps.
                    try {
                        switch (action) {
                            case 'switch-view':
                                e.preventDefault(); e.stopPropagation(); UI.switchView(btn.dataset.view); return;
                            case 'set-playback-mode':
                                e.preventDefault(); e.stopPropagation(); await OnlineMusic.setMode(btn.dataset.mode); return;
                            case 'toggle-playback-mode':
                                e.preventDefault(); e.stopPropagation(); await OnlineMusic.setMode(State.playbackSourceMode === 'online' ? 'offline' : 'online'); return;
                            case 'online-library-tab':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.setLibraryTab(btn.dataset.tab || 'playlists'); return;
                            case 'online-open-liked-from-home':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.openLikedFromHome(); return;
                            case 'online-load-artist-albums':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.loadMoreArtistAlbums(); return;
                            case 'online-show-all-artists':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.showAllArtists(); return;
                            case 'online-artists-back':
                                e.preventDefault(); e.stopPropagation(); UI.switchView('online-home'); return;
                            case 'online-sort-artists':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.sortArtists(btn.dataset.sort || 'recommended'); return;
                            case 'online-scroll-rail': {
                                e.preventDefault(); e.stopPropagation();
                                const rail=document.getElementById(btn.dataset.target || '');
                                if(rail)rail.scrollBy({left:(btn.dataset.direction==='left'?-1:1)*Math.max(rail.clientWidth*.72,180),behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth'});
                                return;
                            }
                            case 'online-shift-artist-wall': {
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.shiftHomeArtistWall(btn.dataset.direction || 'right'); return;
                            }
                            case 'retry-online-home':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.refreshActiveView(); return;
                            case 'online-set-search-type': {
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.filterSearchType(btn.dataset.type || 'songs');
                                UI.switchView('online-search');
                                return;
                            }
                            case 'online-browse-playlists': {
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.filterSearchType('playlists');
                                const input=document.getElementById('online-search-input'); if(input) input.value=btn.dataset.query || 'Hindi romantic';
                                UI.switchView('online-search');
                                return;
                            }
                            case 'online-clear-search':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.clearSearch(); return;
                            case 'online-open-entity':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                await OnlineWorkspace.openRemoteEntity(btn.dataset.type,btn.dataset.id); return;
                            case 'online-play-track':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.playTrackFromShelf(btn.dataset.id,btn.dataset.context); UI.switchView('online-queue'); return;
                            case 'online-detail-back':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.backFromDetail(); return;
                            case 'online-play-remote-entity':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.playRemoteEntity(); UI.switchView('online-queue'); return;
                            case 'online-save-remote-playlist':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.saveRemotePlaylist(); return;
                            case 'online-load-remote-more':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.loadMoreRemote(); return;
                            case 'online-more-public-playlists':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.loadPublicPlaylists(undefined,true); return;
                            case 'retry-online-search':
                                e.preventDefault(); e.stopPropagation();
                                if (State.playbackSourceMode === 'online') { const onlineInput=document.getElementById('online-search-input'); if(onlineInput?.value?.trim()) OnlineWorkspace.performSearch(onlineInput.value); else OnlineWorkspace.refreshActiveView(); }
                                else OnlineMusic.searchAndRender(document.getElementById('search-input')?.value || '');
                                return;
                            case 'online-submit-search':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.performSearch(document.getElementById('online-search-input')?.value || ''); return;
                            case 'online-load-more':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.loadMore(); return;
                            case 'online-refresh-search':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.performSearch(document.getElementById('online-search-input')?.value || ''); return;
                            case 'online-search-query': {
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                const input=document.getElementById('online-search-input'); if(input) input.value=btn.dataset.query || '';
                                OnlineWorkspace.filterSearchType('songs');
                                UI.switchView('online-search');
                                return;
                            }
                            case 'online-open-reference': {
                                e.preventDefault(); e.stopPropagation();
                                const reference=await Dialog.show({type:'prompt',title:'Open a music link or ID',message:'Paste a JioSaavn song, artist, album or playlist link, or enter a song ID.',confirmText:'Open',defaultText:''});
                                if(reference)await OnlineWorkspace.openReference(reference);
                                return;
                            }
                            case 'online-create-playlist':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.createPlaylist(); return;
                            case 'online-open-playlist':
                            case 'online-playlist-menu':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.openPlaylist(btn.dataset.id); UI.switchView('online-playlists'); return;
                            case 'online-back-playlists':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.backToPlaylists(); return;
                            case 'online-playlist-play':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.playPlaylist(btn.dataset.id); UI.switchView('online-queue'); return;
                            case 'online-share-to-offline':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.copyOnlinePlaylistToOffline(btn.dataset.id); return;
                            case 'online-rename-playlist':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.renamePlaylist(btn.dataset.id); return;
                            case 'online-delete-playlist':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.deletePlaylist(btn.dataset.id); return;
                            case 'online-clear-history':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.clearHistory(); return;
                            case 'online-queue-play': {
                                e.preventDefault(); e.stopPropagation();
                                if (State.playbackOrder.length) { if(State.queueIndex<0) State.queueIndex=0; Player.playQueueIndex(Math.max(0,State.queueIndex)); }
                                else UI.showToast('Search for a song to start a streaming queue.','info');
                                return;
                            }
                            case 'online-queue-clear':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.clearQueue(); return;
                            case 'toggle-workspaces-link':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.setLinked(!!btn.checked); return;
                            case 'clear-online-cache':
                                e.preventDefault(); e.stopPropagation(); OnlineMusic.clearCache(); UI.showToast('Streaming catalogue cache cleared.','delete'); return;
                            case 'share-offline-playlist-online':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.shareOfflinePlaylistToOnline(State.currentPlaylistId); return;
                            case 'online-create-and-add': {
                                e.preventDefault(); e.stopPropagation();
                                const trackId=OnlineWorkspace.getPendingTrackId();
                                const playlist=await OnlineWorkspace.createPlaylist('',trackId);
                                if(playlist) UI.closeSheets();
                                return;
                            }
                            case 'online-add-to-playlist':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.addTrackToPlaylist(OnlineWorkspace.getPendingTrackId(),btn.dataset.playlistId); UI.closeSheets(); return;
                            case 'open-settings-group':
                                e.preventDefault(); e.stopPropagation(); UI.openSettingsGroup(btn.dataset.group); return;
                            case 'settings-group-back':
                                e.preventDefault(); e.stopPropagation(); UI.backSettingsGroup(); return;
                            case 'switch-tab':
                                e.preventDefault(); e.stopPropagation(); UI.switchLibraryTab(btn.dataset.tab); return;
                            case 'click-file-input': {
                                e.preventDefault(); e.stopPropagation();
                                const fileInput = document.getElementById('file-input');
                                if (fileInput) fileInput.click();
                                return;
                            }
                            case 'show-history':
                                e.preventDefault(); e.stopPropagation(); UI.showHistorySheet(); return;
                            case 'load-older-history':
                                e.preventDefault(); e.stopPropagation(); await UI.loadOlderHistory(); return;
                            case 'open-artist':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('artist', btn.dataset.key1); return;
                            case 'open-album':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('album', btn.dataset.key1, btn.dataset.key2); return;
                            case 'open-playlist': {
                                e.preventDefault(); e.stopPropagation();
                                const plRow = btn.closest('.playlist-longpress-target');
                                if (plRow?.dataset.longPressTriggered === '1') { plRow.dataset.longPressTriggered = '0'; return; }
                                await UI.openContextView('playlist', btn.dataset.key1); return;
                            }
                            case 'open-favorites':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('favorites'); return;
                            case 'play-track': {
                                e.preventDefault(); e.stopPropagation();
                                const row = btn.closest('.home-track-longpress-target');
                                if (row?.dataset.longPressTriggered === '1') { row.dataset.longPressTriggered = '0'; return; }
                                const id = btn.dataset.id;
                                const selectedTrack = Player.getTrackById(id);
                                if (!id || !selectedTrack) { UI.showToast('This track is no longer available. Search again to refresh it.', 'error'); return; }
                                const contextName = btn.dataset.context || 'library';
                                if (selectedTrack.source === 'machhar-online') {
                                    if (State.playbackSourceMode !== 'online') { UI.showToast('Switch to streaming playback to play catalogue tracks.', 'info'); return; }
                                    if (contextName === 'online-search') { OnlineWorkspace.playSearchResult(id); return; }
                                    const matches = OnlineWorkspace.getPlaybackContext(contextName, id);
                                    // Manual selection is intentional: keep all visible search hits and
                                    // user-curated playlist entries, including alternate versions.
                                    // Duplicate/remix suppression is reserved for automatic recommendations.
                                    const sourceList = matches.length > 0 ? matches : [selectedTrack];
                                    const seenIds = new Set();
                                    const list = sourceList.filter(track => {
                                        if (!track?.id || seenIds.has(track.id)) return false;
                                        seenIds.add(track.id); return true;
                                    });
                                    // Start from the exact row the user tapped, then keep the rest of
                                    // the current online search/playlist as the upcoming queue.
                                    const startIndex = Math.max(0, list.findIndex(track => track.id === id));
                                    Player.playContext(list, startIndex);
                                    return;
                                }
                                const contextList = State.library;
                                let list = contextList;
                                if (contextName === 'search') {
                                    const matches = Array.isArray(State.searchResults) ? State.searchResults.filter(track => contextList.some(item => item.id === track.id)) : [];
                                    // A single search hit should not create a one-track dead-end queue.
                                    list = matches.length > 1 ? matches : contextList;
                                } else if ((contextName === 'playlist' || contextName === 'context') && Array.isArray(State.currentContextView) && State.currentContextView.some(track => track.id === id)) {
                                    list = State.currentContextView;
                                }
                                let index = list.findIndex(track => track.id === id);
                                if (index < 0) { list = contextList; index = list.findIndex(track => track.id === id); }
                                if (index >= 0) Player.playContext(list, index);
                                return;
                            }
                            case 'play-context-all':
                                e.preventDefault(); e.stopPropagation(); Player.playContext(State.currentContextView || [], 0); return;
                            case 'shuffle-context-all':
                                e.preventDefault(); e.stopPropagation(); Player.shuffleContext(State.currentContextView || []); return;
                            case 'shuffle-all':
                                e.preventDefault(); e.stopPropagation(); Player.shuffleContext(State.library || []); return;
                            case 'create-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.promptCreate(); return;
                            case 'rename-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.rename(btn.dataset.key1); return;
                            case 'delete-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.delete(btn.dataset.key1); return;
                            case 'move-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.movePlaylist(btn.dataset.key1, btn.dataset.direction); return;
                            case 'open-playlist-from-sheet': {
                                e.preventDefault(); e.stopPropagation();
                                const pid = State.playlistActionTargetId;
                                UI.closeSheets(); if (pid) await UI.openContextView('playlist', pid);
                                return;
                            }
                            case 'rename-playlist-sheet':
                                e.preventDefault(); e.stopPropagation(); await Playlists.rename(State.playlistActionTargetId); UI.closeSheets(); return;
                            case 'delete-playlist-sheet':
                                e.preventDefault(); e.stopPropagation(); await Playlists.delete(State.playlistActionTargetId); UI.closeSheets(); return;
                            case 'import-playlist-songs': {
                                e.preventDefault(); e.stopPropagation();
                                const pid = State.currentContextType === 'playlist' ? State.currentPlaylistId : State.playlistActionTargetId;
                                if (!pid) { UI.showToast('Open a playlist first.', 'info'); return; }
                                UI.openPlaylistTrackPicker(pid);
                                return;
                            }
                            case 'save-playlist-selected-songs':
                                e.preventDefault(); e.stopPropagation(); await UI.savePlaylistTrackPicker(); return;
                            case 'find-music-online': {
                                e.preventDefault(); e.stopPropagation();
                                await OnlineMusic.setMode('online');
                                return;
                            }
                            case 'mini-track-options':
                                e.preventDefault(); e.stopPropagation(); { const track=Player.getCurrentTrack(); if(track) await UI.openTrackOptions(track.id); else UI.showToast('Nothing is playing yet.','info'); } return;
                            case 'track-options':
                                e.preventDefault(); e.stopPropagation(); await UI.openTrackOptions(btn.dataset.id); return;
                            case 'online-download-track':
                                e.preventDefault(); e.stopPropagation();
                                UI.closeSheets();
                                await OnlineDownloader.download(Player.getTrackById(btn.dataset.id || State.actionTargetId) || OnlineMusic.getTrack(btn.dataset.id || State.actionTargetId));
                                return;
                            case 'online-open-track-playlist':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.openPlaylistPicker(btn.dataset.id || State.actionTargetId);
                                return;
                            case 'switch-offline':
                                e.preventDefault(); e.stopPropagation(); await OnlineMusic.setMode('offline'); return;
                            case 'toggle-favorite':
                                e.preventDefault(); e.stopPropagation(); Player.toggleFavorite(); return;
                            case 'toggle-fav-artist': {
                                e.preventDefault(); e.stopPropagation();
                                const artist = btn.dataset.artist || '';
                                State.favoriteArtists ||= [];
                                const idx = State.favoriteArtists.indexOf(artist);
                                if (idx >= 0) State.favoriteArtists.splice(idx, 1); else State.favoriteArtists.push(artist);
                                await StorageAdapter.saveSettings(); UI.renderHome();
                                await UI.openContextView('artist', artist);
                                return;
                            }
                            case 'toggle-shuffle':
                                e.preventDefault(); e.stopPropagation(); Player.toggleShuffle(); return;
                            case 'toggle-repeat':
                                e.preventDefault(); e.stopPropagation(); Player.toggleRepeat(); return;
                            case 'toggle-play':
                                e.preventDefault(); e.stopPropagation(); Player.togglePlay(); return;
                            case 'next-track':
                                e.preventDefault(); e.stopPropagation(); Player.next(); return;
                            case 'prev-track':
                                e.preventDefault(); e.stopPropagation(); Player.previous(); return;
                            case 'toggle-lyrics':
                                e.preventDefault(); e.stopPropagation(); UI.toggleLyricsMode(); return;
                            case 'toggle-immersive-lyrics':
                                e.preventDefault(); e.stopPropagation(); UI.toggleImmersiveLyrics(); return;
                            case 'go-back':
                                e.preventDefault(); e.stopPropagation(); UI.goBack(); return;
                        }
                    } catch (actionError) {
                        console.error(`Mujic action failed: ${action}`, actionError);
                        UI.showToast(`Couldn't complete ${action.replace(/-/g, ' ')}. Please try again.`, 'error');
                        return;
                    }

                    if (['toggle-play', 'next-track', 'prev-track'].includes(action)) e.stopPropagation();
                    
                    if (action === 'toggle-mute') AudioAdapter.toggleMute();
                    else if (action === 'show-sheet') { e.stopPropagation(); UI.showSheet(btn.dataset.target); }
                    else if (action === 'close-sheets') UI.closeSheets();
                    else if (action === 'prompt-output') AudioAdapter.promptOutputDevice();
                    else if (action === 'set-sleep-timer') Player.setSleepTimer(btn.dataset.val);
                    else if (action === 'set-speed') AudioAdapter.setPlaybackRate(btn.dataset.val);
                    else if (action === 'set-eq') AudioAdapter.setEQ(btn.dataset.val);
                    else if (action === 'set-eq-preset') AudioAdapter.setEQPreset(btn.dataset.val);
                    else if (action === 'set-waveform-style') { e.stopPropagation(); AudioAdapter.setWaveformStyle(btn.dataset.val); }
                    else if (action === 'move-queue') { e.stopPropagation(); Player.moveQueue(parseInt(btn.dataset.index), btn.dataset.direction); }
                    else if (action === 'clear-queue') Player.clearQueue();
                    else if (action === 'remove-queue') { e.stopPropagation(); Player.removeFromQueue(parseInt(btn.dataset.index)); }
                    else if (action === 'play-queue-index') { if (e.target.closest('.drag-handle')) return; Player.playQueueIndex(parseInt(btn.dataset.index)); }
                    else if (action === 'remove-from-playlist') { e.stopPropagation(); Playlists.removeTrack(btn.dataset.key1, parseInt(btn.dataset.index)); }
                    else if (action === 'move-playlist-track') { e.stopPropagation(); Playlists.moveTrack(btn.dataset.key1, parseInt(btn.dataset.index), btn.dataset.direction); }
                    else if (action === 'create-and-add') Playlists.promptCreateAndAdd();
                    else if (action === 'add-to-playlist') Playlists.addTrack(btn.dataset.key1);
                    else if (action === 'open-full-player') UI.openFullPlayer();
                    else if (action === 'close-full-player') UI.closeFullPlayer();
                    else if (action === 'install-pwa') { e.stopPropagation(); UI.installPWA(); }
                    else if (action === 'check-lyrics-cache') {
                        e.stopPropagation();
                        const id = btn.dataset.id;
                        const track = State.library.find(x => x.id === id);
                        const cached = track ? await LyricsFetcher.getCachedOnly(track) : null;
                        if (cached?.text) {
                            State.currentLyrics = cached;
                            // Replace an earlier unavailable result before re-rendering the cached lyrics.
                            LyricsFetcher.cache.set(id, cached);
                            if (cached.isSynced && !cached.parsed) cached.parsed = LyricsFetcher.parseLRC(cached.text);
                            UI.loadCurrentLyrics();
                        } else if (!navigator.onLine) {
                            UI.showToast('No saved lyrics cache. Connect to the internet to fetch lyrics.', 'wifi');
                        } else {
                            UI.showToast('No saved lyrics cache for this song.', 'info');
                        }
                    }
                    else if (action === 'export-settings') UI.exportData('settings');
                    else if (action === 'export-stats') UI.exportData('stats');
                    else if (action === 'import-data') { e.preventDefault(); e.stopPropagation(); document.getElementById('data-import-input')?.click(); }
                    else if (action === 'check-updates') { e.preventDefault(); e.stopPropagation(); UI.checkForUpdates(true); }
                    else if (action === 'refresh-changelog') { e.stopPropagation(); UI.loadChangeLog(true); }
                    else if (action === 'reset-appearance') UI.resetAppearance();
                    else if (action === 'open-external') { const target = btn.dataset.url || ''; if (/^https:\/\//.test(target)) window.open(target, '_blank', 'noopener,noreferrer'); }
                    else if (action === 'seek-lyric') { AudioAdapter.seek(parseFloat(btn.dataset.time)); }
                    else if (action === 'clear-library') {
                        const confirmed = await Dialog.show({ type: 'confirm', title: 'Wipe Library', message: 'Are you sure you want to completely wipe all application data? This cannot be undone.', confirmText: 'Wipe Data', destructive: true });
                        if(confirmed) {
                            StorageAdapter.clearAll().then(() => {
                                State.library = []; State.playlists = []; State.history = []; State.favorites = []; State.favoriteArtists = []; State.playStats = { days: {} }; State.statsLastAudioTime = null;
                                State.queue = []; State.playbackOrder = []; State.currentTrackId = null; State.queueIndex = -1;
                                AudioAdapter.pause(); AudioAdapter.audio.removeAttribute('src'); AudioAdapter.audio.load();
                                ArtworkCache.clearAll(); UI.closeFullPlayer(); document.getElementById('mini-player').classList.remove('visible');
                                UI.renderHome(); UI.renderLibrary(); UI.renderPlaylists(); UI.updateLibraryStorageStats(); UI.showToast("Library wiped", "delete_forever");
                            });
                        }
                    }
                    else if (action === 'context-opt-play') {
                        const selected = Player.getTrackById(State.actionTargetId);
                        if (selected?.source === 'machhar-online') {
                            if(State.playbackSourceMode!=='online'){UI.showToast('Switch to streaming playback to play this track.','info');return;}
                            const found = OnlineWorkspace.getPlaybackContext(null, selected.id);
                            const context = OnlineRecommendations.filterPlaybackContext(found.length ? found : [selected], selected.id);
                            Player.playContext(context, 0);
                        } else Player.playContext(State.library, State.library.findIndex(t=>t.id===State.actionTargetId));
                        UI.closeSheets();
                    }
                    else if (action === 'context-opt-next') { Player.addNext(State.actionTargetId); }
                    else if (action === 'context-opt-queue') { Player.addQueue(State.actionTargetId); }
                    else if (action === 'context-opt-fav') { Player.toggleFavorite(State.actionTargetId); }
                    else if (action === 'context-opt-info') { await TrackActions.showInfo(State.actionTargetId); }
                    else if (action === 'context-opt-share') { const id=State.actionTargetId; UI.closeSheets(); await TrackActions.share(id); }
                    else if (action === 'context-opt-playlist') {
                        const selected=Player.getTrackById(State.actionTargetId);
                        UI.closeSheets();
                        setTimeout(() => { if(selected?.source==='machhar-online') OnlineWorkspace.openPlaylistPicker(State.actionTargetId); else UI.showSheet('add-playlist-sheet'); }, 180);
                    }
                    else if (action === 'context-opt-remove') {
                        if (OnlineMusic.isOnlineId(State.actionTargetId)) { UI.showToast('Streaming results are separate from your local library.', 'info'); UI.closeSheets(); return; }
                        const confirmed = await Dialog.show({ type: 'confirm', title: 'Remove Track', message: 'Remove this track from your library?', confirmText: 'Remove', destructive: true });
                        if(confirmed) Library.removeTrack(State.actionTargetId); 
                    }
                    } catch (error) {
                        console.error('Mujic delegated click handler failed:', error);
                        try { UI.showToast('That action could not be completed. Please try again.', 'error'); } catch (_) { Utils.warn(_); }
                    }
                });

                document.querySelectorAll('.settings-control').forEach(el => {
                    el.addEventListener('change', (e) => {
                        const key = e.target.dataset.setting; if (!key) return;
                        State[key] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'range' || e.target.type === 'number' ? Number(e.target.value) : e.target.value);
                        if (key === 'seekStep') State.seekStep = Number(State.seekStep) || 10;
                        if (key === 'loudnessLevel' && !['soft','balanced','strong'].includes(State.loudnessLevel)) State.loudnessLevel = 'balanced';
                        StorageAdapter.saveSettings(); UI.applySettings(); AudioAdapter.applySettings();
                        if (key === 'keepScreenAwake') AudioAdapter.setWakeLock(State.keepScreenAwake);
                        if (key === 'lyricsTimingOffset') { State.activeLyricIndex = -1; UI.syncLyrics(State.currentTime); }
                        if (key === 'waveformStyle') UI.updateWaveformStyleUI();
                        if (key === 'visualizerMode') UI.updateVisualizerUI();
                        if (key === 'performanceProfile') UI.showToast(State.lowEndModeActive ? 'Low-end performance profile active.' : 'Full visual quality active.', 'speed');
                        if(key === 'librarySort' || key === 'librarySortDir') { Library.sortLibrary(); UI.renderLibrary(); }
                        if(key === 'showArtworkLists') UI.updateHighlights();
                        if(['crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','seekStep','lyricsPlusEnabled','lyricsRenderEnabled'].includes(key)) UI.showToast('Playback preferences updated', 'check_circle');
                    });
                });
                
                const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)');
                const onColorSchemeChange = () => { if (State.theme === 'system') UI.applySettings(); };
                if (colorSchemeQuery?.addEventListener) colorSchemeQuery.addEventListener('change', onColorSchemeChange);
                else if (colorSchemeQuery?.addListener) colorSchemeQuery.addListener(onColorSchemeChange);
            },
            setupGestures: () => {
                window.addEventListener('resize', () => { AudioAdapter.resizeVisualizer(); if (AudioAdapter.visualizerShouldRun()) AudioAdapter.renderScrubberVisualizerFrame(); });
                // Native-style horizontal navigation between the four primary tabs. Vertical scrolling,
                // nested rails, lyrics, inputs, controls and the expanded player keep their own gestures.
                const mainContent = document.getElementById('main-content');
                // Mouse wheel and click-safe pointer dragging for both the offline-compatible
                // horizontal rails and dynamically-rendered Online card/artist rails.
                const wheelRailSelector='.horizontal-rail,.online-card-rail';
                const dragRailSelector='.online-card-rail';
                const attachRailWheel = rail => {
                    if (!rail || rail.dataset.mujicWheelBound === '1') return;
                    rail.dataset.mujicWheelBound = '1';
                    rail.addEventListener('wheel', event => {
                        if (window.matchMedia('(max-width: 767px)').matches || event.shiftKey) return;
                        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
                        const maxScroll = rail.scrollWidth - rail.clientWidth;
                        if (maxScroll <= 1) return;
                        const next = Math.max(0, Math.min(maxScroll, rail.scrollLeft + event.deltaY));
                        if (next === rail.scrollLeft) return;
                        event.preventDefault(); rail.scrollLeft = next;
                    }, {passive:false});
                };
                const attachRailsIn = node => {
                    if (!node || node.nodeType !== 1) return;
                    if (node.matches?.(wheelRailSelector)) attachRailWheel(node);
                    node.querySelectorAll?.(wheelRailSelector).forEach(attachRailWheel);
                };
                document.querySelectorAll(wheelRailSelector).forEach(attachRailWheel);
                const railObserver = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(attachRailsIn)));
                railObserver.observe(mainContent || document.body, {childList:true, subtree:true});
                let railDrag=null, suppressRailClickUntil=0;
                document.addEventListener('pointerdown',(event)=>{
                    if(event.pointerType!=='mouse'||event.button!==0)return;
                    const rail=event.target.closest(dragRailSelector);if(!rail||rail.scrollWidth-rail.clientWidth<=2)return;
                    railDrag={rail,startX:event.clientX,startScroll:rail.scrollLeft,pointerId:event.pointerId,moved:false};
                },true);
                document.addEventListener('pointermove',(event)=>{
                    if(!railDrag||event.pointerId!==railDrag.pointerId)return;
                    const dx=event.clientX-railDrag.startX;
                    if(!railDrag.moved&&Math.abs(dx)<5)return;
                    railDrag.moved=true;railDrag.rail.classList.add('is-pointer-dragging');
                    railDrag.rail.scrollLeft=railDrag.startScroll-dx;
                    event.preventDefault();
                },{passive:false});
                const finishRailDrag=(event)=>{
                    if(!railDrag||event.pointerId!==railDrag.pointerId)return;
                    if(railDrag.moved)suppressRailClickUntil=Date.now()+260;
                    railDrag.rail.classList.remove('is-pointer-dragging');railDrag=null;
                };
                document.addEventListener('pointerup',finishRailDrag,true);document.addEventListener('pointercancel',finishRailDrag,true);
                document.addEventListener('click',(event)=>{
                    if(Date.now()>=suppressRailClickUntil||!event.target.closest(dragRailSelector))return;
                    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();suppressRailClickUntil=0;
                },true);
                const primaryViews = ['home','library','search','settings'];
                let navSwipeStart = null;
                const swipeIgnoreSelector = 'input,textarea,select,a,.horizontal-rail,.tab-bar,.search-container,.settings-subpage:not(.hidden),.player-lyrics-container,.scrubber-wrap,.bottom-sheet,.dialog-box,[data-eq-band],.lyrics-offset-control';
                mainContent?.addEventListener('pointerdown', (e) => {
                    if (e.pointerType !== 'touch' || State.isFullPlayerOpen || !mainContent.contains(e.target)) { navSwipeStart = null; return; }
                    const view = document.querySelector('.view.active');
                    const viewId = view?.id?.replace('view-','');
                    if (!primaryViews.includes(viewId) || e.target.closest(swipeIgnoreSelector)) { navSwipeStart = null; return; }
                    navSwipeStart = {x:e.clientX, y:e.clientY, viewId, pointerId:e.pointerId};
                }, {passive:true});
                mainContent?.addEventListener('pointerup', (e) => {
                    if (!navSwipeStart || e.pointerId !== navSwipeStart.pointerId) { navSwipeStart = null; return; }
                    const start = navSwipeStart; navSwipeStart = null;
                    const dx = e.clientX - start.x, dy = e.clientY - start.y;
                    if (Math.abs(dx) < 78 || Math.abs(dy) > 58 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
                    const idx = primaryViews.indexOf(start.viewId);
                    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
                    if (nextIdx < 0 || nextIdx >= primaryViews.length) return;
                    State.suppressNextClickUntil = Date.now() + 320;
                    UI.switchView(primaryViews[nextIdx]);
                }, {passive:true});
                mainContent?.addEventListener('pointercancel', () => { navSwipeStart = null; }, {passive:true});
                const sb = document.getElementById('scrubber-bar');
                const updateScrubber = (e) => { 
                    const r = sb.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX);
                    const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); AudioAdapter.seek(p * State.duration); 
                };
                if (sb) {
                    sb.addEventListener('pointerdown', e => { if (!sb.setPointerCapture) return; sb.setPointerCapture(e.pointerId); updateScrubber(e); });
                    sb.addEventListener('pointermove', e => { if(sb.hasPointerCapture?.(e.pointerId)) updateScrubber(e); });
                    sb.addEventListener('pointerup', e => { if(sb.hasPointerCapture?.(e.pointerId)) sb.releasePointerCapture(e.pointerId); });
                    sb.addEventListener('pointercancel', e => { if(sb.hasPointerCapture?.(e.pointerId)) sb.releasePointerCapture(e.pointerId); });
                }
                
                const vb = document.getElementById('volume-slider-track');
                const updateVolume = (e) => { 
                    const r = vb.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX);
                    const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); AudioAdapter.setVolume(p); 
                };
                if (vb) {
                    vb.addEventListener('pointerdown', e => { if (!vb.setPointerCapture) return; vb.setPointerCapture(e.pointerId); updateVolume(e); });
                    vb.addEventListener('pointermove', e => { if(vb.hasPointerCapture?.(e.pointerId)) updateVolume(e); });
                    vb.addEventListener('pointerup', e => { if(vb.hasPointerCapture?.(e.pointerId)) vb.releasePointerCapture(e.pointerId); });
                    vb.addEventListener('pointercancel', e => { if(vb.hasPointerCapture?.(e.pointerId)) vb.releasePointerCapture(e.pointerId); });
                }
                
                let sy = 0, sx = 0; const fp = document.getElementById('full-player');
                fp?.addEventListener('touchstart', e => { sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, {passive:true});
                fp?.addEventListener('touchend', e => { 
                    const dy = e.changedTouches[0].clientY - sy; const dx = Math.abs(e.changedTouches[0].clientX - sx);
                    if(dy > 120 && dy > dx && !e.target.closest('.player-lyrics-container') && !e.target.closest('.scrubber-wrap')) {
                         UI.closeFullPlayer(); 
                    }
                });
                
                document.querySelectorAll('[data-eq-band]').forEach(input => {
                    input.addEventListener('input', (e) => { AudioAdapter.setEQBand(e.target.dataset.eqBand, e.target.value); });
                });
                document.getElementById('file-input')?.addEventListener('change', (e) => Library.importFiles(e, State.playlistImportTargetId));
                document.getElementById('data-import-input')?.addEventListener('change', (e) => UI.importData(e.target.files?.[0]));
                document.getElementById('playlist-track-picker-search')?.addEventListener('input', () => UI.renderPlaylistTrackPicker());
                document.getElementById('search-input')?.addEventListener('input', UI.handleSearch);
            },
        });
