/* Mujic UI module: lyrics display and modes. Extends the UI object defined in ui.js. */
        Object.assign(UI, {
            syncLyrics: (time) => {
                if(!State.currentLyrics || !State.currentLyrics.isSynced) return;
                const lines = State.currentLyrics.parsed; if (!lines || !lines.length) return;
                
                let idx = -1;
                for (let i = 0; i < lines.length; i++) {
                    if (time + (Number(State.lyricsTimingOffset) || 0) >= lines[i].time - 0.3) idx = i; else break;
                }
                
                if (idx !== State.activeLyricIndex) {
                    State.activeLyricIndex = idx;
                    const container = document.getElementById('lyrics-content');
                    container.querySelectorAll('.lyric-line.active').forEach(el => el.classList.remove('active'));
                    if (idx !== -1) {
                        const activeEl = document.getElementById(`lyric-line-${idx}`);
                        if (activeEl) {
                            activeEl.classList.add('active');
                            const offset = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
                            container.scrollTo({ top: offset, behavior: 'smooth' });
                        }
                    }
                }
            },
            loadCurrentLyrics: async () => {
                if (!State.isLyricsMode) return;
                const t = Player.getCurrentTrack(); if (!t) return;
                const lyricsContent = document.getElementById('lyrics-content');
                clearTimeout(State.lyricsTimeout);
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                lyricsContent.innerHTML = `<div style="text-align:center; font-size: 16px; font-weight: 400; color: var(--text-secondary); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Loading lyrics...</div>`;
                State.currentLyrics = null; State.activeLyricIndex = -1;
                // Bound the full provider chain so a slow/offline provider cannot leave the lyrics UI stuck loading.
                State.lyricsTimeout = setTimeout(() => {
                    if (State.isLyricsMode && State.currentTrackId === t.id && !State.currentLyrics) {
                        UI.toggleLyricsMode();
                        UI.showToast('Lyrics could not be loaded. Check your connection and try again.', 'lyrics');
                    }
                }, t.source === 'machhar-online' ? 14000 : 5000);
                let lyricsData;
                try { lyricsData = await LyricsFetcher.getLyrics(t); }
                catch (e) { lyricsData = { text: "Lyrics unavailable offline.", isSynced: false, unavailable: true }; }
                if (!State.isLyricsMode || State.currentTrackId !== t.id) return;
                clearTimeout(State.lyricsTimeout); State.lyricsTimeout = null;
                State.currentLyrics = lyricsData;
                if (!lyricsData.isSynced) {
                    lyricsContent.classList.add('un-synced');
                    if (lyricsData.unavailable) {
                        const q = encodeURIComponent(`${t.title} ${t.artist} lyrics`);
                        const detailsQ = encodeURIComponent(`${t.title} ${t.artist} ${t.album || ''}`);
                        lyricsContent.innerHTML = `<div class="lyrics-unavailable-card">
                            <div class="lyrics-unavailable-title">Lyrics unavailable</div>
                            <div class="lyrics-unavailable-text">${navigator.onLine ? 'No verified lyrics source matched this track.' : 'You are offline. Online lyrics need a connection.'}</div>
                            <div class="lyrics-unavailable-actions">
                                <button class="btn" data-action="check-lyrics-cache" data-id="${Utils.escapeHTML(t.id)}">Check cache</button>
                                <a class="btn" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener noreferrer">Search lyrics on Google</a>
                                <a class="btn" href="https://www.google.com/search?q=${detailsQ}" target="_blank" rel="noopener noreferrer">Song details</a>
                            </div>
                        </div>`;
                        // Close an unavailable lyrics panel after five seconds so it never stays as an empty view.
                        clearTimeout(State.lyricsTimeout);
                        State.lyricsTimeout = setTimeout(() => {
                            if (State.isLyricsMode && State.currentTrackId === t.id && State.currentLyrics?.unavailable) {
                                UI.toggleLyricsMode();
                                UI.showToast('No lyrics were found. Lyrics view closed.', 'lyrics');
                            }
                        }, 5000);
                    } else {
                        lyricsContent.innerHTML = Utils.escapeHTML(lyricsData.text);
                    }
                } else {
                    lyricsContent.innerHTML = lyricsData.parsed.map((line, i) => `<div class="lyric-line" id="lyric-line-${i}" data-time="${line.time}" data-action="seek-lyric">${Utils.escapeHTML(line.text)}</div>`).join('');
                    UI.syncLyrics(State.currentTime);
                }
            },
            toggleLyricsMode: () => {
                State.isLyricsMode = !State.isLyricsMode;
                if (State.isLyricsMode) {
                    document.body.classList.add('lyrics-mode');
                    document.getElementById('lyrics-btn').classList.add('active-state');
                    UI.loadCurrentLyrics();
                    setTimeout(() => UI.syncLyrics(State.currentTime), 100); 
                } else {
                    clearTimeout(State.lyricsTimeout);
                    document.body.classList.remove('lyrics-mode');
                    document.body.classList.remove('immersive-lyrics');
                    document.getElementById('lyrics-btn').classList.remove('active-state');
                    const btn = document.querySelector('.immersive-btn');
                    if(btn) btn.innerHTML = `<span class="material-symbols-rounded">fullscreen</span>`;
                }
                StorageAdapter.saveSettings();
            },
            toggleImmersiveLyrics: () => {
                if (!State.isLyricsMode) {
                    UI.toggleLyricsMode();
                }
                const isImm = document.body.classList.toggle('immersive-lyrics');
                const btn = document.querySelector('.immersive-btn');
                if(btn) btn.innerHTML = `<span class="material-symbols-rounded">${isImm ? 'fullscreen_exit' : 'fullscreen'}</span>`;
                
                const moreImmBtnSpan = document.querySelector('#more-immersive-lyrics-text');
                if(moreImmBtnSpan) moreImmBtnSpan.innerText = isImm ? 'Exit Immersive Lyrics' : 'Immersive Lyrics';
                const moreImmIconSpan = document.querySelector('#more-immersive-lyrics-icon');
                if(moreImmIconSpan) moreImmIconSpan.innerText = isImm ? 'fullscreen_exit' : 'fullscreen';

                setTimeout(() => UI.syncLyrics(State.currentTime), 100);
                UI.closeSheets();
            },
        });
