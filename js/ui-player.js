/* Mujic UI module: player: queue, now-playing metadata, progress. Extends the UI object defined in ui.js. */
        Object.assign(UI, {
            renderQueue: () => {
                document.getElementById('queue-list').innerHTML = State.playbackOrder.map((id, i) => {
                    const t = Player.getTrackById(id); if(!t) return '';
                    const isP = i === State.queueIndex;
                    const def = Utils.generateDefaultArt(t.title);
                    const artHtml = t.source === 'machhar-online' && t.artworkUrl
                        ? `<img src="${Utils.escapeHTML(t.artworkUrl)}" class="track-art-small" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${def}';">`
                        : (State.showArtworkLists ? `<img src="${def}" data-art-id="${t.artworkId||''}" data-seed="${Utils.escapeHTML(t.title)}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';">` : `<div class="track-art-small art-placeholder" style="background-image:url('${def}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">music_note</span></div>`);
                    return `<div class="track-row" data-action="play-queue-index" data-index="${i}" data-queue-index="${i}">
                        <div style="cursor: grab; margin-right: 8px; color: var(--text-tertiary); touch-action:none; user-select:none;" class="drag-handle" role="button" aria-label="Reorder queue item" tabindex="0"><span class="material-symbols-rounded" style="pointer-events:none;">drag_indicator</span></div>
                        ${artHtml}
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(t.title)}</div><div class="item-subtitle">${Utils.escapeHTML(t.artist)}</div></div>
                        <div class="queue-mobile-controls">
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="up" ${i===0?'disabled':''} aria-label="Move up"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_up</span></button>
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="down" ${i===State.playbackOrder.length-1?'disabled':''} aria-label="Move down"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_down</span></button>
                            ${!isP ? `<button class="icon-btn" data-action="remove-queue" data-index="${i}" aria-label="Remove from queue"><span class="material-symbols-rounded" style="font-size: 20px; pointer-events:none;">close</span></button>` : ''}
                        </div>
                    </div>`;
                }).join('');
                UI.lazyLoadArtwork(); UI.setupQueueDragAndDrop();
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
            updatePlayerMeta: async (t) => {
                if(!t) return;
                const reqId = ++State.artworkRequestId;
                
                document.getElementById('mini-title').innerText = t.title; document.getElementById('mini-artist').innerText = t.artist; 
                document.getElementById('full-title').innerText = t.title; document.getElementById('full-artist').innerText = t.artist;
                
                const favBtn = document.getElementById('fav-btn'); const isF = OnlineMusic?.isOnlineTrack?.(t) ? Boolean(window.OnlineWorkspace?.isFavorite?.(t.id)) : State.favorites.includes(t.id);
                favBtn.innerHTML = `<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${isF?1:0}; color: ${isF?'var(--accent-color)':'inherit'};">favorite</span>`;
                
                clearTimeout(State.lyricsTimeout);
                const lyricsContent = document.getElementById('lyrics-content');
                State.currentLyrics = null; State.activeLyricIndex = -1;
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                lyricsContent.innerHTML = State.isLyricsMode ? `<div style="text-align:center; font-size: 16px; font-weight: 400; color: var(--text-secondary); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Loading lyrics...</div>` : '';
                
                let artUrl = await ArtworkCache.getUrl(t);
                if (reqId !== State.artworkRequestId) return;
                
                document.getElementById('mini-art').src = artUrl; document.getElementById('full-art').src = artUrl;
                document.getElementById('desktop-lyrics-art').src = artUrl;
                
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
                const icon = State.isPlaying ? 'pause' : 'play_arrow';
                document.getElementById('mini-play-btn').innerText = icon; document.getElementById('full-play-btn').innerText = icon;
                const art = document.getElementById('player-art-container');
                if(State.isPlaying) art.classList.remove('paused'); else art.classList.add('paused');
            },
            updateProgress: () => {
                const p = State.duration > 0 ? Math.max(0, Math.min(100, (State.currentTime / State.duration) * 100)) : 0;
                document.getElementById('mini-progress').style.width = `${p}%`; document.getElementById('full-progress').style.width = `${p}%`;
                document.getElementById('scrubber-thumb').style.left = `${p}%`; document.getElementById('time-current').innerText = Utils.formatTime(State.currentTime);
                if (!State.isPlaying && State.visualizerMode === 'wave') AudioAdapter.renderScrubberVisualizerFrame();
            },
            updateDuration: () => { document.getElementById('time-total').innerText = Utils.formatTime(State.duration); },
        });
