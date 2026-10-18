/* Copyright mujic@royverse69 */
/* Mujic library layer: import, metadata, playlists and persistence-facing library operations. */
        const Library = {
            importFiles: async (e, targetPlaylistId = null) => {
                const files = e.target.files; if (files.length === 0) return;
                const importTarget = targetPlaylistId || State.playlistImportTargetId || null;
                const targetPlaylist = importTarget ? State.playlists.find(p => p.id === importTarget) : null;
                UI.showToast(`Importing ${files.length} tracks...`, "hourglass_empty");
                let addedCount = 0;
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const ext = Utils.getAudioExtension(file.name);
                    const commonAudio = new Set(['mp3','m4a','aac','flac','wav','ogg','oga','opus','webm','aiff','aif','alac']);
                    if (!(String(file.type || '').toLowerCase().startsWith('audio/') || commonAudio.has(ext))) continue;
                    const fingerprint = await Library.fingerprint(file);
                    const exists = await Library.findDuplicate(file, fingerprint);
                    if (exists) { 
                        await StorageAdapter.saveAudioBlob(exists.id, file);
                        const restoredBlob = await StorageAdapter.getAudioBlob(exists.id);
                        if (!restoredBlob || !(restoredBlob.size > 0)) { UI.showToast(`Could not cache ${file.name} for offline use`, 'error'); continue; }
                        if (targetPlaylist && !targetPlaylist.tracks.includes(exists.id)) targetPlaylist.tracks.push(exists.id);
                        continue; 
                    }
                    try {
                        const parsed = await Library.parseMetadata(file);
                        const trackId = Utils.id(); let artId = null;
                        if (parsed.pictureBlob) { artId = Utils.id(); await StorageAdapter.saveArtwork(artId, parsed.pictureBlob); }
                        
                        let title = parsed.title;
                        let artist = parsed.artist;
                        if (!title) {
                            const cleanName = file.name.replace(/\.[^/.]+$/, "");
                            const parts = cleanName.split(' - ');
                            if (parts.length > 1) { artist = parts[0].trim(); title = parts[1].trim(); } 
                            else { title = cleanName; }
                        }

                        // Only attempt metadata completion when the artist is genuinely missing.
                        // Never attach a fuzzy result based only on the first search hit. Require exact normalized title + duration match.
                        if (title && !artist && navigator.onLine) {
                            try {
                                const backend = 'https://gaana-suno-varna-machhar-aajayega.onrender.com/';
                                const endpoint = `${backend}lyrics?track=${encodeURIComponent(title)}&artist=`;
                                const res = await LyricsFetcher.fetchWithTimeout(endpoint, 5000, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'omit' });
                                if (res.ok) {
                                    const result = await res.json();
                                    const resultTitle = result?.trackName || result?.title || result?.name || '';
                                    const normalizedWanted = LyricsFetcher.normalizeTitle(title);
                                    const normalizedResult = LyricsFetcher.normalizeTitle(resultTitle);
                                    if (normalizedResult && normalizedWanted === normalizedResult) {
                                        artist = result.artistName || result.artist || artist;
                                        parsed.album = parsed.album || result.albumName || result.album || null;
                                    }
                                }
                            } catch (e) { Utils.warn(e); }
                        }

                        const t = {
                            id: trackId, fileName: file.name, format: Utils.getAudioExtension(file.name), mimeType: file.type || '', fileSize: file.size,
                            title: title || "Unknown Title", artist: artist || "Unknown Artist",
                            album: parsed.album || "Unknown Album", albumArtist: parsed.albumArtist || null, genre: parsed.genre || null,
                            year: parsed.year || null, trackNumber: parsed.trackNumber || null, discNumber: parsed.discNumber || null,
                            composer: parsed.composer || null, lyrics: parsed.lyrics || null, artworkId: artId, pictureType: parsed.pictureType,
                            duration: 0, dateAdded: Date.now(), contentHash: fingerprint || null
                        };
                        await StorageAdapter.saveTrackMeta(t);
                        await StorageAdapter.saveAudioBlob(trackId, file);
                        const savedBlob = await StorageAdapter.getAudioBlob(trackId);
                        if (!savedBlob || !(savedBlob.size > 0)) { await StorageAdapter.deleteTrack(trackId); throw new Error('Audio could not be stored for offline playback'); }
                        State.library.push(t);
                        if (targetPlaylist && !targetPlaylist.tracks.includes(trackId)) targetPlaylist.tracks.push(trackId);
                        addedCount++;
                    } catch(err) { console.error("Failed to parse file", file.name, err); }
                }
                if (targetPlaylist) await StorageAdapter.savePlaylist(targetPlaylist);
                Library.sortLibrary(); UI.renderLibrary(); UI.renderHome(); UI.updateLibraryStorageStats();
                if (targetPlaylist && State.currentPlaylistId === targetPlaylist.id) UI.refreshPlaylistDetail(targetPlaylist.id);
                State.playlistImportTargetId = null;
                UI.showToast(targetPlaylist ? `Imported ${addedCount} tracks to ${targetPlaylist.name}` : `Imported ${addedCount} tracks`, "check_circle"); e.target.value = ''; 
            },
            // Cheap content fingerprint: size + SHA-256 of the first, middle and last 64 KB.
            // Reads ~192 KB per file instead of hashing whole (possibly 100 MB+) FLAC files.
            fingerprint: async (blob) => {
                try {
                    if (!blob || !(globalThis.crypto && crypto.subtle)) return null;
                    const CH = 65536, size = blob.size; if (!size) return null;
                    const parts = [blob.slice(0, CH)];
                    if (size > CH * 3) parts.push(blob.slice(Math.floor(size / 2) - CH / 2, Math.floor(size / 2) + CH / 2));
                    if (size > CH * 2) parts.push(blob.slice(size - CH));
                    const digest = await crypto.subtle.digest('SHA-256', await new Blob(parts).arrayBuffer());
                    return size + ':' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (err) { Utils.warn(err); return null; }
            },
            // Only files with the same byte size can be duplicates, so hashing of stored legacy tracks is lazy.
            findDuplicate: async (file, fingerprint) => {
                const sameSize = State.library.filter(t => t.fileSize === file.size);
                if (!sameSize.length) return null;
                if (!fingerprint) return sameSize.find(t => t.fileName === file.name) || null;
                for (const t of sameSize) {
                    if (!t.contentHash) {
                        try {
                            const blob = await StorageAdapter.getAudioBlob(t.id);
                            if (blob && blob.size > 0) { t.contentHash = await Library.fingerprint(blob); if (t.contentHash) await StorageAdapter.saveTrackMeta(t); }
                        } catch (err) { Utils.warn(err); }
                    }
                    if (t.contentHash) { if (t.contentHash === fingerprint) return t; }
                    else if (t.fileName === file.name) return t; // cannot verify: keep the old name+size rule
                }
                return null;
            },
            parseMetadata: (file) => {
                return new Promise(async (resolve) => {
                    if (!window.musicMetadata && !window.jsmediatags && window.MujicVendors?.ensure) {
                        try { await window.MujicVendors.ensure(); } catch(e) { /* offline: fall back to filename-derived metadata */ }
                    }
                    if (window.musicMetadata) {
                        try {
                            const metadata = await window.musicMetadata.parseBlob(file);
                            const t = metadata.common;
                            let pictureBlob = null; let pictureType = 'image/jpeg';
                            if (t.picture && t.picture.length > 0) {
                                pictureType = t.picture[0].format;
                                pictureBlob = new Blob([t.picture[0].data], {type: pictureType});
                            }
                            return resolve({
                                title: t.title, artist: t.artist, album: t.album, albumArtist: t.albumartist,
                                genre: t.genre ? t.genre[0] : null, year: t.year, trackNumber: t.track.no, discNumber: t.disk.no,
                                composer: t.composer ? t.composer[0] : null, lyrics: t.lyrics ? t.lyrics[0] : null,
                                duration: Number(metadata.format?.duration) || 0, pictureBlob: pictureBlob, pictureType: pictureType
                            });
                        } catch (e) {
                            console.warn("music-metadata fallback to jsmediatags", e);
                        }
                    }

                    if (!window.jsmediatags) return resolve({});
                    jsmediatags.read(file, {
                        onSuccess: (tag) => {
                            const t = tag.tags; let pictureBlob = null; let pictureType = 'image/jpeg';
                            if (t.picture && t.picture.data) {
                                try {
                                    const arr = new Uint8Array(t.picture.data); pictureType = t.picture.format || 'image/jpeg';
                                    pictureBlob = new Blob([arr], {type: pictureType});
                                } catch (e) {
                                    console.warn("Could not extract artwork arraybuffer");
                                }
                            }
                            let trackNumber = null, discNumber = null;
                            if(t.track) { const parts = String(t.track).split('/'); trackNumber = parseInt(parts[0], 10) || null; }
                            if(t.TPAK || t.TPOS) { const d = t.TPAK || t.TPOS; const parts = String(d.data || d).split('/'); discNumber = parseInt(parts[0], 10) || null; }
                            resolve({
                                title: t.title, artist: t.artist, album: t.album, albumArtist: t.TPE2 ? t.TPE2.data : null,
                                genre: t.genre, year: t.year, trackNumber: trackNumber, discNumber: discNumber,
                                composer: t.TCOM ? t.TCOM.data : null, lyrics: t.lyrics ? t.lyrics.lyrics : null,
                                duration: 0, pictureBlob: pictureBlob, pictureType: pictureType
                            });
                        },
                        onError: (error) => { console.warn("Parse error for", file.name, error); resolve({}); }
                    });
                });
            },
            sortLibrary: () => {
                const sortFields = {
                    'title': t => (t.title||'').toLowerCase(), 'artist': t => (t.artist||'').toLowerCase(),
                    'album': t => (t.album||'').toLowerCase(), 'dateAdded': t => t.dateAdded || 0
                };
                const fn = sortFields[State.librarySort] || sortFields['dateAdded']; const dir = State.librarySortDir === 'desc' ? -1 : 1;
                State.library.sort((a,b) => { let va = fn(a), vb = fn(b); if (va < vb) return -1 * dir; if (va > vb) return 1 * dir; return 0; });
            },
            removeTrack: async (id) => {
                const removed = State.library.find(t => t.id === id);
                State.library = State.library.filter(t => t.id !== id); State.favorites = State.favorites.filter(fid => fid !== id);
                State.history = State.history.filter(fid => fid !== id); State.queue = State.queue.filter(fid => fid !== id);
                const poIndex = State.playbackOrder.indexOf(id); if (poIndex > -1) State.playbackOrder.splice(poIndex, 1);
                
                if (id === State.currentTrackId) {
                    Player.pause(); State.currentTrackId = null; State.queueIndex = -1;
                    document.getElementById('mini-player').classList.remove('visible'); UI.closeFullPlayer();
                } else if (poIndex > -1 && poIndex < State.queueIndex) { State.queueIndex--; }
                
                State.playlists.forEach(p => { p.tracks = p.tracks.filter(tid => tid !== id); });
                await StorageAdapter.deleteTrack(id);
                LyricsFetcher.cache.delete(id);
                // Drop the cover only when no remaining track shares it.
                if (removed?.artworkId && !State.library.some(t => t.artworkId === removed.artworkId)) {
                    await StorageAdapter.deleteArtwork(removed.artworkId);
                    const url = State.artworkUrls.get(removed.artworkId);
                    if (url) { URL.revokeObjectURL(url); State.artworkUrls.delete(removed.artworkId); }
                }
                StorageAdapter.saveSettings();
                State.playlists.forEach(p => StorageAdapter.savePlaylist(p));

                UI.updateHighlights(true); UI.renderQueue(); UI.updateLibraryStorageStats(); UI.showToast("Removed from library", "delete"); UI.closeSheets();
            }
        };

        const Playlists = {
            promptCreate: async () => {
                const n = await Dialog.show({ type: 'prompt', title: 'New Playlist', confirmText: 'Create', defaultText: 'My Playlist' });
                if(n && n.trim()) {
                    const p = { id: Utils.id(), name: n.trim(), tracks: [], createdAt: Date.now(), order: State.playlists.length };
                    State.playlists.push(p); StorageAdapter.savePlaylist(p); UI.renderPlaylists(); UI.showToast("Playlist created", "playlist_add_check");
                }
            },
            promptCreateAndAdd: async () => {
                if (!State.actionTargetId) return;
                const n = await Dialog.show({ type: 'prompt', title: 'New Playlist', confirmText: 'Create', defaultText: 'My Playlist' });
                if(n && n.trim()) {
                    const p = { id: Utils.id(), name: n.trim(), tracks: [State.actionTargetId], createdAt: Date.now(), order: State.playlists.length };
                    State.playlists.push(p); StorageAdapter.savePlaylist(p); 
                    UI.renderPlaylists(); UI.showToast("Created and added", "playlist_add_check"); UI.closeSheets();
                }
            },
            addTrack: (pid) => {
                if (!State.actionTargetId) return;
                const p = State.playlists.find(x => x.id === pid);
                if(p && !p.tracks.includes(State.actionTargetId)) { 
                    p.tracks.push(State.actionTargetId); StorageAdapter.savePlaylist(p); UI.showToast("Added to playlist", "playlist_add_check"); 
                }
                UI.closeSheets();
            },
            rename: async (pid) => {
                const p = State.playlists.find(x => x.id === pid); if(!p) return;
                const n = await Dialog.show({ type:'prompt', title:'Rename Playlist', confirmText:'Save', defaultText:p.name });
                if (n && n.trim()) {
                    p.name = n.trim(); await StorageAdapter.savePlaylist(p); UI.renderPlaylists();
                    if (State.currentPlaylistId === pid) { document.getElementById('detail-title').innerText = p.name; }
                    UI.showToast("Playlist renamed", "edit");
                }
            },
            delete: async (pid) => {
                const confirmed = await Dialog.show({ type: 'confirm', title: 'Delete Playlist', message: 'Are you sure you want to delete this playlist?', confirmText: 'Delete', destructive: true });
                if(!confirmed) return;
                State.playlists = State.playlists.filter(x => x.id !== pid).map((p,i) => ({...p, order:i}));
                await StorageAdapter.deletePlaylist(pid); State.playlists.forEach(p => StorageAdapter.savePlaylist(p));
                UI.renderPlaylists(); UI.showToast("Playlist deleted", "delete");
            },
            removeTrack: async (pid, index) => {
                const p = State.playlists.find(x => x.id === pid); if(!p || index < 0 || index >= p.tracks.length) return;
                p.tracks.splice(index, 1); await StorageAdapter.savePlaylist(p);
                if (State.currentPlaylistId === pid) UI.refreshPlaylistDetail(pid);
                UI.renderPlaylists(); UI.showToast("Removed from playlist", "remove");
            },
            moveTrack: async (pid, index, direction) => {
                const p = State.playlists.find(x => x.id === pid); if(!p) return;
                const to = direction === 'up' ? index - 1 : index + 1;
                if(index < 0 || to < 0 || to >= p.tracks.length) return;
                [p.tracks[index], p.tracks[to]] = [p.tracks[to], p.tracks[index]];
                await StorageAdapter.savePlaylist(p);
                if (State.currentPlaylistId === pid) UI.refreshPlaylistDetail(pid);
                UI.renderPlaylists();
            },
            movePlaylist: async (pid, direction) => {
                const from = State.playlists.findIndex(p => p.id === pid); if(from < 0) return;
                const to = direction === 'up' ? from - 1 : from + 1;
                if(to < 0 || to >= State.playlists.length) return;
                [State.playlists[from], State.playlists[to]] = [State.playlists[to], State.playlists[from]];
                State.playlists.forEach((p,i) => { p.order = i; StorageAdapter.savePlaylist(p); });
                UI.renderPlaylists();
            }
        };
