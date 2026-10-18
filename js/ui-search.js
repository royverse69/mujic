/* Copyright mujic@royverse69 */
        Object.assign(UI, {
            handleSearch: Utils.debounce((e) => {
                const q = String(e.target.value || '').trim(); const c = document.getElementById('search-results');
                if (State.playbackSourceMode === 'online') { OnlineMusic.searchAndRender(q); return; }
                const localQ = q.toLowerCase();
                if(!q) { 
                    State.searchResults = []; 
                    if (State.history && State.history.length > 0) {
                        State.searchResults = State.history.slice(0, 10).map(id => State.library.find(x => x.id === id)).filter(Boolean);
                        const rhHtml = `<div class="section-title" style="padding: 0 16px;">Recently Played</div><div class="track-list">` + State.searchResults.map(t => UI.buildTrackRow(t, 'search')).join('') + `</div>`;
                        c.innerHTML = rhHtml; UI.lazyLoadArtwork();
                    } else { c.innerHTML = '<div class="empty-state"><div class="empty-desc">Search your local library.</div></div>'; }
                    return; 
                }

                const songs = State.library.filter(t =>
                    (t.title && t.title.toLowerCase().includes(localQ)) || (t.artist && t.artist.toLowerCase().includes(localQ)) ||
                    (t.album && t.album.toLowerCase().includes(localQ)) || (t.fileName && t.fileName.toLowerCase().includes(localQ)) ||
                    (t.albumArtist && t.albumArtist.toLowerCase().includes(localQ)) || (t.composer && t.composer.toLowerCase().includes(localQ)) ||
                    (t.genre && t.genre.toLowerCase().includes(localQ)) || (t.year && String(t.year).includes(localQ))
                );
                State.searchResults = songs;

                const artists = new Map(); const albums = new Map();
                State.library.forEach(t => {
                    const artist = t.albumArtist || t.artist || '';
                    if (artist && artist.toLowerCase().includes(localQ) && !artists.has(artist)) artists.set(artist, t);
                    const albumKey = `${t.album || ''}||${artist}`;
                    if (t.album && (t.album.toLowerCase().includes(localQ) || artist.toLowerCase().includes(localQ)) && !albums.has(albumKey)) albums.set(albumKey, {name:t.album, artist, track:t});
                });
                const playlists = State.playlists.filter(p => p.name && p.name.toLowerCase().includes(localQ));

                let htmlOut = '';
                if (artists.size) htmlOut += `<div class="section-title" style="padding:0 16px;">Artists</div><div class="track-list">${[...artists.entries()].map(([name,t]) => { const def=Utils.generateDefaultArt(t.title); return `<div class="track-row" data-action="open-artist" data-key1="${Utils.escapeHTML(name)}"><img src="${def}" data-art-id="${t.artworkId||''}" class="track-art-small lazy-art" style="border-radius:50%;" onerror="this.onerror=null; this.src='${def}';"><div class="track-meta"><div class="item-title">${Utils.escapeHTML(name)}</div><div class="item-subtitle">${State.library.filter(x=>(x.albumArtist||x.artist)===name).length} tracks</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`; }).join('')}</div>`;
                if (albums.size) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Albums</div><div class="track-list">${[...albums.values()].map(a => { const def=Utils.generateDefaultArt(a.track.title); return `<div class="track-row" data-action="open-album" data-key1="${Utils.escapeHTML(a.name)}" data-key2="${Utils.escapeHTML(a.artist)}"><img src="${def}" data-art-id="${a.track.artworkId||''}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';"><div class="track-meta"><div class="item-title">${Utils.escapeHTML(a.name)}</div><div class="item-subtitle">${Utils.escapeHTML(a.artist)}</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`; }).join('')}</div>`;
                if (playlists.length) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Playlists</div><div class="track-list">${playlists.map(p => `<div class="track-row" data-action="open-playlist" data-key1="${Utils.escapeHTML(p.id)}"><div class="track-art-small art-placeholder" style="background-image:url('${Utils.defaultArt}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">queue_music</span></div><div class="track-meta"><div class="item-title">${Utils.escapeHTML(p.name)}</div><div class="item-subtitle">${p.tracks.length} tracks</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`).join('')}</div>`;
                if (songs.length) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Songs</div><div class="track-list">${songs.map(t => UI.buildTrackRow(t, 'search')).join('')}</div>`;
                c.innerHTML = htmlOut || `<div class="search-no-results"><div class="empty-title">No matching songs found</div><div class="empty-desc">Mujic couldn't find “${Utils.escapeHTML(e.target.value || '')}” in your local library.</div><button type="button" class="btn btn-primary search-download-cta" data-action="find-music-online">Find more music <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span></button></div>`;
                UI.lazyLoadArtwork();
            }, 300),
        });
