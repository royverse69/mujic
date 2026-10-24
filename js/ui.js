/* Copyright mujic@royverse69 */
        const UI = {
            supportsUrlHistory: () => location.protocol === 'http:' || location.protocol === 'https:',
            pushHistoryState: (state, hash) => {
                if (!UI.supportsUrlHistory()) return false;
                try { history.pushState(state, '', `${location.pathname}${location.search}${hash || ''}`); return true; }
                catch (error) { console.warn('Navigation history is unavailable; continuing without URL history.', error); return false; }
            },
            replaceHistoryState: (state, hash) => {
                if (!UI.supportsUrlHistory()) return false;
                try { history.replaceState(state, '', `${location.pathname}${location.search}${hash || ''}`); return true; }
                catch (error) { console.warn('Navigation history is unavailable; continuing without URL history.', error); return false; }
            },
            init: () => {
                if (Utils.isIOS()) document.body.classList.add('ios');
                const initSteps = [
                    ['settings grouping', UI.setupSettingsGroups],
                    ['navigation history', UI.setupHistory],
                    ['touch gestures', UI.setupGestures],
                    ['PWA install prompt', UI.setupInstallPrompt],
                    ['global interactions', UI.setupGlobalDelegation],
                    ['listening stats', UI.updateStatsUI]
                ];
                for (const [label, initialize] of initSteps) {
                    try { initialize.call(UI); }
                    catch (error) { console.error(`Mujic ${label} initialization failed; continuing startup.`, error); }
                }
                UI.updateGreeting?.();
                setInterval(() => UI.updateGreeting?.(), 60000);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') UI.updateGreeting?.(true); });
                setTimeout(() => { document.querySelectorAll('.home-greeting:not(#online-greeting-text)').forEach(g => g.classList.add('hidden')); }, 25000);
                const persistResume = () => {
                    if (State.resumePlayback && State.currentTrackId) { State.resumePosition = State.currentTime; State.lastPositionSave = Date.now(); StorageAdapter.saveSettings(); }
                };
                window.addEventListener('beforeunload', persistResume);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistResume(); });
            },
            setupHistory: () => {
                const validViews = ['home', 'library', 'search', 'settings', 'context-detail', 'online-home', 'online-search', 'online-playlists', 'online-history', 'online-queue', 'online-detail', 'online-artists'];
                const hashView = location.hash.startsWith('#') ? location.hash.slice(1) : '';
                const initialView = validViews.includes(hashView) ? hashView : 'home';
                if (UI.supportsUrlHistory() && (!history.state || !history.state.mujic)) UI.replaceHistoryState({ mujic:true, view:initialView, player:false, sheet:null }, `#${initialView}`);
                window.addEventListener('popstate', (e) => UI.handlePopState(e.state));
            },
            handlePopState: (state) => {
                const s = state && state.mujic ? state : { mujic:true, view:'home', player:false, sheet:null };
                UI.switchView(s.view || 'home', true);
                if ((s.view || 'home') === 'settings') UI.setSettingsGroup(s.settingsGroup || null, true);
                if (s.player) UI.openFullPlayer(true); else UI.closeFullPlayer(true);
                if (s.sheet) UI.showSheet(s.sheet, true); else UI.closeSheets(true);
            },
            goBack: () => {
                if (UI.supportsUrlHistory() && history.state && history.state.mujic) { try { history.back(); return; } catch (error) { Utils.warn(error); } }
                UI.switchView(UI._prevView || 'library', true);
            },
            switchView: (vid, fromHistory = false) => {
                if (State.playbackSourceMode === 'online' && (vid === 'online-history' || vid === 'online-queue')) {
                    if (window.OnlineWorkspace) OnlineWorkspace.setLibraryTab(vid === 'online-history' ? 'history' : 'queue');
                    vid = 'online-playlists';
                }
                const onlineViews = new Set(['online-home','online-search','online-playlists','online-history','online-queue','online-detail','online-artists']);
                const offlineViews = new Set(['home','library','search','context-detail']);
                if (State.playbackSourceMode === 'online' && offlineViews.has(vid)) {
                    vid = vid === 'search' ? 'online-search' : 'online-home';
                } else if (State.playbackSourceMode !== 'online' && onlineViews.has(vid)) {
                    if (vid === 'online-search') vid = 'search'; else vid = 'home';
                }
                UI.closeSheets(true);
                UI.setNavCollapsed?.(false);
                const preservePlayer = fromHistory && !!history.state?.mujic && !!history.state?.player;
                if (!preservePlayer) UI.closeFullPlayer(true);
                if (!fromHistory) {
                    const current = document.querySelector('.view.active');
                    if (!current || current.id !== `view-${vid}`) UI.pushHistoryState({ mujic:true, view:vid, player:false, sheet:null }, `#${vid}`);
                }
                document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                
                const el = document.getElementById(`view-${vid}`); 
                if(el) { el.classList.remove('hidden'); el.classList.add('active'); }
                const navView = vid === 'online-detail' && window.OnlineWorkspace ? OnlineWorkspace.getNavView() : vid === 'online-artists' ? 'online-home' : vid;
                const nav = document.querySelector(`.nav-item[data-view="${navView}"]`);
                if(nav) nav.classList.add('active');
                
                if (vid === 'home') UI.renderHome();
                if (vid === 'settings' && !fromHistory) UI.setSettingsGroup(null, true);
                if (vid === 'library') {
                    const activeTab = document.querySelector('.tab-item.active');
                    if(activeTab) UI.switchLibraryTab(activeTab.dataset.tab);
                }
                if (vid === 'search') { UI.handleSearch({target: document.getElementById('search-input')}); }
                if (onlineViews.has(vid) && window.OnlineWorkspace) OnlineWorkspace.renderActiveView(vid);
                const main = document.getElementById('main-content'); if (main) main.scrollTop = 0;
            },
            switchLibraryTab: (tab) => {
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.lib-tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
                const targetTab = document.querySelector(`.tab-item[data-tab="${tab}"]`); if(targetTab) targetTab.classList.add('active');
                const content = document.getElementById(`lib-${tab}`); if (content) { content.classList.remove('hidden'); content.classList.add('active'); }
                
                if(tab==='songs') UI.renderLibrary(); if(tab==='albums') UI.renderAlbums();
                if(tab==='artists') UI.renderArtists(); if(tab==='playlists') UI.renderPlaylists();
            },
            showMiniPlayer: () => { const mini=document.getElementById('mini-player'); if(mini) mini.classList.add('visible'); UI.updateVisualizerUI(); AudioAdapter.resizeVisualizer(); if(State.visualizerMode==='wave' && State.isPlaying) AudioAdapter.initWebAudio().then(()=>{AudioAdapter.resizeVisualizer();AudioAdapter.renderScrubberVisualizerFrame();if(AudioAdapter.visualizerShouldRun())AudioAdapter.startVisualizerLoop();}).catch(()=>{}); },
            openFullPlayer: (fromHistory = false) => { 
                if (!State.isFullPlayerOpen) {
                    State.isFullPlayerOpen = true; const fp = document.getElementById('full-player'); fp.style.pointerEvents = 'auto'; fp.setAttribute('aria-hidden','false'); fp.classList.add('active'); document.body.classList.add('player-open');
                    if (!fromHistory) UI.pushHistoryState({ mujic:true, view:(document.querySelector('.view.active')?.id || 'view-home').replace('view-',''), player:true, sheet:null }, '#player');
                }
                UI.loadPlayerArtworkLarge?.(Player.getCurrentTrack());
                if (State.isLyricsMode && State.currentLyrics && State.currentLyrics.isSynced) UI.syncLyrics(State.currentTime);
                AudioAdapter.setWakeLock(State.keepScreenAwake);
                UI.updateVisualizerUI();
                if (State.visualizerMode === 'wave') {
                    AudioAdapter.initWebAudio().then(() => {
                        AudioAdapter.resizeVisualizer(); AudioAdapter.renderScrubberVisualizerFrame();
                        if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                    }).catch(() => UI.updateVisualizerUI());
                } else {
                    AudioAdapter.stopVisualizerLoop(); AudioAdapter.resizeVisualizer();
                }
            },
            closeFullPlayer: (fromHistory=false) => {
                const shouldGoBack = !fromHistory && State.isFullPlayerOpen && history.state?.mujic && history.state?.player && !history.state?.sheet;
                State.isFullPlayerOpen=false; clearTimeout(State.lyricsTimeout); State.isLyricsMode=false; State.currentLyrics=null; State.activeLyricIndex=-1; State.statsLastAudioTime = Number(AudioAdapter.audio.currentTime) || State.statsLastAudioTime; AudioAdapter.stopVisualizerLoop();
                const track=document.getElementById('scrubber-bar'); if(track) track.classList.remove('visualizer-active');
                const fp=document.getElementById('full-player'); fp.classList.remove('active'); fp.style.pointerEvents='none'; fp.setAttribute('aria-hidden','true'); document.body.classList.remove('player-open','lyrics-mode','immersive-lyrics'); UI.updateVisualizerUI();
                document.getElementById('lyrics-btn')?.classList.remove('active-state');
                const ib=document.querySelector('.immersive-btn'); if(ib) ib.innerHTML='<span class="material-symbols-rounded">fullscreen</span>';
                AudioAdapter.drawVisualizerFrame();
                AudioAdapter.setWakeLock(false);
                if (shouldGoBack && UI.supportsUrlHistory()) history.back();
            },
            showSheet: (id, fromHistory = false) => { 
                UI.closeSheets(true); document.getElementById('sheet-overlay').classList.add('active'); 
                const sheet = document.getElementById(id); if (sheet) { sheet.classList.add('active'); UI.updatePlayerSettingsLabels(); UI.updateVisualizerUI(); if (id === 'eq-sheet') UI.updateEQUI(); }
                if (!fromHistory) {
                    const view = (document.querySelector('.view.active')?.id || 'view-home').replace('view-','');
                    UI.pushHistoryState({ mujic:true, view, player:State.isFullPlayerOpen, sheet:id }, `#sheet-${id}`);
                }
            },
            closeSheets: (fromHistory = false) => { 
                if (!fromHistory && UI.supportsUrlHistory() && history.state?.mujic && history.state?.sheet) { history.back(); return; }
                document.getElementById('sheet-overlay').classList.remove('active'); 
                document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active')); 
                if (State.dialogResolve) { State.dialogResolve(false); State.dialogResolve = null; }
            },
            showToast: (m, icon = 'check_circle') => { 
                clearTimeout(State.toastTimeout); const t = document.getElementById('toast'); 
                document.getElementById('toast-message').innerText = m; document.getElementById('toast-icon').innerText = icon;
                t.classList.add('show'); State.toastTimeout = setTimeout(() => t.classList.remove('show'), 3000); 
            },
            updateSleepTimerDisplay: () => {
                const st = State.sleepTimer; if(!st.active || st.endOfSong) return;
                const rem = Math.max(0, Math.floor((st.endTime - Date.now()) / 1000));
                document.getElementById('st-active-display').innerText = `Timer: ${Utils.formatTime(rem)}`;
            },
            updateVolumeUI: () => {
                const p = State.muted ? 0 : State.volume * 100;
                document.getElementById('volume-fill').style.width = `${p}%`; document.getElementById('volume-thumb').style.left = `${p}%`;
                let icon = 'volume_up'; if(State.muted || State.volume === 0) icon = 'volume_off'; else if(State.volume < 0.5) icon = 'volume_down';
                document.getElementById('mute-btn').innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
            },
        };
