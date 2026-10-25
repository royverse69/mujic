/* Copyright mujic@royverse69 */
        Object.assign(UI, {
            setupGlobalDelegation: () => {
                // Sharing is optional UI: never let its initialization prevent player/control handlers from being wired.
                try { window.LyricsShare?.init(); } catch (error) { console.warn('[Mujic] Lyrics-share setup failed; player controls remain enabled.', error); }
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
                // PiP is desktop-first because browser support remains inconsistent on mobile.
                const isMobilePiPContext = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
                const hasDocumentPiP = () => Boolean(window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function');
                const hasVideoPiP = () => Boolean(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream);
                const refreshPiPButtonVisibility = () => {
                    const supported = hasDocumentPiP() || hasVideoPiP();
                    document.querySelectorAll('[data-action="picture-in-picture"]').forEach(button => { button.hidden = isMobilePiPContext() || !supported; button.setAttribute('aria-hidden', String(button.hidden)); });
                };
                refreshPiPButtonVisibility();
                window.addEventListener('resize', refreshPiPButtonVisibility, {passive:true});

                // Document PiP has app-owned HTML controls. They operate directly on the same
                // AudioAdapter/Player instance, avoiding the disconnected muted-canvas controls
                // that can appear idle in native video PiP.
                const openDocumentPlayerPiP = async () => {
                    const api = window.documentPictureInPicture;
                    if (!api?.requestWindow) return false;
                    if (api.window && !api.window.closed) { api.window.focus(); return true; }
                    // requestWindow must be called synchronously in the initiating click gesture.
                    const pipWindow = await api.requestWindow({width:380, height:232, preferInitialWindowPlacement:true});
                    const pipDoc = pipWindow.document;
                    pipDoc.title = 'Mujic · Now Playing';
                    const style = pipDoc.createElement('style');
                    style.textContent = `
                        :root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#09090b;color:#f8fafc}
                        *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:#09090b;overflow:hidden}
                        body{padding:12px;position:relative;isolation:isolate}.pip{height:100%;display:flex;flex-direction:column;gap:10px;position:relative;z-index:1}
                        .pip-bg{position:absolute;inset:-18px;width:calc(100% + 36px);height:calc(100% + 36px);object-fit:cover;filter:blur(22px) saturate(1.25);opacity:.42;transform:scale(1.05);pointer-events:none;z-index:0}
                        body:after{content:"";position:absolute;inset:0;background:linear-gradient(125deg,rgba(6,7,10,.38),rgba(6,7,10,.86));pointer-events:none;z-index:1}
                        .pip{z-index:2}
                        .track{display:flex;align-items:center;gap:12px;min-width:0;flex:1}
                        .art{width:72px;height:72px;border-radius:11px;object-fit:cover;background:#19191f;flex:none;box-shadow:0 8px 25px #0007}
                        .meta{min-width:0;flex:1}.title{font-size:13px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
                        .artist{font-size:11px;margin-top:4px;color:#a1a1aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                        .status{font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:#a1a1aa;margin-top:5px}
                        .timeline{display:flex;flex-direction:column;gap:3px}.seek{width:100%;height:16px;margin:0;accent-color:#f04452;cursor:pointer}
                        .times{display:flex;justify-content:space-between;color:#a1a1aa;font-size:10px;font-variant-numeric:tabular-nums}
                        .controls{display:flex;align-items:center;justify-content:space-between;gap:7px}
                        button{border:0;color:#e4e4e7;background:transparent;min-width:34px;height:34px;border-radius:999px;font:inherit;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
                        button:hover{background:#242428}button:focus-visible,input:focus-visible{outline:2px solid #f04452;outline-offset:2px}
                        button.primary{width:43px;height:43px;background:#fafafa;color:#111113;font-size:19px}
                        button.primary:hover{background:#dedee3}.skip{font-size:11px;font-weight:750;width:42px}
                        @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
                    `;
                    pipDoc.head.appendChild(style);
                    pipDoc.body.innerHTML = `<img class="pip-bg" id="mj-pip-bg" alt="" aria-hidden="true"><main class="pip" aria-label="Mujic mini player">
                        <section class="track"><img class="art" id="mj-pip-art" width="72" height="72" alt="Album cover"><div class="meta"><div class="title" id="mj-pip-title">Mujic</div><div class="artist" id="mj-pip-artist">Ready to play</div><div class="status" id="mj-pip-status">NOW PLAYING</div></div></section>
                        <section class="timeline"><input class="seek" id="mj-pip-seek" type="range" min="0" max="1" value="0" step="0.1" aria-label="Seek through song"><div class="times"><span id="mj-pip-current">0:00</span><span id="mj-pip-duration">0:00</span></div></section>
                        <nav class="controls" aria-label="Playback controls"><button id="mj-pip-prev" title="Previous track" aria-label="Previous track">|◀</button><button id="mj-pip-back" class="skip" title="Back 10 seconds" aria-label="Back 10 seconds">−10s</button><button id="mj-pip-toggle" class="primary" title="Play" aria-label="Play">▶</button><button id="mj-pip-forward" class="skip" title="Forward 10 seconds" aria-label="Forward 10 seconds">+10s</button><button id="mj-pip-next" title="Next track" aria-label="Next track">▶|</button></nav>
                    </main>`;
                    const get = id => pipDoc.getElementById(id);
                    const audio = AudioAdapter.audio;
                    let lastTrackKey = null;
                    let seekWasChanged = false;
                    let syncTimer = null;
                    const fmt = value => { const n=Math.max(0,Math.floor(Number(value)||0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
                    const imageFor = track => {
                        try {
                            if (track?.source === 'machhar-online' || window.OnlineMusic?.isOnlineTrack?.(track)) {
                                const proxied=window.OnlineMusic?.getImage?.(track?.raw||{});
                                if (proxied) return String(proxied);
                            }
                        } catch (_) {}
                        const value = track?.artworkUrl || track?.artwork || track?.imageUrl || track?.image_url || track?.image;
                        if (typeof value === 'string' && value) return value;
                        const loaded = document.getElementById('full-art') || document.getElementById('mini-art');
                        return loaded?.currentSrc || loaded?.src || window.Utils?.defaultArt || '';
                    };
                    const sync = () => {
                        if (pipWindow.closed) return;
                        const track = Player.getCurrentTrack();
                        const trackKey = String(track?.id ?? State.currentTrackId ?? '');
                        const title = String(track?.title || document.getElementById('full-title')?.textContent || 'Mujic');
                        const artist = String(track?.artist || document.getElementById('full-artist')?.textContent || 'Now Playing');
                        if (trackKey !== lastTrackKey) {
                            lastTrackKey = trackKey;
                            get('mj-pip-title').textContent = title;
                            get('mj-pip-artist').textContent = artist;
                            pipDoc.title = `${title} · Mujic`;
                            const cover = get('mj-pip-art');
                            const backgroundArt = get('mj-pip-bg');
                            const src = imageFor(track);
                            if (src && cover.dataset.source !== src) { cover.dataset.source = src; cover.src = src; }
                            if (src && backgroundArt.dataset.source !== src) { backgroundArt.dataset.source = src; backgroundArt.src = src; }
                            cover.onerror = () => {
                                const fallback=window.Utils?.defaultArt||'';
                                if (fallback && cover.dataset.source !== fallback) {
                                    cover.dataset.source=fallback; cover.src=fallback;
                                    backgroundArt.dataset.source=fallback; backgroundArt.src=fallback;
                                }
                            };
                        }
                        const duration = Number(audio.duration);
                        const current = Math.max(0, Number(audio.currentTime) || Number(State.currentTime) || 0);
                        const durationKnown = Number.isFinite(duration) && duration > 0;
                        const max = durationKnown ? duration : Math.max(1, Number(State.duration)||1);
                        const slider = get('mj-pip-seek');
                        slider.max = String(max);
                        slider.disabled = !durationKnown;
                        if (!seekWasChanged && pipDoc.activeElement !== slider) slider.value = String(Math.min(current, max));
                        get('mj-pip-current').textContent = fmt(current);
                        get('mj-pip-duration').textContent = durationKnown ? fmt(duration) : '—:—';
                        const playing = !audio.paused && !audio.ended;
                        const toggle = get('mj-pip-toggle');
                        toggle.textContent = playing ? 'Ⅱ' : '▶';
                        toggle.title = playing ? 'Pause' : 'Play';
                        toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
                        get('mj-pip-status').textContent = playing ? 'NOW PLAYING' : (track ? 'PAUSED' : 'READY');
                    };
                    const seekTo = value => {
                        AudioAdapter.seek(Number(value));
                        State.currentTime = Number(audio.currentTime) || 0;
                        AudioAdapter.updateMediaSessionPosition();
                        UI.updateProgress();
                        sync();
                    };
                    get('mj-pip-toggle').addEventListener('click', async () => {
                        if (!audio.paused) Player.pause();
                        else await Player.togglePlay();
                        sync();
                    });
                    get('mj-pip-prev').addEventListener('click', () => { Promise.resolve(Player.previous()).finally(sync); });
                    get('mj-pip-next').addEventListener('click', () => { Promise.resolve(Player.next()).finally(sync); });
                    get('mj-pip-back').addEventListener('click', () => seekTo((Number(audio.currentTime)||0)-10));
                    get('mj-pip-forward').addEventListener('click', () => seekTo((Number(audio.currentTime)||0)+10));
                    get('mj-pip-seek').addEventListener('input', e => { seekWasChanged=true; get('mj-pip-current').textContent=fmt(e.target.value); });
                    get('mj-pip-seek').addEventListener('change', e => { seekTo(e.target.value); seekWasChanged=false; });
                    const audioEvents = ['play','playing','pause','timeupdate','loadedmetadata','durationchange','seeking','seeked','ratechange','ended','emptied'];
                    const onAudioChange = () => sync();
                    audioEvents.forEach(type => audio.addEventListener(type, onAudioChange));
                    window.MujicPiP = { sync };
                    sync();
                    syncTimer = setInterval(sync, 300);
                    pipWindow.addEventListener('pagehide', () => {
                        if (syncTimer) clearInterval(syncTimer);
                        audioEvents.forEach(type => audio.removeEventListener(type, onAudioChange));
                        if (window.MujicPiP?.sync === sync) window.MujicPiP = null;
                    }, {once:true});
                    return true;
                };

                // Native video PiP fallback for browsers without Document PiP. Native buttons are
                // driven by Media Session actions; the canvas video is only a display surface.
                const openNativeVideoPiP = async () => {
                    if (!hasVideoPiP()) throw new Error('This browser does not support video Picture-in-Picture.');
                    if (document.pictureInPictureElement?.id === 'mujic-pip-video') { await document.exitPictureInPicture(); return; }
                    let video = document.getElementById('mujic-pip-video');
                    if (!video) {
                        const canvas=document.createElement('canvas'); canvas.width=640; canvas.height=360;
                        const ctx=canvas.getContext('2d');
                        video=document.createElement('video'); video.id='mujic-pip-video'; video.muted=true; video.playsInline=true; video.disablePictureInPicture=false; video.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
                        video.srcObject=canvas.captureStream(12); document.body.appendChild(video);
                        const fit=(text,maxWidth)=>{let value=String(text||'');if(ctx.measureText(value).width<=maxWidth)return value;while(value.length>1&&ctx.measureText(value+'…').width>maxWidth)value=value.slice(0,-1);return value.trimEnd()+'…';};
                        let lastCanvasPaintKey='';
                        video._pipPaint=(force=false)=>{
                            if(!video.isConnected)return;
                            const current=(()=>{try{return Player.getCurrentTrack();}catch(_){return null;}})();
                            const title=current?.title||document.getElementById('full-title')?.textContent||'Mujic';
                            const artist=current?.artist||document.getElementById('full-artist')?.textContent||'Now Playing';
                            const art=document.getElementById('full-art')||document.getElementById('mini-art');
                            const artSrc=art?.currentSrc||art?.src||'';
                            const paintKey=[current?.id||State.currentTrackId||'',title,artist,artSrc,art?.naturalWidth||0].join('|');
                            if(!force&&paintKey===lastCanvasPaintKey)return;
                            lastCanvasPaintKey=paintKey;
                            ctx.fillStyle='#09090b';ctx.fillRect(0,0,640,360);
                            try {
                                if (art?.complete && art.naturalWidth) {
                                    const aw=art.naturalWidth, ah=art.naturalHeight;
                                    const coverScale=Math.max(640/aw,360/ah), bw=aw*coverScale, bh=ah*coverScale;
                                    ctx.save();ctx.filter='blur(18px) saturate(1.2)';ctx.globalAlpha=.92;
                                    ctx.drawImage(art,(640-bw)/2,(360-bh)/2,bw,bh);ctx.restore();
                                    ctx.fillStyle='rgba(5,6,10,.68)';ctx.fillRect(0,0,640,360);
                                    const size=224;ctx.save();ctx.filter='none';ctx.beginPath();ctx.roundRect(38,68,size,size,22);ctx.clip();ctx.drawImage(art,38,68,size,size);ctx.restore();
                                }
                            } catch (_) {}
                            ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='600 25px system-ui';ctx.fillText(fit(title,300),292,148);
                            ctx.fillStyle='#dedee5';ctx.font='18px system-ui';ctx.fillText(fit(artist,300),292,184);
                            ctx.fillStyle='#c0c0ca';ctx.font='14px system-ui';ctx.fillText('MUJIC · NOW PLAYING',292,226);
                        };
                        video._pipPaint(true);
                        const pipAudioEvents=['play','playing','pause','timeupdate','loadedmetadata','durationchange','seeking','seeked','ratechange','ended','emptied','loadstart','canplay'];
                        let audioListenersAttached=false;
                        let syncingVideoFromAudio=false;
                        const clearPipAction=(action)=>{
                            if(video._pipPendingAction!==action)return;
                            clearTimeout(video._pipPendingTimer);video._pipPendingTimer=null;video._pipPendingAction=null;video._pipPendingPromise=null;
                        };
                        const syncMediaState=()=>{
                            video._pipPaint();
                            try{if('mediaSession' in navigator)navigator.mediaSession.playbackState=(AudioAdapter.audio.paused||AudioAdapter.audio.ended)?'paused':'playing';}catch(_){}
                            AudioAdapter.updateMediaSessionPosition();
                            if(document.pictureInPictureElement!==video)return;
                            const shouldVideoPlay=(!AudioAdapter.audio.paused&&!AudioAdapter.audio.ended)||video._pipPendingAction==='play';
                            if(shouldVideoPlay&&video.paused&&!video._pipVideoPlayPending&&!video._pipVideoPlayFailed){
                                syncingVideoFromAudio=true;video._pipVideoPlayPending=true;
                                try{
                                    Promise.resolve(video.play()).then(()=>{video._pipVideoPlayFailed=false;},()=>{video._pipVideoPlayFailed=true;}).finally(()=>{video._pipVideoPlayPending=false;syncingVideoFromAudio=false;});
                                }catch(_){video._pipVideoPlayPending=false;video._pipVideoPlayFailed=true;syncingVideoFromAudio=false;}
                            }else if(!shouldVideoPlay){
                                video._pipVideoPlayFailed=false;
                                if(!video.paused){syncingVideoFromAudio=true;try{video.pause();}finally{syncingVideoFromAudio=false;}}
                            }
                        };
                        const requestPipPlay=()=>{
                            const audio=AudioAdapter.audio;
                            if(!audio.paused&&!audio.ended)return Promise.resolve(true);
                            if(video._pipPendingAction==='play')return video._pipPendingPromise||Promise.resolve(false);
                            clearTimeout(video._pipPendingTimer);video._pipPendingAction='play';
                            try{video._pipPendingPromise=Promise.resolve(Player.togglePlay());}catch(error){video._pipPendingPromise=Promise.reject(error);}
                            video._pipPendingPromise.catch(error=>console.warn('[Mujic PiP] Play request failed',error));
                            video._pipPendingTimer=setTimeout(()=>{clearPipAction('play');syncMediaState();},9000);
                            video._pipPendingPromise.then(()=>{if(!audio.paused)clearPipAction('play');syncMediaState();},()=>{clearPipAction('play');syncMediaState();});
                            return video._pipPendingPromise;
                        };
                        const requestPipPause=()=>{
                            const audio=AudioAdapter.audio;
                            if(audio.paused||audio.ended)return Promise.resolve(true);
                            if(video._pipPendingAction==='pause')return video._pipPendingPromise||Promise.resolve(false);
                            clearTimeout(video._pipPendingTimer);video._pipPendingAction='pause';
                            try{video._pipPendingPromise=Promise.resolve(Player.pause());}catch(error){video._pipPendingPromise=Promise.reject(error);}
                            video._pipPendingPromise.catch(error=>console.warn('[Mujic PiP] Pause request failed',error));
                            video._pipPendingTimer=setTimeout(()=>{clearPipAction('pause');syncMediaState();},1800);
                            video._pipPendingPromise.then(()=>{if(audio.paused)clearPipAction('pause');syncMediaState();},()=>{clearPipAction('pause');syncMediaState();});
                            return video._pipPendingPromise;
                        };
                        const attachAudioListeners=()=>{
                            if(audioListenersAttached)return;
                            pipAudioEvents.forEach(type=>AudioAdapter.audio.addEventListener(type,video._pipAudioHandlers[type]));
                            audioListenersAttached=true;
                        };
                        // Native video-PiP buttons manipulate the canvas video, not the separate
                        // music Audio element. Bridge both events back to Player and deduplicate
                        // them against Media Session actions so a single click starts one request.
                        video.addEventListener('play',()=>{if(!syncingVideoFromAudio&&document.pictureInPictureElement===video)requestPipPlay();});
                        video.addEventListener('pause',()=>{if(!syncingVideoFromAudio&&document.pictureInPictureElement===video)requestPipPause();});
                        video.addEventListener('loadeddata',()=>video._pipPaint(true));
                        video._pipSyncCleanup=()=>{
                            pipAudioEvents.forEach(type=>AudioAdapter.audio.removeEventListener(type,video._pipAudioHandlers?.[type]));
                            audioListenersAttached=false;clearTimeout(video._pipPendingTimer);video._pipPendingTimer=null;video._pipPendingAction=null;video._pipPendingPromise=null;
                            if(window.MujicNativePiP?.video===video)window.MujicNativePiP=null;
                        };
                        // Keep handler references stable so PiP can be closed/reopened without leaks.
                        video._pipAudioHandlers={};
                        pipAudioEvents.forEach(type=>{video._pipAudioHandlers[type]=()=>{
                            if(type==='play'||type==='playing')clearPipAction('play');
                            if(type==='pause'||type==='ended')clearPipAction('pause');
                            syncMediaState();
                        };});
                        video.addEventListener('enterpictureinpicture',()=>{
                            AudioAdapter.setupMediaSession();
                            AudioAdapter.updateMediaSessionMeta(Player.getCurrentTrack());
                            AudioAdapter.updateMediaSessionPosition();
                            video._pipVideoPlayFailed=false;video._pipVideoPlayPending=false;
                            attachAudioListeners();
                            window.MujicNativePiP={video,requestPlay:requestPipPlay,requestPause:requestPipPause,sync:syncMediaState};
                            video._pipPaint(true);
                            clearInterval(video._pipTimer);video._pipTimer=setInterval(syncMediaState,200);
                            syncMediaState();
                        });
                        video.addEventListener('leavepictureinpicture',()=>{clearInterval(video._pipTimer);video._pipTimer=null;video._pipSyncCleanup?.();});
                    }
                    video._pipPaint();
                    await new Promise((resolve,reject)=>{
                        if(video.readyState>=2)return resolve();
                        const timer=setTimeout(()=>reject(new Error('PiP video frame not ready')),1800);
                        video.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve();},{once:true});
                        video.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('PiP video failed'));},{once:true});
                    });
                    await video.play();
                    await video.requestPictureInPicture();
                };

                const openPlayerPiP = async () => {
                    if (isMobilePiPContext()) { UI.showToast('Picture-in-Picture is available on supported desktop browsers.', 'info'); return; }
                    if (hasDocumentPiP()) {
                        try { await openDocumentPlayerPiP(); return; }
                        catch (error) { console.warn('Document PiP unavailable; falling back to native video PiP.', error); }
                    }
                    try { await openNativeVideoPiP(); }
                    catch(error) { console.warn('PiP unavailable',error); UI.showToast('Could not open Picture-in-Picture. Use HTTPS or a supported desktop browser.', 'error'); }
                };

                const art = document.getElementById('player-art-container');
                let artSwipe=null;
                let artSwipeLocked=false;
                let artSwipeTimer=0;
                let artSwipeFallbackTimer=0;
                art?.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||e.target.closest('button')||artSwipeLocked)return;artSwipe={x:e.clientX,y:e.clientY,id:e.pointerId};},{passive:true});
                art?.addEventListener('pointerup',e=>{
                    if(!artSwipe||artSwipeLocked||artSwipe.id!==e.pointerId)return;
                    const dx=e.clientX-artSwipe.x,dy=e.clientY-artSwipe.y;artSwipe=null;
                    if(Math.abs(dx)<55||Math.abs(dx)<Math.abs(dy)*1.25)return;
                    e.preventDefault();e.stopPropagation();artSwipeLocked=true;
                    window.clearTimeout(artSwipeFallbackTimer);
                    const lowEndMotion=document.body.classList.contains('low-end-mode');
                    const direction=dx<0?'next':'previous';
                    const outClass=direction==='next'?'mujic-swipe-out-next':'mujic-swipe-out-previous';
                    const fullArt=document.getElementById('full-art');
                    if(fullArt)fullArt.dataset.pendingSwipeDirection=direction;
                    art.classList.remove('mujic-swipe-out-next','mujic-swipe-out-previous');
                    art.classList.add(outClass);
                    window.clearTimeout(artSwipeTimer);
                    artSwipeTimer=window.setTimeout(()=>{
                        /* Keep the outgoing cover translated until the next artwork has decoded. */
                        if(direction==='next')Player.next();else Player.previous();
                        artSwipeFallbackTimer=window.setTimeout(()=>{
                            art.classList.remove(outClass);
                            if(fullArt?.dataset.pendingSwipeDirection===direction)delete fullArt.dataset.pendingSwipeDirection;
                        },900);
                        window.setTimeout(()=>{artSwipeLocked=false;},lowEndMotion?190:235);
                    },lowEndMotion?150:145);
                    window.setTimeout(()=>{if(fullArt?.dataset.pendingSwipeDirection===direction)delete fullArt.dataset.pendingSwipeDirection;},1800);
                },{passive:false});
                art?.addEventListener('pointercancel',()=>{artSwipe=null;window.clearTimeout(artSwipeFallbackTimer);art?.classList.remove('mujic-swipe-out-next','mujic-swipe-out-previous');},{passive:true});

                const mini = document.getElementById('mini-player');
                mini?.querySelectorAll('.mini-action').forEach(btn => {
                    ['pointerdown','pointerup','click'].forEach(type => btn.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); }, {passive:false}));
                });
                const miniPlay = mini?.querySelector('[data-action="toggle-play"]');
                const miniNext = mini?.querySelector('[data-action="next-track"]');
                miniPlay?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.togglePlay(); }, true);
                miniNext?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.next(); }, true);
                mini?.querySelector('.mini-progress-bar')?.addEventListener('click', e => e.stopPropagation());
                mini?.querySelector('.mini-progress-bar')?.addEventListener('pointerdown', e => e.stopPropagation());
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
                window.addEventListener('scroll', cancelPress, {passive:true, capture:true});
                document.addEventListener('contextmenu', (e) => {
                    const plRow = e.target.closest('.playlist-longpress-target[data-key1]');
                    const songRow = plRow ? null : e.target.closest('.home-track-longpress-target[data-id]');
                    if (!plRow && !songRow) return;
                    e.preventDefault();
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

                    try {
                        switch (action) {
                            case 'picture-in-picture':
                                e.preventDefault(); e.stopPropagation(); await openPlayerPiP(); return;
                            case 'lyrics-share-start':
                                e.preventDefault(); e.stopPropagation(); UI.closeSheets(true);
                                try { await window.MujicModules?.ensureLyricsShare?.(); window.LyricsShare?.startSelection(); }
                                catch (error) { console.warn('[Mujic] Could not load lyric share tools', error); UI.showToast('Lyric sharing could not load. Check storage and try again.', 'error'); }
                                return;
                            case 'lyrics-share-open':
                                e.preventDefault(); e.stopPropagation();
                                try { await window.MujicModules?.ensureLyricsShare?.(); await window.LyricsShare?.openCard(); }
                                catch (error) { console.warn('[Mujic] Could not load lyric share tools', error); UI.showToast('Lyric sharing could not load. Try again.', 'error'); }
                                return;
                            case 'lyrics-share-close':
                                e.preventDefault(); e.stopPropagation(); window.LyricsShare?.closeCard(); return;
                            case 'lyrics-share-download':
                                e.preventDefault(); e.stopPropagation(); window.LyricsShare?.downloadCard(); return;
                            case 'lyrics-share-share':
                                e.preventDefault(); e.stopPropagation(); await window.LyricsShare?.shareCard(); return;
                            case 'lyrics-share-cancel':
                                e.preventDefault(); e.stopPropagation(); window.LyricsShare?.cancelSelection(); return;
                            case 'online-open-category':
                                e.preventDefault(); e.stopPropagation(); if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return; await OnlineWorkspace.openCategory(btn.dataset.id); return;
                            case 'online-open-radio':
                                e.preventDefault(); e.stopPropagation(); if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return; await OnlineWorkspace.openRadioStation(btn.dataset.id); return;
                            case 'online-show-radio-directory':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.openRadioDirectory(); return;
                            case 'online-play-radio':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.startRadio(btn.dataset.id); return;
                            case 'online-start-artist-radio':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.startArtistRadio(btn.dataset.id || '', btn.dataset.name || 'Artist'); return;
                            case 'online-play-category':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.playCategory(); return;
                            case 'online-load-category-more':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.loadMoreCategory(); return;
                            case 'open-current-artist':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.openCurrentArtist?.(btn.dataset.artistId || '', btn.dataset.artistName || ''); return;
                            case 'switch-view':
                                e.preventDefault(); e.stopPropagation();
                                if (btn.classList.contains('nav-item') && State.playbackSourceMode === 'online' && window.OnlineWorkspace?.handleNavRetap?.(btn.dataset.view)) return;
                                UI.switchView(btn.dataset.view); return;
                            case 'online-jump':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.jumpTo(btn.dataset.target); return;
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
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.shiftHomeArtistWall(btn.dataset.direction || 'right', btn.dataset.target || 'online-home-artists-mosaic'); return;
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
                            case 'online-browse-albums': {
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.filterSearchType('albums');
                                const input=document.getElementById('online-search-input'); if(input) input.value=btn.dataset.query || 'English hit albums';
                                UI.switchView('online-search');
                                return;
                            }
                            case 'online-clear-search':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.clearSearch(); return;
                            case 'online-remove-search-history':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.removeSearchHistory(btn.dataset.query); return;
                            case 'online-toggle-artist-bio': {
                                e.preventDefault(); e.stopPropagation(); const bio=document.getElementById('online-artist-bio'); if(bio){const expanded=bio.classList.toggle('is-expanded');btn.textContent=expanded?'Read less':'Read more';btn.setAttribute('aria-expanded',String(expanded));} return;
                            }
                            case 'online-open-entity':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                await OnlineWorkspace.openRemoteEntity(btn.dataset.type,btn.dataset.id); return;
                            case 'online-play-track':
                                e.preventDefault(); e.stopPropagation();
                                if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                OnlineWorkspace.playTrackFromShelf(btn.dataset.id,btn.dataset.context); return;
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
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.clearAllCaches(); UI.showToast('Streaming cache cleared.','delete'); return;
                            case 'online-toggle-caching':
                                OnlineWorkspace.setCaching(Boolean(btn.checked)); return;
                            case 'online-reset-taste':
                                e.preventDefault(); e.stopPropagation(); await OnlineWorkspace.resetTaste(); return;
                            case 'online-export-library':
                                e.preventDefault(); e.stopPropagation(); OnlineWorkspace.exportStreamingLibrary(); return;
                            case 'online-open-library':
                                e.preventDefault(); e.stopPropagation(); UI.switchView('online-playlists'); return;
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
                                    const sourceList = matches.length > 0 ? matches : [selectedTrack];
                                    const seenIds = new Set();
                                    const list = sourceList.filter(track => {
                                        if (!track?.id || seenIds.has(track.id)) return false;
                                        seenIds.add(track.id); return true;
                                    });
                                    const startIndex = Math.max(0, list.findIndex(track => track.id === id));
                                    Player.playContext(list, startIndex);
                                    return;
                                }
                                const contextList = State.library;
                                let list = contextList;
                                if (contextName === 'search') {
                                    const matches = Array.isArray(State.searchResults) ? State.searchResults.filter(track => contextList.some(item => item.id === track.id)) : [];
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
                            case 'track-options':
                                e.preventDefault(); e.stopPropagation(); await UI.openTrackOptions(btn.dataset.id); return;
                            case 'current-song-info': {
                                e.preventDefault(); e.stopPropagation(); const track=Player.getCurrentTrack();
                                if(!track){UI.showToast('Nothing is playing yet.','info');return;}
                                State.actionTargetId=track.id; UI.closeSheets(); await TrackActions.showInfo(track.id); return;
                            }
                            case 'current-song-share': {
                                e.preventDefault(); e.stopPropagation(); const track=Player.getCurrentTrack();
                                if(!track){UI.showToast('Nothing is playing yet.','info');return;}
                                State.actionTargetId=track.id; UI.closeSheets(); await TrackActions.share(track.id); return;
                            }
                            case 'current-song-download': {
                                e.preventDefault(); e.stopPropagation(); const track=Player.getCurrentTrack();
                                if(!track){UI.showToast('Nothing is playing yet.','info');return;}
                                if(!OnlineMusic.isOnlineTrack(track)){UI.showToast('Downloads are available for streaming tracks.','info');return;}
                                UI.closeSheets(); await OnlineDownloader.download(track); return;
                            }
                            case 'current-song-playlist': {
                                e.preventDefault(); e.stopPropagation(); const track=Player.getCurrentTrack();
                                if(!track){UI.showToast('Nothing is playing yet.','info');return;}
                                State.actionTargetId=track.id; UI.closeSheets();
                                if(OnlineMusic.isOnlineTrack(track)){
                                    if(State.playbackSourceMode!=='online' && !(await OnlineMusic.setMode('online'))) return;
                                    setTimeout(()=>OnlineWorkspace.openPlaylistPicker(track.id),120);
                                } else {
                                    setTimeout(()=>UI.openTrackOptions(track.id),120);
                                }
                                return;
                            }
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
                    else if (action === 'retry-lyrics') { e.stopPropagation(); if (!navigator.onLine) { UI.showToast('Connect to the internet to retry lyrics.', 'wifi'); return; } UI.loadCurrentLyrics({force:true}); }
                    else if (action === 'check-lyrics-cache') {
                        e.stopPropagation();
                        const id = btn.dataset.id;
                        const currentTrack = Player.getCurrentTrack();
                        const track = State.library.find(x => x.id === id) || (currentTrack?.id === id ? currentTrack : null);
                        const cached = track ? await LyricsFetcher.getCachedOnly(track) : null;
                        if (cached?.text) {
                            State.currentLyrics = cached;
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
                    else if (action === 'reset-appearance') UI.resetAppearance();
                    else if (action === 'open-external') { const target = btn.dataset.url || ''; if (/^https:\/\//.test(target)) window.open(target, '_blank', 'noopener,noreferrer'); }
                    else if (action === 'seek-lyric') { if (window.LyricsShare?.handleLyricClick(btn)) return; AudioAdapter.seek(parseFloat(btn.dataset.time)); }
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

                const commitSetting = e => {
                    const el=e.target, key=el?.dataset?.setting; if(!key||!el.classList.contains('settings-control'))return;
                    State[key] = el.type === 'checkbox' ? el.checked : (el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value);
                    if (key === 'seekStep') State.seekStep = Number(State.seekStep) || 10;
                    if (key === 'loudnessLevel' && !['soft','balanced','strong'].includes(State.loudnessLevel)) State.loudnessLevel = 'balanced';
                    StorageAdapter.saveSettings(); UI.applySettings(); AudioAdapter.applySettings();
                    if (key === 'keepScreenAwake') AudioAdapter.setWakeLock(State.keepScreenAwake);
                    if (key === 'lyricsShareEnabled') {
                        if (!State.lyricsShareEnabled) window.LyricsShare?.cancelSelection();
                        else window.MujicModules?.ensureLyricsShare?.().catch(error => console.warn('[Mujic] Lyric sharing will load when used.', error));
                        UI.showToast(State.lyricsShareEnabled ? 'Lyric sharing enabled.' : 'Lyric sharing disabled.', 'check_circle');
                    }
                    if (key === 'lyricsTimingOffset') { State.activeLyricIndex = -1; UI.syncLyrics(State.currentTime); }
                    if (key === 'lyricsWordByWord' && State.currentLyrics?.isSynced) UI.renderSyncedLyrics(State.currentLyrics);
                    if (key === 'waveformStyle') UI.updateWaveformStyleUI();
                    if (key === 'visualizerMode') UI.updateVisualizerUI();
                    if (key === 'performanceProfile') UI.showToast(State.lowEndModeActive ? 'Low-end performance profile active.' : 'Full visual quality active.', 'speed');
                    if(key === 'librarySort' || key === 'librarySortDir') { Library.sortLibrary(); UI.renderLibrary(); }
                    if(key === 'showArtworkLists') UI.updateHighlights();
                    if(['crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','seekStep','lyricsPlusEnabled','lyricsRenderEnabled'].includes(key)) UI.showToast('Playback preferences updated', 'check_circle');
                };
                // Delegation survives settings controls being moved into their category subpages.
                document.addEventListener('change', commitSetting);
                document.addEventListener('input', e => { const el=e.target; if(!el?.matches('.settings-control[type="range"]'))return; const key=el.dataset.setting;if(!key)return;State[key]=Number(el.value);UI.applySettings();if(key==='lyricsTimingOffset'){State.activeLyricIndex=-1;UI.syncLyrics(State.currentTime);} });
                
                const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)');
                const onColorSchemeChange = () => { if (State.theme === 'system') UI.applySettings(); };
                if (colorSchemeQuery?.addEventListener) colorSchemeQuery.addEventListener('change', onColorSchemeChange);
                else if (colorSchemeQuery?.addListener) colorSchemeQuery.addListener(onColorSchemeChange);
            },
            setupGestures: () => {
                window.addEventListener('resize', () => { AudioAdapter.resizeVisualizer(); if (AudioAdapter.visualizerShouldRun()) AudioAdapter.renderScrubberVisualizerFrame(); });
                const mainContent = document.getElementById('main-content');
                const miniPlayer = document.getElementById('mini-player');
                const bottomNav = document.getElementById('bottom-nav');
                const setNavCollapsed = collapsed => {
                    const shouldCollapse = Boolean(collapsed) && window.matchMedia('(max-width: 767px)').matches && !State.isFullPlayerOpen;
                    bottomNav?.classList.toggle('scroll-hidden', shouldCollapse);
                    document.body.classList.toggle('nav-scroll-hidden', shouldCollapse);
                    if (bottomNav) {
                        bottomNav.inert = shouldCollapse;
                        bottomNav.setAttribute('aria-hidden', String(shouldCollapse));
                    }
                    miniPlayer?.classList.remove('scroll-hidden');
                };
                UI.setNavCollapsed = setNavCollapsed;
                let previousMainScrollTop = mainContent?.scrollTop || 0;
                let navScrollFrame = 0;
                mainContent?.addEventListener('scroll', () => {
                    if (navScrollFrame) return;
                    navScrollFrame = requestAnimationFrame(() => {
                        navScrollFrame = 0;
                        const currentTop = mainContent.scrollTop;
                        const mobile = window.matchMedia('(max-width: 767px)').matches;
                        if (!mobile || State.isFullPlayerOpen) {
                            setNavCollapsed(false);
                            previousMainScrollTop = currentTop;
                            return;
                        }
                        const delta = currentTop - previousMainScrollTop;
                        if (currentTop < 24) setNavCollapsed(false);
                        else if (delta > 6 && !bottomNav?.contains(document.activeElement)) setNavCollapsed(true);
                        else if (delta < -6) setNavCollapsed(false);
                        previousMainScrollTop = currentTop;
                    });
                }, {passive:true});
                window.addEventListener('resize', () => {
                    const mobile = window.matchMedia('(max-width: 767px)').matches;
                    if (!mobile) setNavCollapsed(false);
                }, {passive:true});
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
