/* Copyright mujic@royverse69 */
/* Mujic UI module: listening history sheet. Extends the UI object defined in ui.js. */
        Object.assign(UI, {
            renderHistoryContent: (sheet, restoreScroll = 0) => {
                const events = State.playHistory.length ? State.playHistory : State.history.map(id => { const t=State.library.find(x=>x.id===id); return t ? {trackId:id,title:t.title,artist:t.artist,album:t.album,playedAt:null}:null; }).filter(Boolean);
                const list = sheet.querySelector('#history-list');
                list.innerHTML = events.length ? events.map(ev => {
                    const t=State.library.find(x=>x.id===ev.trackId); const title=ev.title||t?.title||'Unknown track'; const artist=ev.artist||t?.artist||'Unknown Artist';
                    const art=Utils.generateDefaultArt(title); const subtitle=ev.playedAt ? new Date(ev.playedAt).toLocaleString() : 'From listening history';
                    return `<div class="track-row" ${t?`data-action="play-track" data-id="${Utils.escapeHTML(t.id)}" data-context="library"`:''}>
                        <img class="track-art-small lazy-art" src="${art}" data-seed="${Utils.escapeHTML(title)}" ${t?.artworkId?`data-art-id="${t.artworkId}"`:''} alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${art}';">
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(title)}</div><div class="item-subtitle">${Utils.escapeHTML(artist)} · ${Utils.escapeHTML(subtitle)}</div></div>
                        ${t?'<span class="material-symbols-rounded">play_arrow</span>':''}</div>`;
                }).join('') : '<div class="empty-state"><div class="empty-desc">Your listening history will appear here.</div></div>';
                const more = sheet.querySelector('#history-load-more');
                if (more) { more.hidden = !State.playHistoryHasMore; more.disabled = !!State.playHistoryLoading; more.textContent = State.playHistoryLoading ? 'Loading…' : 'Load older history'; }
                sheet.scrollTop = restoreScroll;
                UI.lazyLoadArtwork();
            },
            showHistorySheet: () => {
                let sheet=document.getElementById('history-sheet');
                if(!sheet){
                    sheet=document.createElement('div'); sheet.id='history-sheet'; sheet.className='bottom-sheet glass-surface';
                    sheet.innerHTML='<div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Listening History</div></div><div id="history-list" class="track-list"></div><button type="button" id="history-load-more" class="btn" data-action="load-older-history" style="width:100%;margin-top:12px;">Load older history</button>';
                    document.body.appendChild(sheet);
                }
                UI.renderHistoryContent(sheet, 0);
                UI.showSheet('history-sheet');
            },
            loadOlderHistory: async () => {
                if (State.playHistoryLoading || !State.playHistoryHasMore) return;
                State.playHistoryLoading = true;
                const sheet = document.getElementById('history-sheet'); if (!sheet) { State.playHistoryLoading = false; return; }
                const beforeScroll = sheet.scrollTop; UI.renderHistoryContent(sheet, beforeScroll);
                try {
                    const batch = await StorageAdapter.getRecentPlayHistory(151, State.playHistoryOffset || State.playHistory.length);
                    const older = batch.slice(0, 150);
                    if (older.length) {
                        State.playHistory.push(...older);
                        State.playHistoryOffset = (Number(State.playHistoryOffset) || 0) + older.length;
                    }
                    State.playHistoryHasMore = batch.length > 150;
                } catch (e) {
                    UI.showToast('Could not load older history.', 'error');
                } finally {
                    State.playHistoryLoading = false;
                    UI.renderHistoryContent(sheet, beforeScroll);
                }
            },
        });
