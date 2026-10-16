/* Mujic UI module: library rendering: home, albums, artists, playlists, context views, track rows, playlist actions. Extends the UI object defined in ui.js. */
        Object.assign(UI, {
            renderHome: async () => {
                if (State.library.length === 0) { 
                    document.getElementById('home-empty-state').style.display = 'block'; 
                    document.getElementById('home-content').style.display = 'none'; return; 
                }
                document.getElementById('home-empty-state').style.display = 'none'; 
                document.getElementById('home-content').style.display = 'block';
                
                const hour = new Date().getHours();
                let greeting = "Good evening"; if(hour < 12) greeting = "Good morning"; else if (hour < 18) greeting = "Good afternoon";
                document.getElementById('greeting-text').innerText = greeting;

                const rhPlaylists = document.getElementById('home-playlists-rail');
                const likedTrack = State.favorites.length > 0 ? State.library.find(t=>t.id===State.favorites[State.favorites.length-1]) : null;
                const likedArt = likedTrack ? await ArtworkCache.getUrl(likedTrack, likedTrack.title) : null;
                
                let plHtml = `
                    <div class="art-card" data-action="open-favorites">
                        <div class="art-wrapper" style="background: var(--bg-elevated);">
                            ${likedArt && likedArt !== Utils.defaultArt ? `<img src="${likedArt}" class="lazy-art" style="opacity:0.5;mix-blend-mode:overlay;">` : ''}
                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
                                <span class="material-symbols-rounded" style="color: white; font-size: 48px; font-variation-settings: 'FILL' 1;">favorite</span>
                            </div>
                        </div>
                        <div class="item-title">Liked Songs</div>
                        <div class="item-subtitle" id="home-liked-count">${State.favorites.length} tracks</div>
                    </div>`;
                
                for (const p of State.playlists) {
                    const t = p.tracks.length > 0 ? State.library.find(t=>t.id===p.tracks[p.tracks.length-1]) : null;
                    const artId = t ? t.artworkId : null;
                    const defaultBg = t ? Utils.generateDefaultArt(t.title) : Utils.defaultArt;
                    
                    plHtml += `
                    <div class="art-card playlist-longpress-target" data-action="open-playlist" data-key1="${Utils.escapeHTML(p.id)}" data-playlist-row="1">
                        <div class="art-wrapper" style="background: var(--bg-elevated); display:flex; align-items:center; justify-content:center;">
                            ${artId ? `<img src="${defaultBg}" data-art-id="${artId}" class="lazy-art" onerror="this.onerror=null; this.src='${defaultBg}';">` : '<span class="material-symbols-rounded" style="font-size:32px;">queue_music</span>'}
                        </div>
                        <div class="item-title">${Utils.escapeHTML(p.name)}</div>
                        <div class="item-subtitle">${p.tracks.length} tracks</div>
                    </div>`;
                }
                const favoriteArtists = [...new Set((State.favoriteArtists || []).map(name => String(name || '').trim()).filter(Boolean))]
                    .map(name => ({ name, tracks: State.library.filter(track => (track.albumArtist || track.artist || '') === name) }))
                    .filter(item => item.tracks.length > 0);
                for (const item of favoriteArtists) {
                    const artTrack = item.tracks.find(track => track.artworkId) || item.tracks[0];
                    const fallback = Utils.generateDefaultArt(artTrack?.title || item.name);
                    plHtml += `<div class="art-card favorite-artist-card" data-action="open-artist" data-key1="${Utils.escapeHTML(item.name)}">
                        <div class="art-wrapper"><img src="${fallback}" data-art-id="${artTrack?.artworkId || ''}" data-seed="${Utils.escapeHTML(item.name)}" class="lazy-art" alt="" onerror="this.onerror=null; this.src='${fallback}';"><span class="favorite-artist-mark material-symbols-rounded" aria-hidden="true">favorite</span></div>
                        <div class="item-title">${Utils.escapeHTML(item.name)}</div><div class="item-subtitle">${item.tracks.length} tracks</div>
                    </div>`;
                }
                rhPlaylists.innerHTML = plHtml;
                const collectionGrid = document.getElementById('home-collection-grid');
                if (collectionGrid) collectionGrid.classList.toggle('has-favorite-artists', favoriteArtists.length > 0);

                const topSection = document.getElementById('top-picks-section');
                const topRail = document.getElementById('home-top-picks-rail');
                const topCounts = {};
                const statDays = Object.values(State.playStats?.days || {});
                statDays.forEach(day => Object.entries(day?.tracks || {}).forEach(([id,n]) => topCounts[id] = (topCounts[id] || 0) + Number(n || 0)));
                const rankedTop = Object.entries(topCounts).sort((a,b)=>b[1]-a[1]).map(([id])=>State.library.find(t=>t.id===id)).filter(Boolean);
                const fallbackTop = State.history.map(id=>State.library.find(t=>t.id===id)).filter(Boolean);
                const picks = [];
                [...rankedTop, ...fallbackTop, ...State.library].forEach(t=>{ if(t && !picks.some(x=>x.id===t.id) && picks.length<6) picks.push(t); });
                if (picks.length) {
                    topSection.style.display = 'block';
                    topRail.innerHTML = picks.map((t,i)=>{
                        const def=Utils.generateDefaultArt(t.title);
                        const count=topCounts[t.id] || 0;
                        return `<div class="art-card top-pick-card" data-action="play-track" data-id="${t.id}" data-context="library">
                            <div class="art-wrapper"><img src="${def}" data-art-id="${t.artworkId||''}" data-seed="${Utils.escapeHTML(t.title)}" class="lazy-art" onerror="this.onerror=null; this.src='${def}';">${i<3?`<div class="top-pick-rank">#${i+1}</div>`:''}</div>
                            <div class="item-title">${Utils.escapeHTML(t.title)}</div>
                            <div class="item-subtitle">${Utils.escapeHTML(t.artist)}${count?` • ${count}`:''}</div>
                        </div>`;
                    }).join('');
                } else topSection.style.display='none';

                const homeTracks = [...State.library].sort((a,b) => (b.dateAdded||0) - (a.dateAdded||0)).slice(0, 10);
                document.getElementById('home-tracks').innerHTML = homeTracks.map(t => UI.buildTrackRow(t, 'home')).join('');
                UI.lazyLoadArtwork();
            },
            renderLibrary: () => {
                document.getElementById('library-stats').innerText = `${State.library.length} tracks`;
                document.getElementById('library-list').innerHTML = State.library.map(t => UI.buildTrackRow(t, 'library')).join('');
                UI.lazyLoadArtwork();
            },
            updateLibraryStorageStats: async () => {
                const el=document.getElementById('storage-stats'); if(!el)return;
                const metadataBytes=State.library.reduce((n,t)=>n+(Number(t.fileSize)||0),0);
                el.innerText=`${State.library.length} tracks • ${Utils.formatBytes(metadataBytes)}`;
                try {
                    const actual=await Promise.race([StorageAdapter.getBinaryStorageBytes(), new Promise((_,reject)=>setTimeout(()=>reject(new Error('stats timeout')),2500))]);
                    el.innerText=`${State.library.length} tracks • ${Utils.formatBytes(actual)}`;
                } catch (e) { Utils.warn(e); }
            },
            renderAlbums: () => {
                const map = {}; 
                State.library.forEach(t => { 
                    const key = (t.albumArtist || t.artist) + '||' + t.album;
                    if(!map[key]) map[key] = { name: t.album, artist: t.albumArtist || t.artist, artId: t.artworkId, tracks: [], refTitle: t.title }; 
                    map[key].tracks.push(t);
                    if(t.artworkId && !map[key].artId) map[key].artId = t.artworkId;
                });
                document.getElementById('lib-albums').innerHTML = Object.values(map).sort((a,b)=>a.name.localeCompare(b.name)).map(a => {
                    const def = Utils.generateDefaultArt(a.refTitle);
                    return `<div class="art-card" style="width:100%; max-width:none;" data-action="open-album" data-key1="${Utils.escapeHTML(a.name)}" data-key2="${Utils.escapeHTML(a.artist)}">
                        <div class="art-wrapper"><img src="${def}" data-art-id="${a.artId||''}" class="lazy-art" onerror="this.onerror=null; this.src='${def}';"></div>
                        <div class="item-title">${Utils.escapeHTML(a.name)}</div>
                        <div class="item-subtitle">${Utils.escapeHTML(a.artist)}</div>
                    </div>`;
                }).join('');
                UI.lazyLoadArtwork();
            },
            renderArtists: () => {
                const map = {}; 
                State.library.forEach(t => { 
                    const key = t.albumArtist || t.artist;
                    if(!map[key]) map[key] = { name: key, artId: t.artworkId, tracks: [], refTitle: t.title }; 
                    map[key].tracks.push(t); 
                    if(t.artworkId && !map[key].artId) map[key].artId = t.artworkId;
                });
                document.getElementById('lib-artists').innerHTML = Object.values(map).sort((a,b)=>a.name.localeCompare(b.name)).map(a => {
                    const def = Utils.generateDefaultArt(a.refTitle);
                    return `<div class="track-row" data-action="open-artist" data-key1="${Utils.escapeHTML(a.name)}">
                        <img src="${def}" data-art-id="${a.artId||''}" class="track-art-small lazy-art" style="border-radius: 50%;" onerror="this.onerror=null; this.src='${def}';">
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(a.name)}</div><div class="item-subtitle">${a.tracks.length} tracks</div></div>
                        <span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span>
                    </div>`;
                }).join('');
                UI.lazyLoadArtwork();
            },
            renderPlaylists: () => {
                document.getElementById('playlists-list').innerHTML = State.playlists.map((p, i) => 
                    `<div class="track-row playlist-longpress-target" data-action="open-playlist" data-key1="${Utils.escapeHTML(p.id)}" data-playlist-row="1">
                        <div class="track-art-small" style="background:var(--bg-hover); display:flex; align-items:center; justify-content:center;"><span class="material-symbols-rounded">queue_music</span></div>
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(p.name)}</div><div class="item-subtitle">${p.tracks.length} tracks</div></div>
                        <button class="icon-btn" data-action="move-playlist" data-key1="${p.id}" data-direction="up" ${i===0?'disabled':''} aria-label="Move playlist up"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_up</span></button>
                        <button class="icon-btn" data-action="move-playlist" data-key1="${p.id}" data-direction="down" ${i===State.playlists.length-1?'disabled':''} aria-label="Move playlist down"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_down</span></button>
                        <button class="icon-btn" data-action="rename-playlist" data-key1="${p.id}" aria-label="Rename playlist"><span class="material-symbols-rounded" style="pointer-events:none;">edit</span></button>
                        <button class="icon-btn" data-action="delete-playlist" data-key1="${p.id}" aria-label="Delete playlist"><span class="material-symbols-rounded" style="pointer-events:none;">delete</span></button>
                    </div>`
                ).join('');
            },
            openContextView: async (type, key1, key2) => {
                let tr = []; let title = ""; let subtitle = ""; let artId = null; let refTitle = "";
                
                if (type === 'album') {
                    tr = State.library.filter(t => t.album === key1 && (t.albumArtist || t.artist) === key2);
                    tr.sort((a,b) => (a.discNumber||1)-(b.discNumber||1) || (a.trackNumber||1)-(b.trackNumber||1));
                    title = key1; subtitle = key2; artId = tr[0]?.artworkId; refTitle = tr[0]?.title;
                } else if (type === 'artist') {
                    tr = State.library.filter(t => (t.albumArtist || t.artist) === key1);
                    title = key1; subtitle = `${tr.length} tracks`; artId = tr[0]?.artworkId; refTitle = tr[0]?.title;
                } else if (type === 'playlist') {
                    const p = State.playlists.find(x => String(x.id) === String(key1));
                    if (!p) { UI.showToast('This playlist no longer exists.', 'error'); return; }
                    tr = p.tracks.map(tid => State.library.find(t => t.id === tid)).filter(Boolean);
                    title = p.name; subtitle = `${tr.length} tracks`; artId = tr[0]?.artworkId; refTitle = tr[0]?.title || p.name;
                    key1 = p.id;
                } else if (type === 'favorites') {
                    tr = State.favorites.map(id => State.library.find(t => t.id === id)).filter(Boolean);
                    title = "Liked Songs"; subtitle = `${tr.length} tracks`; 
                    artId = tr.length > 0 ? tr[tr.length-1].artworkId : null; refTitle = tr.length > 0 ? tr[tr.length-1].title : "Liked";
                }
                
                if (!tr.length && type !== 'favorites' && type !== 'playlist') return;
                State.currentContextView = tr; State.currentContextType = type; State.currentPlaylistId = type === 'playlist' ? key1 : null;
                const detailView = document.getElementById('view-context-detail');
                if (detailView) { detailView.classList.remove('context-artist','context-album','context-playlist','context-favorites'); detailView.classList.add(`context-${type}`); }
                
                const artEl = document.getElementById('detail-art');
                const def = Utils.generateDefaultArt(refTitle || title || 'Mujic');
                artEl.onerror = () => { artEl.onerror = null; artEl.src = def; };
                artEl.removeAttribute('data-art-id');
                artEl.classList.remove('lazy-art');
                artEl.src = def;
                if (artId) {
                    artEl.dataset.artId = artId;
                    artEl.classList.add('lazy-art');
                }
                
                if (type === 'artist') {
                    const isFav = State.favoriteArtists && State.favoriteArtists.includes(key1);
                    const favIcon = `<button class="icon-btn" data-action="toggle-fav-artist" data-artist="${Utils.escapeHTML(key1)}" style="margin-left: 12px; margin-top: -4px;"><span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${isFav?1:0}; color: ${isFav?'var(--accent-color)':'inherit'};">favorite</span></button>`;
                    document.getElementById('detail-title').innerHTML = `<span>${Utils.escapeHTML(title)}</span>${favIcon}`;
                } else {
                    document.getElementById('detail-title').innerText = title;
                }

                document.getElementById('detail-subtitle').innerText = subtitle;
                document.getElementById('detail-tracks').innerHTML = tr.map((t, i) => type === 'playlist' ? UI.buildTrackRow(t, 'playlist', { playlistId:key1, playlistIndex:i, playlistLength:tr.length }) : UI.buildTrackRow(t, 'context')).join('');
                
                const cur = document.querySelector('.view.active'); 
                if (cur && cur.id !== 'view-context-detail') UI._prevView = cur.id.replace('view-', '');
                UI.switchView('context-detail'); UI.lazyLoadArtwork();
                UI.refreshPlaylistActions(State.currentPlaylistId);
            },
            buildTrackRow: (t, contextName, contextData = null) => {
                const isF = State.favorites.includes(t.id);
                const def = Utils.generateDefaultArt(t.title);
                const artHtml = State.showArtworkLists ? `<img src="${def}" data-art-id="${t.artworkId||''}" data-seed="${Utils.escapeHTML(t.title)}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';">` : `<div class="track-art-small art-placeholder" style="background-image:url('${def}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">music_note</span></div>`;
                const playlistControls = contextName === 'playlist' && contextData ? `
                    <button class="icon-btn" data-action="move-playlist-track" data-key1="${Utils.escapeHTML(contextData.playlistId)}" data-index="${contextData.playlistIndex}" data-direction="up" ${contextData.playlistIndex===0?'disabled':''} aria-label="Move track up"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_up</span></button>
                    <button class="icon-btn" data-action="move-playlist-track" data-key1="${Utils.escapeHTML(contextData.playlistId)}" data-index="${contextData.playlistIndex}" data-direction="down" ${contextData.playlistIndex===contextData.playlistLength-1?'disabled':''} aria-label="Move track down"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_down</span></button>
                    <button class="icon-btn" data-action="remove-from-playlist" data-key1="${Utils.escapeHTML(contextData.playlistId)}" data-index="${contextData.playlistIndex}" aria-label="Remove track from playlist"><span class="material-symbols-rounded" style="pointer-events:none;">remove_circle_outline</span></button>
                ` : `${isF ? '<span class="material-symbols-rounded" style="font-size:16px; margin-right:8px; color:var(--accent-color)">favorite</span>' : ''}<button class="icon-btn" data-action="track-options" data-id="${t.id}"><span class="material-symbols-rounded" style="pointer-events:none;">more_horiz</span></button>`;
                const homeLongPress = contextName === 'home' ? ' home-track-longpress-target' : '';
                return `<div class="track-row${homeLongPress}" data-action="play-track" data-id="${t.id}" data-context="${contextName}" data-longpress-track="${contextName === 'home' ? '1' : '0'}">
                    ${artHtml}
                    <div class="track-meta"><div class="item-title">${Utils.escapeHTML(t.title)}</div><div class="item-subtitle">${Utils.escapeHTML(t.artist)}</div></div>
                    ${playlistControls}
                </div>`;
            },
            lazyLoadArtwork: async () => {
                const imgs = [...document.querySelectorAll('.lazy-art')];
                await Promise.all(imgs.map(async img => {
                    const artId = img.dataset.artId; img.classList.remove('lazy-art');
                    img.loading = 'lazy'; img.decoding = 'async';
                    if (artId) { const url = await ArtworkCache.getUrl(artId, img.dataset.seed || ''); if (img.isConnected) img.src = url; } else if (img.dataset.seed) { img.src = Utils.generateDefaultArt(img.dataset.seed); }
                }));
            },
            updateHighlights: (refreshContent = false) => {
                const count = document.getElementById('home-liked-count');
                if (count) count.innerText = `${State.favorites.length} tracks`;
                if (refreshContent) {
                    const activeView = document.querySelector('.view.active');
                    if (activeView && activeView.id === 'view-home') UI.renderHome();
                    if (activeView && activeView.id === 'view-library') {
                        const activeLib = document.querySelector('.lib-tab-content.active');
                        if (activeLib && activeLib.id === 'lib-songs') UI.renderLibrary();
                    }
                    if (activeView && activeView.id === 'view-context-detail' && State.currentContextType !== 'playlist') {
                        document.getElementById('detail-tracks').innerHTML = State.currentContextView.map(t => UI.buildTrackRow(t, 'context')).join('');
                        UI.lazyLoadArtwork();
                    }
                }
            },
            openTrackOptions: async (id) => {
                State.actionTargetId = id; const track = State.library.find(t => t.id === id); if (!track) return;
                
                document.getElementById('ctx-title').innerText = track.title; document.getElementById('ctx-artist').innerText = track.artist;
                
                const def = Utils.generateDefaultArt(track.title);
                const artEl = document.getElementById('ctx-art');
                artEl.src = def;
                ArtworkCache.getUrl(track.artworkId).then(url => { if(url !== Utils.defaultArt) artEl.src = url; });
                
                const isF = State.favorites.includes(id);
                document.getElementById('ctx-fav-icon').innerText = isF ? 'favorite' : 'favorite_border';
                document.getElementById('ctx-fav-icon').style.color = isF ? 'var(--accent-color)' : 'inherit';
                document.getElementById('ctx-fav-text').innerText = isF ? 'Remove Favorite' : 'Favorite';
                
                document.getElementById('playlist-options-list').innerHTML = State.playlists.map(p => 
                    `<div class="sheet-option" data-action="add-to-playlist" data-key1="${p.id}"><span class="material-symbols-rounded">queue_music</span> ${Utils.escapeHTML(p.name)}</div>`
                ).join('');
                UI.showSheet('track-options-sheet');
            },
            openPlaylistActions: (pid) => {
                const p = State.playlists.find(x => x.id === pid); if (!p) return;
                State.playlistActionTargetId = pid;
                const title = document.getElementById('playlist-action-title'); if(title) title.innerText = p.name;
                const subtitle = document.getElementById('playlist-action-subtitle'); if(subtitle) subtitle.innerText = `${p.tracks.length} tracks`;
                UI.showSheet('playlist-actions-sheet');
            },
            openPlaylistTrackPicker: (pid) => {
                const playlist = State.playlists.find(item => item.id === pid);
                if (!playlist) { UI.showToast('Open a playlist first.', 'info'); return; }
                State.playlistImportTargetId = pid;
                const search = document.getElementById('playlist-track-picker-search');
                if (search) search.value = '';
                UI.renderPlaylistTrackPicker();
                // Close the previous sheet visually without starting an asynchronous history.back();
                // this avoids racing a pending popstate against the new picker sheet.
                UI.closeSheets(true);
                UI.showSheet('playlist-track-picker-sheet');
            },
            renderPlaylistTrackPicker: () => {
                const list = document.getElementById('playlist-track-picker-list');
                const status = document.getElementById('playlist-track-picker-status');
                const search = String(document.getElementById('playlist-track-picker-search')?.value || '').trim().toLocaleLowerCase();
                const playlist = State.playlists.find(item => item.id === State.playlistImportTargetId);
                if (!list || !playlist) return;
                const available = State.library.filter(track => !playlist.tracks.includes(track.id));
                const matches = available.filter(track => !search || [track.title, track.artist, track.album, track.fileName].some(value => String(value || '').toLocaleLowerCase().includes(search)));
                // Keep the initial picker lightweight on large libraries; searching narrows the list.
                const limit = search ? 300 : 120;
                const shown = matches.slice(0, limit);
                if (status) status.textContent = matches.length > limit ? `Showing ${limit} of ${matches.length} songs. Search to narrow the list.` : `${matches.length} song${matches.length === 1 ? '' : 's'} available`;
                if (!shown.length) {
                    const title = !State.library.length ? 'Your library is empty' : (available.length ? 'No matching songs' : 'All songs are already in this playlist');
                    const description = !State.library.length ? 'Add music to your Mujic library first, then choose tracks here.' : (available.length ? 'Try another title, artist, album or filename.' : 'Every song in your library is already in this playlist.');
                    list.innerHTML = `<div class="empty-state playlist-picker-empty"><div class="empty-title">${title}</div><div class="empty-desc">${description}</div></div>`;
                    return;
                }
                list.innerHTML = shown.map(track => `
                    <label class="playlist-select-row" data-song-search="${Utils.escapeHTML(`${track.title} ${track.artist} ${track.album || ''} ${track.fileName || ''}`.toLocaleLowerCase())}">
                        <input type="checkbox" class="playlist-track-checkbox" data-playlist-track-select="${Utils.escapeHTML(track.id)}">
                        <span class="material-symbols-rounded playlist-picker-note" aria-hidden="true">music_note</span>
                        <span class="track-meta"><span class="item-title">${Utils.escapeHTML(track.title || 'Unknown title')}</span><span class="item-subtitle">${Utils.escapeHTML(track.artist || 'Unknown artist')}${track.album && track.album !== 'Unknown Album' ? ` · ${Utils.escapeHTML(track.album)}` : ''}</span></span>
                    </label>`).join('');
            },
            savePlaylistTrackPicker: async () => {
                const pid = State.playlistImportTargetId;
                const playlist = State.playlists.find(item => item.id === pid);
                const list = document.getElementById('playlist-track-picker-list');
                if (!playlist || !list) { UI.showToast('Playlist no longer exists.', 'error'); UI.closeSheets(); return; }
                const selected = [...list.querySelectorAll('[data-playlist-track-select]:checked')].map(input => input.dataset.playlistTrackSelect).filter(id => State.library.some(track => track.id === id));
                const unique = selected.filter(id => !playlist.tracks.includes(id));
                if (!unique.length) { UI.showToast('Select at least one song to add.', 'info'); return; }
                playlist.tracks.push(...unique);
                await StorageAdapter.savePlaylist(playlist);
                if (State.currentPlaylistId === pid || (State.currentContextType === 'playlist' && State.currentPlaylistId === pid)) UI.refreshPlaylistDetail(pid);
                UI.renderPlaylists(); UI.renderHome();
                State.playlistImportTargetId = null;
                UI.closeSheets();
                UI.showToast(`Added ${unique.length} song${unique.length === 1 ? '' : 's'} to ${playlist.name}.`, 'playlist_add_check');
            },
            refreshPlaylistActions: (pid) => {
                const actions = document.getElementById('detail-context-actions'); if (!actions) return;
                const existing = actions.querySelector('[data-action="import-playlist-songs"]');
                if (State.currentContextType === 'playlist' && pid) {
                    if (!existing) actions.insertAdjacentHTML('beforeend','<button class="btn" data-action="import-playlist-songs">Add Songs</button>');
                } else if (existing) {
                    existing.remove();
                }
            },
            refreshPlaylistDetail: (pid) => {
                const p = State.playlists.find(x => x.id === pid); if (!p) return;
                State.currentContextView = p.tracks.map(tid => State.library.find(t => t.id === tid)).filter(Boolean);
                document.getElementById('detail-title').innerText = p.name;
                document.getElementById('detail-subtitle').innerText = `${State.currentContextView.length} tracks`;
                const first = State.currentContextView[0];
                const artEl = document.getElementById('detail-art');
                const def = Utils.generateDefaultArt(first?.title || p.name);
                artEl.src = def; artEl.removeAttribute('data-art-id'); artEl.classList.remove('lazy-art');
                if (first?.artworkId) { artEl.dataset.artId = first.artworkId; artEl.classList.add('lazy-art'); }
                document.getElementById('detail-tracks').innerHTML = State.currentContextView.map((t, i) => UI.buildTrackRow(t, 'playlist', { playlistId: pid, playlistIndex: i, playlistLength: State.currentContextView.length })).join('');
                UI.lazyLoadArtwork();
            },
        });
