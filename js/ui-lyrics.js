/* Copyright mujic@royverse69 */
        Object.assign(UI, {
            renderSyncedLyrics: (lyricsData = State.currentLyrics) => {
                const container = document.getElementById('lyrics-content');
                const lines = Array.isArray(lyricsData?.parsed) ? lyricsData.parsed : [];
                if (!container) return;
                if (!lines.length) {
                    container.replaceChildren();
                    State.activeLyricIndex = -1;
                    return;
                }
                const escape = value => Utils.escapeHTML(String(value ?? ''));
                const wordsFor = text => String(text || '').trim().match(/\S+/gu) || [];
                container.innerHTML = lines.map((line, index) => {
                    const words = wordsFor(line.text);
                    const content = State.lyricsWordByWord
                        ? words.map((word, wordIndex) => `<span class="lyric-word" data-word-index="${wordIndex}" data-word-weight="${UI.lyricWordWeight(word)}">${escape(word)}</span>`).join(' ')
                        : escape(line.text);
                    return `<div class="lyric-line${State.lyricsWordByWord ? ' lyric-wordwise' : ''}" id="lyric-line-${index}" data-line-index="${index}" data-time="${Number(line.time) || 0}" data-action="seek-lyric">${content}</div>`;
                }).join('');
                State.activeLyricIndex = -1;
                UI.syncLyrics(State.currentTime);
            },
            lyricWordWeight: word => {
                const value = String(word || '').toLocaleLowerCase();
                const letters = [...value].filter(char => /[\p{L}\p{N}]/u.test(char));
                if (!letters.length) return 0.65;
                // LRC has line timestamps, not word timestamps. Estimate relative spoken
                // duration from syllable groups for Latin text and grapheme groups for
                // other scripts instead of animating every word at an equal, rushed rate.
                const latin = /[a-z]/i.test(value);
                let units;
                if (latin) {
                    const groups = value.match(/[aeiouy]+/gi) || [];
                    units = Math.max(1, groups.length);
                    if (/[aeiouy][^aeiouy]e$/i.test(value) && units > 1) units -= 1;
                } else {
                    const count = letters.length;
                    units = Math.max(1, Math.ceil(count / 3.2));
                }
                let weight = 0.72 + Math.min(2.3, units * 0.42);
                if (/[.!?।॥…]$/u.test(value)) weight += 0.58;
                else if (/[,;:]$/u.test(value)) weight += 0.25;
                return Math.max(0.7, Math.min(3.6, weight));
            },
            syncLyrics: time => {
                if (!State.currentLyrics || !State.currentLyrics.isSynced) return;
                const lines = State.currentLyrics.parsed;
                if (!Array.isArray(lines) || !lines.length) return;
                const offset = Number(State.lyricsTimingOffset) || 0;
                const clock = Math.max(0, Number(time) + offset);
                let index = -1;
                // Use the exact LRC cue boundary. An early boundary (previously -0.3s)
                // cut the final word off every line before its next cue arrived.
                for (let i = 0; i < lines.length; i++) {
                    if (clock >= (Number(lines[i].time) || 0)) index = i;
                    else break;
                }
                const container = document.getElementById('lyrics-content');
                if (!container) return;
                const changed = index !== State.activeLyricIndex;
                if (changed) {
                    State.activeLyricIndex = index;
                    container.querySelectorAll('.lyric-line.active').forEach(node => node.classList.remove('active'));
                    if (State.lyricsWordByWord) {
                        // Finish previous lines completely, even when the user seeks forward.
                        container.querySelectorAll('.lyric-line.lyric-wordwise').forEach(node => {
                            const lineIndex = Number(node.dataset.lineIndex);
                            node.querySelectorAll('.lyric-word').forEach(word => {
                                word.classList.toggle('is-revealed', index >= 0 && lineIndex < index);
                            });
                        });
                    }
                    if (index >= 0) {
                        const active = document.getElementById(`lyric-line-${index}`);
                        if (active) {
                            active.classList.add('active');
                            // Center the cue inside the scrollport and clamp to a valid range.
                            const containerRect = container.getBoundingClientRect();
                            const activeRect = active.getBoundingClientRect();
                            const desired = container.scrollTop + activeRect.top - containerRect.top - (container.clientHeight - activeRect.height) / 2;
                            const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
                            const top = Math.max(0, Math.min(maxScroll, desired));
                            if (Math.abs(container.scrollTop - top) > 10) {
                                container.scrollTo({ top, behavior: document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth' });
                            }
                        }
                    }
                }
                if (!State.lyricsWordByWord || index < 0) return;
                const line = lines[index];
                const wordLine = document.getElementById(`lyric-line-${index}`);
                if (!wordLine) return;
                const words = [...wordLine.querySelectorAll('.lyric-word')];
                if (!words.length) return;
                const start = Math.max(0, Number(line.time) || 0);
                const nextTime = index + 1 < lines.length ? Number(lines[index + 1].time) : NaN;
                const gap = Number.isFinite(nextTime) && nextTime > start ? nextTime - start : 0;
                const weights = words.map(word => Math.max(0.7, Number(word.dataset.wordWeight) || UI.lyricWordWeight(word.textContent)));
                const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
                const estimate = Math.max(0.75, Math.min(7.5, totalWeight * 0.31 + words.length * 0.035));
                // Prefer a real line interval for fast phrases, but do not stretch a short
                // phrase across a long instrumental gap. Very rapid cues reveal together.
                const duration = gap > 0 ? Math.min(gap, estimate * 1.35) : estimate;
                const elapsed = Math.max(0, clock - start);
                const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / duration));
                const revealCount = gap > 0 && gap < 0.48
                    ? words.length
                    : progress >= 0.94 ? words.length : (() => {
                        let cumulative = 0;
                        let count = 0;
                        const target = progress * totalWeight;
                        for (const weight of weights) {
                            if (cumulative <= target + 0.02) count++;
                            cumulative += weight;
                        }
                        return Math.max(progress > 0 ? 1 : 0, Math.min(words.length, count));
                    })();
                words.forEach((word, wordIndex) => word.classList.toggle('is-revealed', wordIndex < revealCount));
            },
            loadCurrentLyrics: async () => {
                if (!State.isLyricsMode) return;
                const t = Player.getCurrentTrack(); if (!t) return;
                const lyricsContent = document.getElementById('lyrics-content');
                clearTimeout(State.lyricsTimeout);
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                lyricsContent.innerHTML = `<div style="text-align:center; font-size: 16px; font-weight: 400; color: var(--text-secondary); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Loading lyrics...</div>`;
                State.currentLyrics = null; State.activeLyricIndex = -1;
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
                    UI.renderSyncedLyrics(lyricsData);
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
