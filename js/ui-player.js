/* Copyright mujic@royverse69 */
        Object.assign(UI, {
            updateMiniNextUp: () => {
                const node=document.getElementById('mini-next-up');if(!node)return;
                const nextId=State.playbackOrder?.[Number(State.queueIndex)+1];
                const next=nextId!==undefined?Player.getTrackById(nextId):null;
                node.hidden=!next;
                node.textContent=next?`Up next · ${next.title}`:'';
                node.title=next?`Next track: ${next.title} — ${next.artist||'Unknown artist'}`:'';
            },
            setMiniPlayerBuffering: (buffering, track = null) => {
                const mini=document.getElementById('mini-player');if(!mini)return;
                const active=Boolean(buffering&&track&&track.source==='machhar-online');
                mini.classList.toggle('is-buffering',active);
                const status=document.getElementById('mini-buffering-status');
                if(status)status.textContent=active?`Loading ${track.title||'track'}…`:'';
                if(active)mini.setAttribute('aria-label',`Loading ${track.title||'track'} by ${track.artist||'unknown artist'}`);
                else mini.setAttribute('aria-label','Now playing');
            },
            renderQueue: () => {
                Player.syncNowPlaying?.();
                document.getElementById('queue-list').innerHTML = State.playbackOrder.map((id, i) => {
                    const t = Player.getTrackById(id); if(!t) return '';
                    const isP = i === State.queueIndex;
                    const isCurrent = String(id) === String(State.currentTrackId);
                    const isCurrentOnline = t.source === 'machhar-online' && isCurrent;
                    const def = Utils.generateDefaultArt(t.title);
                    const artHtml = t.source === 'machhar-online' && t.artworkUrl
                        ? `<img width="48" height="48" src="${Utils.escapeHTML(t.artworkUrl)}" class="track-art-small" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${def}';">`
                        : (State.showArtworkLists ? `<img src="${def}" data-art-id="${t.artworkId||''}" data-seed="${Utils.escapeHTML(t.title)}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';">` : `<div class="track-art-small art-placeholder" style="background-image:url('${def}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">music_note</span></div>`);
                    return `<div class="track-row${isCurrent?' is-now-playing':''}${isCurrentOnline?' online-playing-row':''}" data-action="play-queue-index" data-index="${i}" data-queue-index="${i}" ${isCurrent?'aria-current="true"':''}>
                        <div style="cursor: grab; margin-right: 8px; color: var(--text-tertiary); touch-action:none; user-select:none;" class="drag-handle" role="button" aria-label="Reorder queue item" tabindex="0"><span class="material-symbols-rounded" style="pointer-events:none;">drag_indicator</span></div>
                        ${artHtml}
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(t.title)}</div><div class="item-subtitle">${Utils.escapeHTML(t.artist)}</div></div>
                        ${isCurrent?'<span class="track-now-playing-status" aria-label="Now playing" title="Now playing"><span class="online-now-playing-bars" aria-hidden="true"><i></i><i></i><i></i></span><span class="track-now-playing-label">PLAYING</span></span>':''}
                        <div class="queue-mobile-controls">
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="up" ${i===0?'disabled':''} aria-label="Move up"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_up</span></button>
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="down" ${i===State.playbackOrder.length-1?'disabled':''} aria-label="Move down"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_down</span></button>
                            ${!isP ? `<button class="icon-btn" data-action="remove-queue" data-index="${i}" aria-label="Remove from queue"><span class="material-symbols-rounded" style="font-size: 20px; pointer-events:none;">close</span></button>` : ''}
                        </div>
                    </div>`;
                }).join('');
                UI.lazyLoadArtwork(); UI.setupQueueDragAndDrop(); UI.updateMiniNextUp?.();
            },
            setupQueueDragAndDrop: () => {
                const list = document.getElementById('queue-list');
                let draggedItem = null; let pointerId = null;

                const clearDragState = () => {
                    if (draggedItem) draggedItem.classList.remove('dragging');
                    draggedItem = null; pointerId = null;
                    list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over'));
                };
                const reorder = (fromIndex, toIndex) => {
                    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= State.playbackOrder.length || toIndex >= State.playbackOrder.length) return;
                    const item = State.playbackOrder.splice(fromIndex, 1)[0]; State.playbackOrder.splice(toIndex, 0, item);
                    if (State.queueIndex === fromIndex) State.queueIndex = toIndex;
                    else if (State.queueIndex > fromIndex && State.queueIndex <= toIndex) State.queueIndex--;
                    else if (State.queueIndex < fromIndex && State.queueIndex >= toIndex) State.queueIndex++;
                    StorageAdapter.saveSettings(); UI.renderQueue();
                };

                list.querySelectorAll('.track-row').forEach(row => {
                    row.addEventListener('dragstart', function(e) { draggedItem = this; setTimeout(() => this.classList.add('dragging'), 0); });
                    row.addEventListener('dragend', function() { this.classList.remove('dragging'); draggedItem = null; list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over')); });
                    row.addEventListener('dragover', function(e) { e.preventDefault(); if (this !== draggedItem) this.classList.add('drag-over'); });
                    row.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
                    row.addEventListener('drop', function(e) {
                        e.preventDefault(); this.classList.remove('drag-over');
                        if (this !== draggedItem && draggedItem) reorder(parseInt(draggedItem.dataset.queueIndex), parseInt(this.dataset.queueIndex));
                    });
                });

                list.querySelectorAll('.drag-handle').forEach(handle => {
                    const getTargetRow = (e) => {
                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        return el?.closest('#queue-list .track-row');
                    };
                    const endPointerDrag = (e) => {
                        if (!draggedItem || e.pointerId !== pointerId) return;
                        const fromIndex = parseInt(draggedItem.dataset.queueIndex, 10);
                        const target = getTargetRow(e);
                        const toIndex = target ? parseInt(target.dataset.queueIndex, 10) : fromIndex;
                        clearDragState();
                        reorder(fromIndex, toIndex);
                    };
                    handle.addEventListener('pointerdown', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        draggedItem = handle.closest('.track-row'); pointerId = e.pointerId;
                        if (!draggedItem) return;
                        draggedItem.classList.add('dragging');
                        try { handle.setPointerCapture(pointerId); } catch (err) { Utils.warn(err); }
                    });
                    handle.addEventListener('pointermove', (e) => {
                        if (!draggedItem || e.pointerId !== pointerId) return;
                        e.preventDefault();
                        const target = getTargetRow(e);
                        list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over'));
                        if (target && target !== draggedItem) target.classList.add('drag-over');
                    });
                    handle.addEventListener('pointerup', endPointerDrag);
                    handle.addEventListener('pointercancel', endPointerDrag);
                });
            },
            loadPlayerArtworkLarge: (track = Player.getCurrentTrack()) => {
                if (!track || track.source !== 'machhar-online' || !track.artworkLargeUrl) return false;
                const trackId = String(track.id || '');
                for (const id of ['full-art', 'desktop-lyrics-art']) {
                    const img = document.getElementById(id);
                    if (!img || img.dataset.mujicLargeTrack === trackId) continue;
                    img.dataset.mujicLargeTrack = trackId;
                    img.onerror = () => { img.onerror = null; img.src = track.artworkUrl || './icons/icon-192.png'; };
                    img.src = track.artworkLargeUrl;
                }
                const fullBg = document.getElementById('full-bg');
                if (fullBg && State.playerBackground === 'artwork') fullBg.style.backgroundImage = `url("${track.artworkLargeUrl.replace(/["\\]/g, '')}")`;
                return true;
            },
            updatePlayerMeta: async (t) => {
                if(!t) return;
                const reqId = ++State.artworkRequestId;
                
                document.getElementById('mini-title').innerText = t.title; document.getElementById('mini-artist').innerText = t.artist; 
                document.getElementById('full-title').innerText = t.title;
                const fullArtist=document.getElementById('full-artist');
                if(fullArtist){
                    const raw=t.raw||{};const artistRows=[...(raw.artists?.primary||[]),...(raw.artists?.featured||[]),...(raw.artists?.all||[]),...(raw.artistMap?.primary_artists||[]),...(raw.more_info?.artistMap?.primary_artists||[])];
                    const seenArtists=new Set();const artists=[];
                    for(const row of artistRows){const name=String(row?.name||row?.title||'').trim();const id=String(row?.id||row?.artistId||'').trim();const key=(id||name).toLocaleLowerCase();if(name&&!seenArtists.has(key)){seenArtists.add(key);artists.push({name,id});}}
                    if(!artists.length)String(t.artist||'Unknown Artist').split(/\s*,\s*|\s+&\s+/).filter(Boolean).forEach(name=>{if(!seenArtists.has(name.toLowerCase())){seenArtists.add(name.toLowerCase());artists.push({name,id:''});}});
                    fullArtist.innerHTML=`<span class="player-artist-marquee">${artists.map((artist,index)=>`${index?'<span class="player-artist-separator" aria-hidden="true">·</span>':''}<a href="#" data-action="open-current-artist" data-artist-name="${Utils.escapeHTML(artist.name)}" data-artist-id="${Utils.escapeHTML(artist.id)}" aria-label="Open ${Utils.escapeHTML(artist.name)} artist page">${Utils.escapeHTML(artist.name)}</a>`).join('')}</span>`;
                    fullArtist.setAttribute('aria-label',`Artists: ${artists.map(a=>a.name).join(', ')}`);fullArtist.title=`Open artist page: ${artists.map(a=>a.name).join(', ')}`;
                    requestAnimationFrame(()=>{const marquee=fullArtist.querySelector('.player-artist-marquee');if(marquee&&marquee.scrollWidth>fullArtist.clientWidth+8){marquee.classList.add('is-overflowing');marquee.style.setProperty('--marquee-distance',`-${Math.min(55,100*(marquee.scrollWidth-fullArtist.clientWidth)/marquee.scrollWidth)}%`);}});
                }
                const contextLabel=document.getElementById('player-context-label');
                if(contextLabel){
                    const label=window.OnlineWorkspace?.getPlaybackLabel?.(t)||(t.source==='machhar-online'?'Streaming':(State.currentContextType==='playlist'?'From Playlist':'From Your Library'));
                    contextLabel.textContent=String(label||'Now Playing');
                    contextLabel.title=`${label||'Now Playing'} · ${t.title||''}`;
                }
                
                const favBtn = document.getElementById('fav-btn'); const isF = OnlineMusic?.isOnlineTrack?.(t) ? Boolean(window.OnlineWorkspace?.isFavorite?.(t.id)) : State.favorites.includes(t.id);
                favBtn.innerHTML = `<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${isF?1:0}; color: ${isF?'var(--accent-color)':'inherit'};">favorite</span>`;
                
                clearTimeout(State.lyricsTimeout);
                const lyricsContent = document.getElementById('lyrics-content');
                State.currentLyrics = null; State.activeLyricIndex = -1;
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                lyricsContent.innerHTML = State.isLyricsMode ? `<div style="text-align:center; font-size: 16px; font-weight: 400; color: var(--text-secondary); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Loading lyrics...</div>` : '';
                
                let artUrl = await ArtworkCache.getUrl(t);
                if (reqId !== State.artworkRequestId) return;
                
                const miniArt=document.getElementById('mini-art');const fullArt=document.getElementById('full-art');const lyricsArt=document.getElementById('desktop-lyrics-art');
                const miniArtworkUrl=(t.source==='machhar-online'&&t.artworkMediumUrl)?t.artworkMediumUrl:artUrl;
                if(miniArt){miniArt.onerror=()=>{miniArt.onerror=null;if(miniArt.src!==artUrl)miniArt.src=artUrl;};miniArt.src=miniArtworkUrl;}
                if(fullArt){
                    fullArt.onerror=null;delete fullArt.dataset.mujicLargeTrack;fullArt.src=artUrl;
                    const swipeDirection=fullArt.dataset.pendingSwipeDirection;
                    if(swipeDirection){
                        const enterClass=swipeDirection==='next'?'mujic-swipe-in-from-right':'mujic-swipe-in-from-left';
                        fullArt.classList.remove('mujic-swipe-in-from-right','mujic-swipe-in-from-left');
                        void fullArt.offsetWidth;
                        fullArt.classList.add(enterClass);
                        delete fullArt.dataset.pendingSwipeDirection;
                        window.setTimeout(()=>fullArt.classList.remove(enterClass),460);
                    }
                }
                if(lyricsArt){lyricsArt.onerror=null;delete lyricsArt.dataset.mujicLargeTrack;lyricsArt.src=artUrl;}
                if(State.isFullPlayerOpen) UI.loadPlayerArtworkLarge?.(t);
                
                const fullBg = document.getElementById('full-bg');
                if (State.playerBackground === 'artwork') {
                    fullBg.style.backgroundImage = `url("${artUrl}")`; fullBg.style.backgroundColor = 'transparent';
                    if (State.accentPreset === 'dynamic') {
                        const extractedColor = await ArtworkCache.getAverageColor(t);
                        if (reqId === State.artworkRequestId) UI.setAccent(extractedColor);
                    }
                } else if (State.playerBackground === 'solid') {
                    fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = 'var(--bg-elevated)';
                } else if (State.playerBackground === 'black') {
                    fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = '#000000';
                }
                if (State.isLyricsMode) UI.loadCurrentLyrics();
            },
            updatePlayPause: () => {
                const isPlaying = Boolean(State.isPlaying);
                const icon = isPlaying ? 'pause' : 'play_arrow';
                const label = isPlaying ? 'Pause' : 'Play';
                const miniIcon = document.getElementById('mini-play-btn');
                const fullIcon = document.getElementById('full-play-btn');
                if (miniIcon) miniIcon.textContent = icon;
                if (fullIcon) fullIcon.textContent = icon;
                const miniButton = miniIcon?.closest('button');
                const fullButton = fullIcon?.closest('[data-action="toggle-play"]');
                if (miniButton) miniButton.setAttribute('aria-label', label);
                if (fullButton) { fullButton.setAttribute('aria-label', label); fullButton.setAttribute('title', `${label} playback`); }
                const art = document.getElementById('player-art-container');
                if (art) art.classList.toggle('paused', !isPlaying);
            },
            updateProgress: () => {
                const p = State.duration > 0 ? Math.max(0, Math.min(100, (State.currentTime / State.duration) * 100)) : 0;
                document.getElementById('mini-progress').style.width = `${p}%`; document.getElementById('full-progress').style.width = `${p}%`;
                document.getElementById('scrubber-thumb').style.left = `${p}%`; document.getElementById('time-current').innerText = Utils.formatTime(State.currentTime);
                if (!State.isPlaying && State.visualizerMode === 'wave') AudioAdapter.renderScrubberVisualizerFrame();
            },
            updateDuration: () => { document.getElementById('time-total').innerText = Utils.formatTime(State.duration); },
        });
