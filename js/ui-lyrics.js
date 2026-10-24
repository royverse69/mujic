/* Copyright mujic@royverse69 */
        // Precomputed timing models avoid allocating arrays and recalculating syllable weights
        // on every audio timeupdate (normally 4+ times per second).
        const lyricWordTimingCache = new WeakMap();
        const setLyricRevealCount = (model, requestedCount) => {
            if (!model) return;
            const count = Math.max(0, Math.min(model.words.length, Math.floor(Number(requestedCount) || 0)));
            const previous = model.revealCount;
            if (count === previous) return;
            if (count > previous) {
                for (let i = Math.max(0, previous); i < count; i++) model.words[i]?.classList.add('is-revealed');
            } else {
                for (let i = count; i < previous; i++) model.words[i]?.classList.remove('is-revealed');
            }
            model.revealCount = count;
        };
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
                if (State.lyricsWordByWord) {
                    const rows = container.querySelectorAll('.lyric-line.lyric-wordwise');
                    rows.forEach((row, index) => {
                        const words = Array.from(row.querySelectorAll('.lyric-word'));
                        const weights = words.map(word => Math.max(0.7, Number(word.dataset.wordWeight) || 0.7));
                        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
                        const start = Math.max(0, Number(lines[index]?.time) || 0);
                        const next = index + 1 < lines.length ? Number(lines[index + 1]?.time) : NaN;
                        const gap = Number.isFinite(next) && next > start ? next - start : 0;
                        const estimate = Math.max(0.75, Math.min(7.5, totalWeight * 0.31 + words.length * 0.035));
                        const duration = gap > 0 ? Math.min(gap, estimate * 1.35) : estimate;
                        lyricWordTimingCache.set(row, {words, weights, totalWeight, start, duration, gap, revealCount:0});
                    });
                }
                State.activeLyricIndex = -1;
                UI.syncLyrics(State.currentTime);
                window.LyricsShare?.refreshSelectionMarks();
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
                // Do not auto-scroll or animate word cues while the user is selecting/sharing
                // lyrics. Lyrics keep using the live playback clock; closeCard forces a resync.
                if (window.LyricsShare?.shouldPauseAutoFollow?.()) return;
                if (!State.currentLyrics || !State.currentLyrics.isSynced) return;
                const lines = State.currentLyrics.parsed;
                if (!Array.isArray(lines) || !lines.length) return;
                const offset = Number(State.lyricsTimingOffset) || 0;
                const clock = Math.max(0, Number(time) + offset);
                // Parsed LRC timestamps are ordered. Binary search avoids rescanning a full
                // lyric file on each audio timeupdate, especially for long tracks.
                let low = 0, high = lines.length - 1, index = -1;
                while (low <= high) {
                    const mid = (low + high) >> 1;
                    if (clock >= (Number(lines[mid]?.time) || 0)) { index = mid; low = mid + 1; }
                    else high = mid - 1;
                }
                const container = document.getElementById('lyrics-content');
                if (!container) return;
                const previousIndex = Number.isInteger(State.activeLyricIndex) ? State.activeLyricIndex : -1;
                const changed = index !== previousIndex;
                if (changed) {
                    if (previousIndex >= 0) document.getElementById(`lyric-line-${previousIndex}`)?.classList.remove('active');
                    State.activeLyricIndex = index;
                    if (State.lyricsWordByWord) {
                        // Only the lines crossed by a seek/cue transition need their word state changed.
                        const rangeStart = index < 0 ? 0 : Math.max(0, Math.min(previousIndex < 0 ? 0 : previousIndex, index));
                        const rangeEnd = index < 0 ? Math.max(previousIndex, 0) : Math.min(lines.length - 1, Math.max(previousIndex, index));
                        for (let lineIndex = rangeStart; lineIndex <= rangeEnd; lineIndex++) {
                            const row = document.getElementById(`lyric-line-${lineIndex}`);
                            const model = row && lyricWordTimingCache.get(row);
                            if (!model) continue;
                            const completed = index >= 0 && lineIndex < index ? model.words.length : 0;
                            setLyricRevealCount(model, completed);
                        }
                    }
                    if (index >= 0) {
                        const active = document.getElementById(`lyric-line-${index}`);
                        if (active) {
                            active.classList.add('active');
                            const containerRect = container.getBoundingClientRect();
                            const activeRect = active.getBoundingClientRect();
                            const desired = container.scrollTop + activeRect.top - containerRect.top - (container.clientHeight - activeRect.height) / 2;
                            const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
                            const top = Math.max(0, Math.min(maxScroll, desired));
                            if (Math.abs(container.scrollTop - top) > 10) {
                                container.scrollTo({top, behavior:document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth'});
                            }
                        }
                    }
                }
                if (!State.lyricsWordByWord || index < 0) return;
                const row = document.getElementById(`lyric-line-${index}`);
                const model = row && lyricWordTimingCache.get(row);
                if (!model || !model.words.length) return;
                const elapsed = Math.max(0, clock - model.start);
                const progress = model.duration <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / model.duration));
                let revealCount;
                if (model.gap > 0 && model.gap < 0.48 || progress >= 0.94) {
                    revealCount = model.words.length;
                } else {
                    const target = progress * model.totalWeight;
                    let cumulative = 0;
                    revealCount = 0;
                    // Walk only cached numbers; toggle DOM classes only when count changes.
                    for (const weight of model.weights) {
                        if (cumulative <= target + 0.02) revealCount++;
                        cumulative += weight;
                    }
                    revealCount = Math.max(progress > 0 ? 1 : 0, Math.min(model.words.length, revealCount));
                }
                setLyricRevealCount(model, revealCount);
            },
            loadCurrentLyrics: async (options = {}) => {
                if (!State.isLyricsMode) return;
                const t = Player.getCurrentTrack(); if (!t) return;
                const lyricsContent = document.getElementById('lyrics-content');
                if (!lyricsContent) return;
                clearTimeout(State.lyricsTimeout); State.lyricsTimeout = null;
                if (options.force) LyricsFetcher.cache.delete(t.id);
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                const showStatus = message => {
                    if (!State.isLyricsMode || State.currentTrackId !== t.id) return;
                    lyricsContent.innerHTML = `<div class="lyrics-loading-state" role="status"><span class="lyrics-loading-orb" aria-hidden="true"></span><span>${Utils.escapeHTML(message)}</span></div>`;
                };
                showStatus('Finding lyrics…');
                State.currentLyrics = null; State.activeLyricIndex = -1;
                const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
                let lyricsData;
                try { lyricsData = await LyricsFetcher.getLyrics(t); }
                catch (_) { lyricsData = { text: 'Lyrics unavailable', isSynced: false, unavailable: true }; }
                // LRCLIB can populate a missing track asynchronously. Retry the exact lookup
                // twice with backoff instead of replaying the entire provider chain.
                for (let attempt=1; attempt<=2 && lyricsData?.unavailable && navigator.onLine; attempt++) {
                    if (!State.isLyricsMode || State.currentTrackId !== t.id) return;
                    showStatus(attempt === 1 ? 'No lyrics yet. Checking again…' : 'Still looking for a verified match…');
                    await delay(attempt === 1 ? 1700 : 3200);
                    if (!State.isLyricsMode || State.currentTrackId !== t.id) return;
                    try {
                        const retried = await LyricsFetcher.retryLookup(t);
                        if (retried?.text) { lyricsData = retried; break; }
                    } catch (_) {}
                }
                if (!State.isLyricsMode || State.currentTrackId !== t.id) return;
                State.currentLyrics = lyricsData;
                if (!lyricsData.isSynced) {
                    lyricsContent.classList.add('un-synced');
                    if (lyricsData.unavailable) {
                        const q = encodeURIComponent(`${t.title} ${t.artist} lyrics`);
                        const detailsQ = encodeURIComponent(`${t.title} ${t.artist} ${t.album || ''}`);
                        lyricsContent.innerHTML = `<div class="lyrics-unavailable-card">
                            <div class="lyrics-unavailable-title">Lyrics unavailable</div>
                            <div class="lyrics-unavailable-text">${navigator.onLine ? 'We checked the available lyrics sources and retried twice, but no verified match was returned.' : 'You are offline. Connect to retry online lyrics.'}</div>
                            <div class="lyrics-unavailable-actions">
                                <button class="btn btn-primary" data-action="retry-lyrics">Try again</button>
                                <button class="btn" data-action="check-lyrics-cache" data-id="${Utils.escapeHTML(t.id)}">Check cache</button>
                                <a class="btn" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener noreferrer">Search lyrics on Google</a>
                                <a class="btn" href="https://www.google.com/search?q=${detailsQ}" target="_blank" rel="noopener noreferrer">Song details</a>
                            </div>
                        </div>`;
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
