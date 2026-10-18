/* Copyright mujic@royverse69 */
/* Mujic player engine: Web Audio graph, transport, Media Session and queue. */
        const AudioAdapter = {
            audio: new Audio(), ctx: null, source: null, analyser:null, eqFilters:[], compressor:null, masterGain:null,
            currentObjectUrl:null, visualizerRAF:0, visualizerLastFrameAt:0, visualizerFreqData:null, silenceStart:0, lastSilenceCheck:0, wakeLock:null, lastMediaSeekAt:0, progressiveSeekCount:0,
            init: () => {
                AudioAdapter.audio.addEventListener('timeupdate', () => {
                    State.currentTime = AudioAdapter.audio.currentTime;
                    State.resumePosition = State.currentTime;
                    Stats.consumeAudioDelta(State.currentTime);
                    UI.updateProgress();
                    AudioAdapter.updateMediaSessionPosition();
                    if (State.currentTrackId && Date.now() - State.lastPositionSave > 5000) {
                        State.lastPositionSave = Date.now();
                        if(State.resumePlayback)StorageAdapter.saveSettings();
                        if(window.OnlineWorkspace)OnlineWorkspace.saveQueueSnapshot(State.playbackSourceMode==='online'?'online':'offline');
                    }
                    AudioAdapter.maybeSkipSilence();
                    if (State.isLyricsMode && State.currentLyrics && State.currentLyrics.isSynced) {
                        UI.syncLyrics(State.currentTime);
                    }
                });
                AudioAdapter.audio.addEventListener('loadedmetadata', () => {
                    State.duration = AudioAdapter.audio.duration;
                    const t = Player.getCurrentTrack();
                    const switchingResume = Boolean(t && State.modeResumePendingTrackId && String(State.modeResumePendingTrackId) === String(t.id));
                    if (State.resumePosition > 0 && t && (State.resumePlayback || switchingResume) && State.currentTrackId === t.id) {
                        const resume = Math.max(0, Math.min(State.resumePosition, Math.max(0, State.duration - 0.25)));
                        try { AudioAdapter.audio.currentTime = resume; } catch (e) { Utils.warn(e); }
                        State.currentTime = resume;
                        if (switchingResume) State.modeResumePendingTrackId = null;
                    }
                    UI.updateDuration(); UI.updateProgress(); AudioAdapter.updateMediaSessionPosition();
                    if(t && (!t.duration || Math.abs(t.duration - State.duration) > 2)) {
                        t.duration = State.duration;
                        if (t.source !== 'machhar-online') StorageAdapter.saveTrackMeta(t);
                    }
                });
                AudioAdapter.audio.addEventListener('ended', () => {
                    if (State.sleepTimer.active && State.sleepTimer.endOfSong) {
                        Player.pause(); Player.setSleepTimer('off'); UI.showToast("Sleep timer ended playback", "bedtime"); return;
                    }
                    Player.handleTrackEnded();
                });
                AudioAdapter.audio.addEventListener('play', () => { 
                    State.isPlaying = true; State.statsLastAudioTime = Number(AudioAdapter.audio.currentTime) || 0; UI.updatePlayPause(); AudioAdapter.startVisualizerLoop(); 
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                });
                AudioAdapter.audio.addEventListener('pause', () => { 
                    State.isPlaying = false;
                    const pausedTime=Number(AudioAdapter.audio.currentTime);
                    if(Number.isFinite(pausedTime)&&pausedTime>=0)State.currentTime=pausedTime;
                    State.resumePosition = State.currentTime;
                    UI.updatePlayPause(); AudioAdapter.stopVisualizerLoop();
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                    Stats.flush();
                    if (State.resumePlayback && State.currentTrackId) { State.lastPositionSave = Date.now(); StorageAdapter.saveSettings(); }
                    // Persist the correct workspace snapshot even when global Resume Playback is off.
                    // During a mode switch the mode flag may already have changed, so derive the
                    // snapshot target from the current track to avoid overwriting the other queue.
                    if(window.OnlineWorkspace&&State.currentTrackId){
                        const current=Player.getCurrentTrack();
                        OnlineWorkspace.saveQueueSnapshot(current?.source==='machhar-online'?'online':'offline');
                    }
                });
                AudioAdapter.audio.addEventListener('error', (e) => {
                    const track = Player.getCurrentTrack();
                    if (track?.source === 'machhar-online') {
                        OnlineMusic.invalidateStream(track.id);
                        console.error('Online stream error', e);
                        UI.showToast('Streaming audio failed. Tap play to refresh the stream.', 'error');
                        return;
                    }
                    if (track && State.autoSkipOnError && State.playbackOrder.length > 1) AudioAdapter.handlePlaybackFailure(State.playbackRequestId, track.fileName || track.title, e);
                    else { console.error("Audio error", e); UI.showToast("Playback error occurred", "error"); Player.pause(); }
                });
                AudioAdapter.setupMediaSession();
                document.addEventListener('visibilitychange', () => { if (State.keepScreenAwake && document.visibilityState === 'visible') AudioAdapter.setWakeLock(true); });
                window.addEventListener('pagehide', () => { if (State.stopOnPageHide) AudioAdapter.pause(); });
                AudioAdapter.setWakeLock(State.keepScreenAwake);
            },
            requiresWebAudio: () => !!(
                State.visualizerMode !== 'off' || State.loudnessControl || State.crossfade ||
                (Array.isArray(State.eqBands) && State.eqBands.some(value => Math.abs(Number(value) || 0) > 0))
            ),
            applySettings: () => {
                AudioAdapter.audio.volume = State.muted ? 0 : State.volume;
                AudioAdapter.audio.playbackRate = State.playbackRate;
                try { AudioAdapter.audio.preservesPitch = State.preservePitch !== false && !State.varispeed; } catch (e) { Utils.warn(e); }
                try { AudioAdapter.audio.webkitPreservesPitch = State.preservePitch !== false && !State.varispeed; } catch (e) { Utils.warn(e); }
                if (AudioAdapter.requiresWebAudio()) {
                    AudioAdapter.initWebAudio().then(() => { AudioAdapter.applyEQ(); AudioAdapter.applyAudioEffects(); }).catch(()=>{});
                } else {
                    AudioAdapter.applyEQ(); AudioAdapter.applyAudioEffects();
                }
            },
            initWebAudio: async () => {
                if(AudioAdapter.ctx) { if(AudioAdapter.ctx.state === 'suspended') await AudioAdapter.ctx.resume(); return; }
                try {
                    AudioAdapter.ctx = new (window.AudioContext || window.webkitAudioContext)();
                    AudioAdapter.source = AudioAdapter.ctx.createMediaElementSource(AudioAdapter.audio);
                    const defs = [
                        { type: 'lowshelf', frequency: 60, Q: 0.7 },
                        { type: 'peaking', frequency: 230, Q: 1.0 },
                        { type: 'peaking', frequency: 910, Q: 1.0 },
                        { type: 'peaking', frequency: 3600, Q: 1.0 },
                        { type: 'highshelf', frequency: 14000, Q: 0.7 }
                    ];
                    let previous = AudioAdapter.source;
                    AudioAdapter.eqFilters = defs.map(def => {
                        const f = AudioAdapter.ctx.createBiquadFilter();
                        f.type = def.type; f.frequency.value = def.frequency; f.Q.value = def.Q;
                        previous.connect(f); previous = f; return f;
                    });
                    AudioAdapter.analyser=AudioAdapter.ctx.createAnalyser(); AudioAdapter.analyser.fftSize=256; AudioAdapter.analyser.smoothingTimeConstant=.86;
                    AudioAdapter.compressor = AudioAdapter.ctx.createDynamicsCompressor();
                    AudioAdapter.masterGain = AudioAdapter.ctx.createGain();
                    AudioAdapter.masterGain.gain.value = 1;
                    previous.connect(AudioAdapter.analyser);
                    AudioAdapter.analyser.connect(AudioAdapter.compressor);
                    AudioAdapter.compressor.connect(AudioAdapter.masterGain);
                    AudioAdapter.masterGain.connect(AudioAdapter.ctx.destination);
                    AudioAdapter.applyEQ(); AudioAdapter.applyAudioEffects(); AudioAdapter.resizeVisualizer(); AudioAdapter.drawVisualizerFrame();
                } catch(e) { console.warn("Web Audio API failed/unsupported", e); }
            },
            applyAudioEffects: () => {
                const c = AudioAdapter.compressor;
                if (c) {
                    if (State.loudnessControl) {
                        const profile = { soft: { threshold:-12, knee:22, ratio:1.5, attack:.008, release:.25 }, balanced: { threshold:-18, knee:18, ratio:2.2, attack:.004, release:.18 }, strong: { threshold:-24, knee:12, ratio:3.5, attack:.003, release:.14 } }[State.loudnessLevel] || { threshold:-18, knee:18, ratio:2.2, attack:.004, release:.18 };
                        c.threshold.setTargetAtTime(profile.threshold, AudioAdapter.ctx.currentTime, .04);
                        c.knee.setTargetAtTime(profile.knee, AudioAdapter.ctx.currentTime, .04);
                        c.ratio.setTargetAtTime(profile.ratio, AudioAdapter.ctx.currentTime, .04);
                        c.attack.setTargetAtTime(profile.attack, AudioAdapter.ctx.currentTime, .04);
                        c.release.setTargetAtTime(profile.release, AudioAdapter.ctx.currentTime, .04);
                    } else {
                        c.threshold.setTargetAtTime(0, AudioAdapter.ctx.currentTime, .04);
                        c.knee.setTargetAtTime(0, AudioAdapter.ctx.currentTime, .04);
                        c.ratio.setTargetAtTime(1, AudioAdapter.ctx.currentTime, .04);
                    }
                }
            },
            fadeMaster: (target, durationMs = 180) => new Promise(resolve => {
                const gain = AudioAdapter.masterGain, ctx = AudioAdapter.ctx;
                if (!gain || !ctx || ctx.state !== 'running' || !gain.gain.linearRampToValueAtTime) return resolve(false);
                try {
                    const now = ctx.currentTime; const p = gain.gain;
                    const current = Number.isFinite(p.value) ? p.value : 1;
                    p.cancelScheduledValues(now); p.setValueAtTime(current, now);
                    p.linearRampToValueAtTime(Math.max(0,Math.min(1,target)), now + Math.max(20,durationMs)/1000);
                    setTimeout(() => resolve(true), Math.max(20,durationMs));
                } catch(e) { resolve(false); }
            }),
            maybeSkipSilence: () => {
                if (!State.skipSilence || !State.isPlaying || !AudioAdapter.analyser || !State.duration) { AudioAdapter.silenceStart = 0; return; }
                const now = Date.now(); if (now - AudioAdapter.lastSilenceCheck < 450) return; AudioAdapter.lastSilenceCheck = now;
                if (State.currentTime < 5 || State.currentTime > State.duration - 3) { AudioAdapter.silenceStart = 0; return; }
                try {
                    const data = new Uint8Array(AudioAdapter.analyser.fftSize); AudioAdapter.analyser.getByteTimeDomainData(data);
                    let sum = 0; for (let i=0;i<data.length;i++){ const x=(data[i]-128)/128; sum += x*x; }
                    const rms = Math.sqrt(sum / data.length);
                    if (rms < .006) {
                        if (!AudioAdapter.silenceStart) AudioAdapter.silenceStart = now;
                        const holdMs = State.instantSkipSilence ? 700 : 2100;
                        if (now - AudioAdapter.silenceStart > holdMs && State.currentTime - (AudioAdapter.lastSilenceSeek || 0) > 2) {
                            AudioAdapter.lastSilenceSeek = State.currentTime; AudioAdapter.silenceStart = 0;
                            AudioAdapter.seek(Math.min(State.duration - 1, State.currentTime + (State.instantSkipSilence ? 1.25 : .85)));
                        }
                    } else AudioAdapter.silenceStart = 0;
                } catch(e) { AudioAdapter.silenceStart = 0; }
            },
            setWakeLock: async (enabled = State.keepScreenAwake) => {
                // Only hold a screen wake lock while the user has explicitly enabled it
                // and the full player is expanded. Audio playback itself does not require it.
                const shouldHold = !!(enabled && State.keepScreenAwake && State.isFullPlayerOpen);
                if (!shouldHold) { try { await AudioAdapter.wakeLock?.release(); } catch (e) { Utils.warn(e); } AudioAdapter.wakeLock = null; return; }
                if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
                if (AudioAdapter.wakeLock) return;
                try {
                    AudioAdapter.wakeLock = await navigator.wakeLock.request('screen');
                    AudioAdapter.wakeLock.addEventListener('release', () => { AudioAdapter.wakeLock = null; });
                } catch(e) { if (State.keepScreenAwake && State.isFullPlayerOpen) UI.showToast('Screen wake lock is unavailable in this browser.', 'info'); }
            },
            handlePlaybackFailure: (requestId, trackName, err) => {
                if (requestId !== State.playbackRequestId) return;
                console.warn('Unable to play track', trackName, err);
                if (State.autoSkipOnError && State.playbackOrder.length > 1 && State.autoSkipErrorTrackId !== State.currentTrackId) {
                    State.autoSkipErrorTrackId = State.currentTrackId;
                    UI.showToast(`Skipping unsupported file: ${trackName}`, 'info');
                    setTimeout(() => { if (requestId === State.playbackRequestId) Player.next({ skipTransition: true }); }, 0);
                } else {
                    UI.showToast(`Unable to play this ${Utils.getAudioExtension(trackName)} format in this browser.`, 'error');
                }
            },
            playBlob: async (blob, trackName='audio', requestId=State.playbackRequestId, fadeIn=false) => {
                if(requestId!==State.playbackRequestId) return false;
                if(AudioAdapter.currentObjectUrl) URL.revokeObjectURL(AudioAdapter.currentObjectUrl);
                AudioAdapter.currentObjectUrl=URL.createObjectURL(blob); AudioAdapter.audio.preload='auto'; AudioAdapter.audio.src=AudioAdapter.currentObjectUrl;
                if (AudioAdapter.requiresWebAudio()) { try { await AudioAdapter.initWebAudio(); } catch (e) { Utils.warn(e); } }
                if(requestId!==State.playbackRequestId) return false;
                if (AudioAdapter.masterGain) { try { const now=AudioAdapter.ctx.currentTime; AudioAdapter.masterGain.gain.cancelScheduledValues(now); AudioAdapter.masterGain.gain.setValueAtTime(fadeIn ? 0 : 1, now); } catch (e) { Utils.warn(e); } }
                try{ await AudioAdapter.audio.play(); AudioAdapter.audio.dataset.mujicTrackId=State.currentTrackId || ''; if (fadeIn) AudioAdapter.fadeMaster(1,220); return true; }
                catch(e){ AudioAdapter.handlePlaybackFailure(requestId, trackName, e); return false; }
            },
            playRemote: async (url, trackName='streaming track', requestId=State.playbackRequestId, fadeIn=false) => {
                if (requestId !== State.playbackRequestId || !url) return false;
                if (AudioAdapter.currentObjectUrl) { URL.revokeObjectURL(AudioAdapter.currentObjectUrl); AudioAdapter.currentObjectUrl = null; }
                // Match the Machhar player's CORS-enabled audio setup. A remote URL is never
                // downloaded into IndexedDB; it is streamed through the same native audio element.
                AudioAdapter.audio.pause();
                AudioAdapter.audio.crossOrigin = 'anonymous';
                AudioAdapter.audio.preload = 'metadata';
                AudioAdapter.audio.src = url;
                if (AudioAdapter.requiresWebAudio()) { try { await AudioAdapter.initWebAudio(); } catch (e) { Utils.warn(e); } }
                if (requestId !== State.playbackRequestId) return false;
                if (AudioAdapter.masterGain) { try { const now=AudioAdapter.ctx.currentTime; AudioAdapter.masterGain.gain.cancelScheduledValues(now); AudioAdapter.masterGain.gain.setValueAtTime(fadeIn ? 0 : 1, now); } catch (e) { Utils.warn(e); } }
                try { await AudioAdapter.audio.play(); AudioAdapter.audio.dataset.mujicTrackId=State.currentTrackId || ''; if (fadeIn) AudioAdapter.fadeMaster(1, 220); return true; }
                catch (e) {
                    if (requestId === State.playbackRequestId) {
                        console.warn('Online stream could not start', e);
                        UI.showToast('Streaming audio failed to start. Tap play to request a fresh stream.', 'error');
                    }
                    return false;
                }
            },
            pause: () => { AudioAdapter.audio.pause(); },
            play: async () => { try { if (AudioAdapter.requiresWebAudio()) await AudioAdapter.initWebAudio(); if (AudioAdapter.masterGain) { const p=AudioAdapter.masterGain.gain; p.cancelScheduledValues(AudioAdapter.ctx.currentTime); p.setTargetAtTime(1,AudioAdapter.ctx.currentTime,.025); } await AudioAdapter.audio.play(); } catch(e) { console.error("Play resume failed", e); } },
            seek: (time) => { if(!isNaN(time) && isFinite(time)) AudioAdapter.audio.currentTime = Math.max(0, Math.min(time, State.duration || 0)); },
            setVolume: (v) => { 
                State.volume = v; if (v > 0) State.previousVolume = v; State.muted = v === 0;
                AudioAdapter.audio.volume = v; StorageAdapter.saveSettings(); UI.updateVolumeUI();
                if (v === 0 && State.pauseWhenMuted) AudioAdapter.pause();
            },
            toggleMute: () => { 
                State.muted = !State.muted; if(!State.muted && State.volume === 0) State.volume = State.previousVolume || 1;
                AudioAdapter.audio.volume = State.muted ? 0 : State.volume; StorageAdapter.saveSettings(); UI.updateVolumeUI();
                if (State.muted && State.pauseWhenMuted) AudioAdapter.pause();
            },
            getMediaSeekOffset: () => {
                const now = Date.now();
                if (State.progressiveSeek) AudioAdapter.progressiveSeekCount = now - AudioAdapter.lastMediaSeekAt < 2400 ? Math.min(8, AudioAdapter.progressiveSeekCount + 1) : 0;
                else AudioAdapter.progressiveSeekCount = 0;
                AudioAdapter.lastMediaSeekAt = now;
                return (Number(State.seekStep) || 10) + (State.progressiveSeek ? AudioAdapter.progressiveSeekCount * 5 : 0);
            },
            setWaveformStyle: (style) => {
                const valid = ['default','wavy','slim','squiggly'];
                if (style === 'off') {
                    State.visualizerMode = 'off'; StorageAdapter.saveSettings();
                    UI.updateWaveformStyleUI(); UI.updateVisualizerUI(); AudioAdapter.stopVisualizerLoop(); AudioAdapter.resizeVisualizer();
                    const canvas=document.getElementById('scrubber-visualizer');
                    if(canvas){const ctx=canvas.getContext('2d');if(ctx)ctx.clearRect(0,0,canvas.width,canvas.height);canvas.style.display='none';}
                    UI.closeSheets(); return;
                }
                State.waveformStyle = valid.includes(style) ? style : 'wavy';
                State.visualizerMode = 'wave'; StorageAdapter.saveSettings(); UI.updateWaveformStyleUI(); UI.updateVisualizerUI(); AudioAdapter.resizeVisualizer();
                const miniVisible = !!document.getElementById('mini-player')?.classList.contains('visible');
                if (State.isFullPlayerOpen || miniVisible || State.isPlaying) AudioAdapter.initWebAudio().then(() => {
                    AudioAdapter.resizeVisualizer(); UI.updateVisualizerUI(); AudioAdapter.renderScrubberVisualizerFrame();
                    if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                }).catch(() => UI.showToast('Audio Waveform is unavailable in this browser.', 'info'));
                UI.closeSheets();
            },
            setPlaybackRate: (r) => { 
                State.playbackRate = parseFloat(r); AudioAdapter.audio.playbackRate = State.playbackRate;
                try { AudioAdapter.audio.preservesPitch = State.preservePitch !== false && !State.varispeed; } catch (e) { Utils.warn(e); }
                try { AudioAdapter.audio.webkitPreservesPitch = State.preservePitch !== false && !State.varispeed; } catch (e) { Utils.warn(e); }
                document.getElementById('speed-status-label').innerText = r + 'x'; StorageAdapter.saveSettings(); UI.closeSheets();
            },
            setEQ: (mode) => {
                const presets = { off:[0,0,0,0,0], low:[3,0,0,0,0], med:[6,1,0,0,0], high:[9,2,0,0,0] };
                State.eq = mode; State.eqPreset = mode === 'off' ? 'flat' : 'custom'; State.eqBands = [...(presets[mode] || presets.off)];
                AudioAdapter.applyEQ(); UI.updateEQUI(); StorageAdapter.saveSettings(); UI.closeSheets();
            },
            setEQPreset: (preset) => {
                const presets = {
                    flat:[0,0,0,0,0], bass:[6,2,0,0,-1], vocal:[-2,2,4,3,-1],
                    rock:[4,2,-1,2,4], treble:[-2,-1,0,3,6]
                };
                State.eqPreset = preset; State.eq = preset === 'flat' ? 'off' : preset; State.eqBands = [...(presets[preset] || presets.flat)];
                AudioAdapter.applyEQ(); UI.updateEQUI(); StorageAdapter.saveSettings();
            },
            setEQBand: (index, value) => {
                const i = Number(index); if (i < 0 || i > 4) return;
                State.eqBands[i] = Math.max(-12, Math.min(12, Number(value) || 0)); State.eq = 'custom'; State.eqPreset = 'custom';
                AudioAdapter.applyEQ(); UI.updateEQUI(); StorageAdapter.saveSettings();
            },
            applyEQ: () => {
                if(!AudioAdapter.eqFilters || AudioAdapter.eqFilters.length === 0) return;
                const bands = Array.isArray(State.eqBands) && State.eqBands.length === 5 ? State.eqBands : [0,0,0,0,0];
                AudioAdapter.eqFilters.forEach((f, i) => { f.gain.value = Number(bands[i]) || 0; });
            },
            resizeVisualizer: () => {
                const dpr=(State.lowEndModeActive || State.lowEndMode) ? 1 : Math.min(window.devicePixelRatio||1,1.5);
                [document.getElementById('scrubber-visualizer'), document.getElementById('mini-visualizer')].filter(Boolean).forEach(sc => {
                    const rect=sc.getBoundingClientRect();
                    const cssWidth=Math.max(1,Math.floor(rect.width || sc.parentElement?.clientWidth || 1));
                    const cssHeight = sc.id === 'mini-visualizer' ? 9 : (State.waveformStyle === 'default' ? 28 : 18);
                    const pixelWidth=Math.max(1,Math.floor(cssWidth*dpr));
                    const pixelHeight=Math.max(1,Math.floor(cssHeight*dpr));
                    if(sc.width!==pixelWidth) sc.width=pixelWidth;
                    if(sc.height!==pixelHeight) sc.height=pixelHeight;
                    sc.style.height=`${cssHeight}px`;
                });
            },
            visualizerShouldRun: () => {
                const miniVisible=!!document.getElementById('mini-player')?.classList.contains('visible');
                return !!(State.visualizerMode === 'wave' && State.isPlaying && AudioAdapter.analyser && (State.isFullPlayerOpen || miniVisible));
            },
            stopVisualizerLoop: () => {
                if(AudioAdapter.visualizerRAF){ cancelAnimationFrame(AudioAdapter.visualizerRAF); AudioAdapter.visualizerRAF=0; }
                AudioAdapter.visualizerLastFrameAt=0;
                const fullVisible=State.isFullPlayerOpen;
                const miniVisible=!!document.getElementById('mini-player')?.classList.contains('visible');
                if(State.visualizerMode !== 'off' && AudioAdapter.analyser && (fullVisible || miniVisible)) AudioAdapter.renderScrubberVisualizerFrame();
                else {
                    [document.getElementById('scrubber-visualizer'), document.getElementById('mini-visualizer')].filter(Boolean).forEach(sc=>{ const x=sc.getContext('2d'); if(x) x.clearRect(0,0,sc.width,sc.height); });
                }
            },
            renderScrubberVisualizerFrame: () => {
                [document.getElementById('scrubber-visualizer'), document.getElementById('mini-visualizer')].filter(Boolean).forEach(canvas => AudioAdapter.renderSingleWaveformCanvas(canvas));
            },
            renderSingleWaveformCanvas: (c) => {
                if (!c) return;
                const ctx = c.getContext('2d'); if (!ctx) return;
                const isMini = c.id === 'mini-visualizer';
                const canvasVisible = isMini ? !!document.getElementById('mini-player')?.classList.contains('visible') : State.isFullPlayerOpen;
                const effectEnabled = !!(canvasVisible && State.visualizerMode === 'wave' && AudioAdapter.analyser);
                const rect = c.getBoundingClientRect();
                const w = Math.max(1, rect.width || c.clientWidth || 1), h = Math.max(1, rect.height || c.clientHeight || 1);
                ctx.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
                ctx.clearRect(0, 0, w, h);
                // The dot is drawn on this canvas while the effect is on, so the wave and the dot can never drift apart.
                if (c.parentElement && !isMini) c.parentElement.classList.toggle('wave-live', effectEnabled);
                if (!effectEnabled || !State.duration) return;

                const bank = AudioAdapter._wf || (AudioAdapter._wf = {});
                const st = bank[c.id] || (bank[c.id] = { p: -1, last: 0, phase: 0, lift: 1, env: 0, accent: '#fff', accentAt: 0 });
                const now = performance.now();
                const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 1 / 60;
                st.last = now;
                if (now - st.accentAt > 400) {
                    st.accent = getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#fff';
                    st.accentAt = now;
                }

                // 1) Smooth progress: advance by the clock every frame, then ease toward the real audio time.
                //    timeupdate only fires ~4 times a second, which is what made the old bar step.
                const dur = Number(State.duration) || 1;
                const live = Number(AudioAdapter.audio.currentTime);
                const target = Math.max(0, Math.min(1, (Number.isFinite(live) ? live : Number(State.currentTime) || 0) / dur));
                const playing = !!State.isPlaying;
                if (st.p < 0 || !playing || Math.abs(target - st.p) > 0.02) st.p = target;      // paused or seeked: snap
                else {
                    st.p += dt * (AudioAdapter.audio.playbackRate || 1) / dur;                   // glide
                    st.p += (target - st.p) * (1 - Math.exp(-dt * 8));                           // gently correct drift
                }

                // 2) The dot sits at x1. The wave is forced to land exactly on (x1, mid), so both ends are always connected.
                const R = isMini ? 0 : 6.5;
                const x1 = Math.max(R, Math.min(w - R, st.p * w));
                const mid = h / 2;
                const style = ['default', 'wavy', 'slim', 'squiggly'].includes(State.waveformStyle) ? State.waveformStyle : 'wavy';
                ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = 1;

                if (x1 < w) {                                                                    // unplayed track
                    ctx.strokeStyle = 'rgba(255,255,255,.24)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x1, mid); ctx.lineTo(w, mid); ctx.stroke();
                }

                // Share one inexpensive spectrum sample across all waveform styles.
                // The Default preset uses it to shape a crisp, compact bar waveform;
                // playback, seeking and audio processing remain unchanged.
                let freq = null;
                if (playing && AudioAdapter.analyser) {
                    const an = AudioAdapter.analyser;
                    freq = (AudioAdapter.visualizerFreqData && AudioAdapter.visualizerFreqData.length === an.frequencyBinCount)
                        ? AudioAdapter.visualizerFreqData : (AudioAdapter.visualizerFreqData = new Uint8Array(an.frequencyBinCount));
                    an.getByteFrequencyData(freq);
                    const n = Math.min(12, freq.length); let e = 0;
                    for (let i = 0; i < n; i++) e += freq[i] / 255;
                    st.env += (Math.min(1, e / n * 1.35) - st.env) * (1 - Math.exp(-dt * 6));
                } else {
                    st.env += (0 - st.env) * (1 - Math.exp(-dt * 4));
                }

                ctx.strokeStyle = st.accent;
                if (style === 'default') {
                    const spacingTarget = isMini ? 3.6 : 6.4;
                    const barCount = Math.max(1, Math.floor(x1 / spacingTarget));
                    const spacing = x1 / barCount;
                    const barWidth = Math.max(isMini ? 1 : 1.4, Math.min(isMini ? 1.6 : 3.2, spacing * .58));
                    ctx.lineWidth = barWidth;
                    for (let i = 0; i < barCount; i++) {
                        const x = spacing * (i + .5);
                        const shape = Math.max(.12, Math.min(1,
                            .53 + .23 * Math.sin(i * .73) + .16 * Math.cos(i * .37 + 1.1) + .08 * Math.sin(i * 1.91)));
                        const bin = freq && freq.length ? freq[Math.min(freq.length - 1, Math.floor(i / Math.max(1, barCount) * freq.length))] / 255 : shape;
                        const energy = playing ? (shape * .42 + bin * .58) : shape;
                        const halfHeight = Math.max(isMini ? .8 : 1.2, Math.min(h * .47, h * (.12 + energy * .35) * st.lift * (1 + st.env * .22)));
                        ctx.beginPath(); ctx.moveTo(x, mid - halfHeight); ctx.lineTo(x, mid + halfHeight); ctx.stroke();
                    }
                } else {
                    const cfg = style === 'squiggly' ? { len: 30, amp: .21, lw: 1.9, spd: 4.2, h2: .32 }
                              : style === 'slim'     ? { len: 64, amp: .10, lw: 1.35, spd: 2.6, h2: 0 }
                              :                        { len: 46, amp: .17, lw: 1.8, spd: 3.2, h2: 0 };
                    st.phase += playing ? dt * cfg.spd : 0;                                     // phase accumulates, so it never jumps
                    st.lift += ((playing ? 1 : .6) - st.lift) * (1 - Math.exp(-dt * 5));       // eases down on pause instead of snapping
                    const A = Math.min(h * .24, h * cfg.amp * st.lift * (1 + st.env * .25)) / (1 + cfg.h2);
                    const k = Math.PI * 2 / cfg.len;                                            // fixed wavelength in px: no stretching as the song moves
                    const tIn = Math.min(10, x1 * .35), tOut = Math.min(26, x1 * .65);          // taper lengths at the start and at the dot
                    const ss = (a, b) => { if (a <= 0) return 0; if (b <= 0) return 1; const t = Math.min(1, a / b); return t * t * (3 - 2 * t); };
                    const step = (State.lowEndModeActive || State.lowEndMode) ? 3 : 1.5;
                    ctx.lineWidth = cfg.lw; ctx.beginPath();
                    for (let x = 0; ; x += step) {
                        const xx = Math.min(x, x1);
                        const env = ss(xx, tIn) * ss(x1 - xx, tOut);
                        const y = mid + (Math.sin(k * xx - st.phase) + cfg.h2 * Math.sin(k * 1.9 * xx - st.phase * 1.35)) * A * env;
                        if (x === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
                        if (x >= x1) break;
                    }
                    ctx.stroke();
                }

                if (!isMini) {                                                                   // the dot
                    ctx.fillStyle = st.accent;
                    ctx.beginPath(); ctx.arc(x1, mid, R, 0, Math.PI * 2); ctx.fill();
                }
            },
            startVisualizerLoop: () => {
                if(AudioAdapter.visualizerRAF || !AudioAdapter.visualizerShouldRun()) return;
                const frame=(timestamp=0)=>{
                    AudioAdapter.visualizerRAF=0;
                    if(!AudioAdapter.visualizerShouldRun()){ AudioAdapter.stopVisualizerLoop(); return; }
                    // Draw at up to 30 FPS: smooth enough for a small seek-bar waveform without wasting CPU on low-end phones.
                    const frameInterval = (State.lowEndModeActive || State.lowEndMode) ? 50 : 33;
                    if (!AudioAdapter.visualizerLastFrameAt || timestamp - AudioAdapter.visualizerLastFrameAt >= frameInterval) {
                        AudioAdapter.visualizerLastFrameAt=timestamp;
                        AudioAdapter.renderScrubberVisualizerFrame();
                    }
                    AudioAdapter.visualizerRAF=requestAnimationFrame(frame);
                };
                AudioAdapter.visualizerRAF=requestAnimationFrame(frame);
            },
            drawVisualizerFrame: () => {
                if (!AudioAdapter.analyser || State.visualizerMode !== 'wave') { AudioAdapter.stopVisualizerLoop(); return; }
                AudioAdapter.resizeVisualizer(); AudioAdapter.renderScrubberVisualizerFrame();
                if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop(); else AudioAdapter.stopVisualizerLoop();
            },
            promptOutputDevice: async () => {
                if(typeof navigator.mediaDevices === 'undefined' || typeof AudioAdapter.audio.setSinkId !== 'function') {
                    UI.showToast("Output selection not supported on this browser", "info"); UI.closeSheets(); return;
                }
                try {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const audioOut = devices.filter(d => d.kind === 'audiooutput');
                    if(audioOut.length === 0) return UI.showToast("No external devices found", "info");
                    const current = AudioAdapter.audio.sinkId;
                    const currentIndex = audioOut.findIndex(d => d.deviceId === current);
                    const nextDevice = audioOut[(currentIndex + 1) % audioOut.length].deviceId;
                    await AudioAdapter.audio.setSinkId(nextDevice); UI.showToast("Output device updated", "speaker");
                } catch(e) { UI.showToast("Failed to list/change devices", "error"); }
                UI.closeSheets();
            },
            updateMediaSessionPosition: () => {
                if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
                const duration = Number(State.duration); const currentTime = Number(State.currentTime); const playbackRate = Number(State.playbackRate) || 1;
                if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime) || currentTime < 0) return;
                try { navigator.mediaSession.setPositionState({ duration, playbackRate, currentTime: Math.min(currentTime, Math.max(0, duration - 0.001)) }); } catch (e) { Utils.warn(e); }
            },
            setupMediaSession: () => {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.setActionHandler('play', AudioAdapter.play); 
                    navigator.mediaSession.setActionHandler('pause', AudioAdapter.pause);
                    navigator.mediaSession.setActionHandler('previoustrack', Player.previous); 
                    navigator.mediaSession.setActionHandler('nexttrack', Player.next);
                    navigator.mediaSession.setActionHandler('seekbackward', (d) => { const offset = State.progressiveSeek ? AudioAdapter.getMediaSeekOffset() : (d.seekOffset || Number(State.seekStep) || 10); AudioAdapter.seek(State.currentTime - offset); });
                    navigator.mediaSession.setActionHandler('seekforward', (d) => { const offset = State.progressiveSeek ? AudioAdapter.getMediaSeekOffset() : (d.seekOffset || Number(State.seekStep) || 10); AudioAdapter.seek(State.currentTime + offset); });
                    navigator.mediaSession.setActionHandler('seekto', (d) => { AudioAdapter.seek(d.seekTime); });
                }
            },
            updateMediaSessionMeta: async (track) => {
                if (!('mediaSession' in navigator) || !track) return;
                try {
                    let artworkSrc = await ArtworkCache.getUrl(track, track.title);
                    const mime = track.pictureType || 'image/svg+xml';
                    navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.title, artist: track.artist, album: track.album,
                        artwork: [
                            {src: artworkSrc, sizes: '96x96', type: mime},
                            {src: artworkSrc, sizes: '128x128', type: mime},
                            {src: artworkSrc, sizes: '192x192', type: mime},
                            {src: artworkSrc, sizes: '256x256', type: mime},
                            {src: artworkSrc, sizes: '384x384', type: mime},
                            {src: artworkSrc, sizes: '512x512', type: mime}
                        ]
                    });
                } catch(e) { console.warn("Failed to update media session meta", e); }
            }
        };

        const Player = {
            getTrackById: (id) => State.library.find(t => t.id === id) || OnlineMusic.getTrack(id),
            getCurrentTrack: () => {
                if (State.queueIndex < 0 || State.queueIndex >= State.playbackOrder.length) return null;
                const id = State.playbackOrder[State.queueIndex];
                return Player.getTrackById(id);
            },
            _generateShuffle: (arr, preserveCurrentId) => {
                let a = [...arr];
                if (preserveCurrentId) a = a.filter(id => id !== preserveCurrentId);
                for (let i = a.length - 1; i > 0; i--) { 
                    const j = Math.floor(Math.random() * (i + 1)); 
                    [a[i], a[j]] = [a[j], a[i]]; 
                }
                if (preserveCurrentId) a.unshift(preserveCurrentId);
                return a;
            },
            playContext: (contextList, startIndex = 0) => {
                if (!contextList || contextList.length === 0) return;
                State.queue = contextList.map(t => t.id);
                const startId = State.queue[startIndex];
                if (State.shuffle) { State.playbackOrder = Player._generateShuffle(State.queue, startId); State.queueIndex = 0; } 
                else { State.playbackOrder = [...State.queue]; State.queueIndex = startIndex; }
                Player.startCurrentTrack();
                if (contextList.some(track => track?.source === 'machhar-online') && window.OnlineWorkspace) OnlineWorkspace.saveQueueSnapshot('online');
            },
            shuffleContext: (contextList) => {
                if (!contextList || contextList.length === 0) return;
                State.queue = contextList.map(t => t.id); State.shuffle = true; 
                document.getElementById('shuffle-btn').classList.add('active-state');
                State.playbackOrder = Player._generateShuffle(State.queue, null); State.queueIndex = 0;
                Player.startCurrentTrack();
            },
            startCurrentTrack: async () => {
                const requestId = ++State.playbackRequestId;
                const track = Player.getCurrentTrack();
                if (!track) { AudioAdapter.pause(); return; }
                const shouldRememberOnlineTrack = track.source === 'machhar-online' && State.currentTrackId !== track.id;
                
                if (State.currentTrackId && State.currentTrackId !== track.id && State.resumePlayback) {
                    State.resumePosition = State.currentTime;
                    State.lastPositionSave = Date.now();
                    StorageAdapter.saveSettings().catch(()=>{});
                }
                const restored=State.restoredPlaybackResume&&String(State.restoredPlaybackResume.trackId)===String(track.id)?State.restoredPlaybackResume:null;
                State.restoredPlaybackResume=null;
                State.modeResumePendingTrackId=restored&&Number(restored.position)>0?track.id:null;
                State.currentTrackId = track.id;
                const restorePosition=restored?Math.max(0,Number(restored.position)||0):0;
                State.currentTime = restorePosition; State.duration = restored?Math.max(0,Number(restored.duration)||0):0; State.resumePosition = restorePosition; State.statsLastAudioTime = null; AudioAdapter._wf = null;
                UI.updateProgress(); UI.updateDuration();
                
                const isOnline = track.source === 'machhar-online';
                if (isOnline && State.playbackSourceMode !== 'online') {
                    UI.showToast('Switch to streaming playback to play catalogue tracks.', 'info');
                    return;
                }
                // Pause the previous source while resolving an online stream, so a slow
                // backend response cannot leave old audio playing under new track metadata.
                if (isOnline) AudioAdapter.pause();
                let blob = null;
                if (!isOnline) {
                    try { blob = await StorageAdapter.getAudioBlob(track.id); }
                    catch (err) { console.warn('Storage fetch failed', err); }
                }
                if (requestId !== State.playbackRequestId) return;
                if (!isOnline && !blob) {
                    UI.showToast('Audio file not found or unavailable offline.', 'error');
                    Player.pause();
                    return;
                }

                if (!isOnline) {
                    State.history = State.history.filter(id => id !== track.id);
                    State.history.unshift(track.id);
                    if (State.history.length > 100) State.history.pop();
                }
                StorageAdapter.saveSettings();

                const fadeIn = !!State.transitionFadePending;
                State.transitionFadePending = false;
                // Artwork color extraction and media metadata are background tasks: never delay audio start on them.
                UI.updatePlayerMeta(track).catch(err => console.warn('Player metadata update failed', err));
                UI.showMiniPlayer(); UI.updateHighlights(false); UI.renderQueue();
                try {
                    let played = false;
                    if (isOnline) {
                        const streamUrl = await OnlineMusic.resolveStream(track);
                        if (requestId !== State.playbackRequestId) return;
                        if (!streamUrl) throw new Error('No online stream URL was returned.');
                        played = await AudioAdapter.playRemote(streamUrl, track.fileName || track.title, requestId, fadeIn);
                        if (!played) OnlineMusic.invalidateStream(track.id);
                    } else {
                        played = await AudioAdapter.playBlob(blob, track.fileName, requestId, fadeIn);
                    }
                    if (played && requestId === State.playbackRequestId) {
                        // Keep online and local listening histories isolated. Online recommendations
                        // begin after first successful playback; they never block start-up audio.
                        if (isOnline) {
                            if (shouldRememberOnlineTrack && window.OnlineRecommendations) OnlineRecommendations.remember(track);
                            if (window.OnlineWorkspace) OnlineWorkspace.recordPlay(track);
                            const warmUpcoming=()=> (State.playbackOrder||[]).slice(State.queueIndex+1,State.queueIndex+3).map(id=>Player.getTrackById(id)).filter(item=>item?.source==='machhar-online');
                            // Begin warming an existing next track immediately during current playback.
                            if(window.OnlineMusic)OnlineMusic.prefetchStreams(warmUpcoming()).catch(()=>{});
                            if (window.OnlineRecommendations) {
                                Promise.resolve(OnlineRecommendations.primeQueue(track)).finally(() => {
                                    if (window.OnlineMusic) OnlineMusic.prefetchStreams(warmUpcoming()).catch(()=>{});
                                    if (window.OnlineWorkspace) OnlineWorkspace.saveQueueSnapshot('online');
                                });
                            }
                        } else {
                            Stats.recordPlay(track);
                            StorageAdapter.recordPlayHistory(track).then(entry => { if (entry) { State.playHistory.unshift(entry); State.playHistoryOffset = (Number(State.playHistoryOffset) || 0) + 1; } }).catch(()=>{});
                        }
                    }
                } catch(e) {
                    if (requestId === State.playbackRequestId) {
                        UI.updatePlayPause();
                        UI.showToast(isOnline ? 'Streaming audio is unavailable. Try another result or retry later.' : 'Failed to play track.', 'error');
                    }
                    console.warn('Playback start failed:', e);
                }
                if (requestId !== State.playbackRequestId) return;
                AudioAdapter.updateMediaSessionMeta(track);
            },
            togglePlay: () => {
                const current = Player.getCurrentTrack();
                if (!current) {
                    if (State.playbackOrder.length > 0) { State.queueIndex = Math.max(0,State.queueIndex); Player.startCurrentTrack(); }
                    return;
                }
                if (current.source === 'machhar-online' && State.playbackSourceMode !== 'online') { UI.showToast('Switch to streaming playback to resume this track.', 'info'); return; }
                if (State.queueIndex === -1 && State.playbackOrder.length > 0) { State.queueIndex = 0; Player.startCurrentTrack(); }
                else if (AudioAdapter.audio.paused && (AudioAdapter.audio.dataset.mujicTrackId !== current.id || (current.source === 'machhar-online' && AudioAdapter.audio.error))) Player.startCurrentTrack();
                else if (AudioAdapter.audio.paused) AudioAdapter.play();
                else AudioAdapter.pause();
            },
            pause: () => AudioAdapter.pause(),
            next: async (options = {}) => {
                if (State.playbackOrder.length === 0) return;
                const currentTrack = Player.getCurrentTrack();
                const originalQueueIndex = State.queueIndex;
                let skippedEquivalentTracks = 0;
                // Search pages may intentionally show the original, remix and slowed versions so
                // each can be manually selected. On natural track end, however, do not auto-play a
                // song equivalent to something already heard in this session or recent history.
                if (options.ended && State.repeat === 0 && State.playbackSourceMode === 'online' && window.OnlineRecommendations?.wasPlayedOrEquivalent) {
                    const maxSkips = State.playbackOrder.length;
                    while (State.queueIndex + 1 < State.playbackOrder.length && skippedEquivalentTracks < maxSkips) {
                        const candidate = Player.getTrackById(State.playbackOrder[State.queueIndex + 1]);
                        if (!candidate || candidate.source !== 'machhar-online' || !OnlineRecommendations.wasPlayedOrEquivalent(candidate)) break;
                        State.queueIndex++; skippedEquivalentTracks++;
                    }
                    if (skippedEquivalentTracks) {
                        UI.renderQueue();
                        if (window.OnlineWorkspace) OnlineWorkspace.saveQueueSnapshot('online');
                    }
                }
                const isAtQueueEnd = State.queueIndex >= State.playbackOrder.length - 1;
                const shouldAutoplayRecommend = !!(options.ended && isAtQueueEnd && State.repeat === 0 &&
                    State.playbackSourceMode === 'online' && currentTrack?.source === 'machhar-online' && window.OnlineRecommendations);
                const ticket = ++State.playbackRequestId;
                const canFade = !!(State.crossfade && !options.skipTransition && !options.ended && !AudioAdapter.audio.paused && AudioAdapter.masterGain);
                if (canFade) await AudioAdapter.fadeMaster(0, 200);
                if (ticket !== State.playbackRequestId) return;
                AudioAdapter.pause();
                State.transitionFadePending = canFade;
                if (shouldAutoplayRecommend) {
                    try {
                        const appended = await OnlineRecommendations.enqueueNext(currentTrack);
                        if (ticket !== State.playbackRequestId) return;
                        if (appended) {
                            State.queueIndex++;
                            Player.startCurrentTrack();
                            return;
                        }
                    } catch (error) {
                        console.warn('Online recommendation failed:', error);
                    }
                }
                State.queueIndex++;
                if (State.queueIndex >= State.playbackOrder.length) {
                    if (State.repeat === 1) { State.queueIndex = 0; }
                    else { State.queueIndex = skippedEquivalentTracks ? originalQueueIndex : State.playbackOrder.length - 1; State.transitionFadePending=false; AudioAdapter.pause(); AudioAdapter.seek(0); return; }
                }
                Player.startCurrentTrack();
            },
            previous: async () => {
                if (State.playbackOrder.length === 0) return;
                if (State.currentTime > 3) { AudioAdapter.seek(0); return; }
                const ticket = ++State.playbackRequestId;
                const canFade = !!(State.crossfade && !AudioAdapter.audio.paused && AudioAdapter.masterGain);
                if (canFade) await AudioAdapter.fadeMaster(0, 160);
                if (ticket !== State.playbackRequestId) return;
                AudioAdapter.pause(); State.transitionFadePending = canFade;
                State.queueIndex--;
                if (State.queueIndex < 0) {
                    if (State.repeat === 1) State.queueIndex = State.playbackOrder.length - 1;
                    else State.queueIndex = 0;
                }
                Player.startCurrentTrack();
            },
            handleTrackEnded: () => {
                if (State.repeat === 2) { AudioAdapter.seek(0); AudioAdapter.play(); } 
                else { Player.next({ ended: true }); }
            },
            toggleShuffle: () => {
                if (State.queue.length === 0) return;
                State.shuffle = !State.shuffle;
                const btn = document.getElementById('shuffle-btn'); btn.classList.toggle('active-state', State.shuffle);
                const curId = State.playbackOrder[State.queueIndex];
                if (State.shuffle) { State.playbackOrder = Player._generateShuffle(State.queue, curId); State.queueIndex = 0; } 
                else { State.playbackOrder = [...State.queue]; State.queueIndex = State.playbackOrder.indexOf(curId); }
                StorageAdapter.saveSettings(); UI.renderQueue(); UI.showToast(State.shuffle ? "Shuffle On" : "Shuffle Off", "shuffle");
            },
            toggleRepeat: () => {
                State.repeat = (State.repeat + 1) % 3;
                const btn = document.getElementById('repeat-btn'); btn.classList.toggle('active-state', State.repeat > 0);
                btn.innerHTML = `<span class="material-symbols-rounded">${State.repeat === 2 ? 'repeat_one' : 'repeat'}</span>`;
                StorageAdapter.saveSettings(); const msgs = ['Repeat Off', 'Repeat All', 'Repeat One']; UI.showToast(msgs[State.repeat], "repeat");
            },
            toggleFavorite: (targetId = null) => {
                const id = targetId || State.currentTrackId;
                if (!id) return;
                if (OnlineMusic.isOnlineId(id)) { if (window.OnlineWorkspace) OnlineWorkspace.toggleFavorite(id); else UI.showToast('Unable to save this track right now.', 'info'); return; }
                const idx = State.favorites.indexOf(id); const isF = idx === -1;
                if(isF) State.favorites.push(id); else State.favorites.splice(idx, 1);
                StorageAdapter.saveSettings(); 
                
                if (id === State.currentTrackId) {
                    const favBtn = document.getElementById('fav-btn');
                    favBtn.innerHTML = `<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${isF?1:0}; color: ${isF?'var(--accent-color)':'inherit'};">favorite</span>`;
                }
                const ctxFavIcon = document.getElementById('ctx-fav-icon');
                if (targetId && ctxFavIcon) {
                    ctxFavIcon.innerText = isF ? 'favorite' : 'favorite_border'; ctxFavIcon.style.color = isF ? 'var(--accent-color)' : 'inherit';
                    document.getElementById('ctx-fav-text').innerText = isF ? 'Remove Favorite' : 'Favorite';
                }
                UI.updateHighlights(true); UI.showToast(isF ? "Added to favorites" : "Removed from favorites", "favorite");
            },
            addNext: (id) => {
                if (State.preventDuplicateQueue && State.playbackOrder.includes(id)) { UI.showToast('That song is already in the queue', 'info'); UI.closeSheets(); return; }
                const track = Player.getTrackById(id);
                if (!track) return;
                if (State.playbackOrder.length === 0) {
                    if (track.source === 'machhar-online') {
                        const list = window.OnlineWorkspace ? OnlineWorkspace.getPlaybackContext(null,id) : (State.searchResults || []).filter(item => item.source === 'machhar-online');
                        const context = OnlineRecommendations.filterPlaybackContext(list.length ? list : [track], id);
                        return Player.playContext(context, 0);
                    }
                    return Player.playContext(State.library, State.library.findIndex(t=>t.id===id));
                }
                State.playbackOrder.splice(State.queueIndex + 1, 0, id);
                if (!State.queue.includes(id)) State.queue.push(id);
                UI.renderQueue(); if(track.source==='machhar-online' && window.OnlineWorkspace) OnlineWorkspace.saveQueueSnapshot('online'); UI.showToast("Playing next", "playlist_play"); UI.closeSheets();
            },
            addQueue: (id) => {
                if (State.preventDuplicateQueue && State.playbackOrder.includes(id)) { UI.showToast('That song is already in the queue', 'info'); UI.closeSheets(); return; }
                const track = Player.getTrackById(id);
                if (!track) return;
                if (State.playbackOrder.length === 0) {
                    if (track.source === 'machhar-online') {
                        const list = window.OnlineWorkspace ? OnlineWorkspace.getPlaybackContext(null,id) : (State.searchResults || []).filter(item => item.source === 'machhar-online');
                        const context = OnlineRecommendations.filterPlaybackContext(list.length ? list : [track], id);
                        return Player.playContext(context, 0);
                    }
                    return Player.playContext(State.library, State.library.findIndex(t=>t.id===id));
                }
                State.playbackOrder.push(id);
                if (!State.queue.includes(id)) State.queue.push(id);
                UI.renderQueue(); if(track.source==='machhar-online' && window.OnlineWorkspace) OnlineWorkspace.saveQueueSnapshot('online'); UI.showToast("Added to queue", "queue_music"); UI.closeSheets();
            },
            clearQueue: () => {
                if (State.queueIndex < 0) return;
                const curId = State.playbackOrder[State.queueIndex];
                State.playbackOrder = [curId]; State.queue = [curId]; State.queueIndex = 0;
                UI.renderQueue(); if(window.OnlineWorkspace && State.playbackSourceMode==='online') OnlineWorkspace.saveQueueSnapshot('online'); UI.showToast("Queue cleared", "clear_all");
            },
            removeFromQueue: (index) => {
                if (index < 0 || index >= State.playbackOrder.length || index === State.queueIndex) return;
                const id = State.playbackOrder[index]; State.playbackOrder.splice(index, 1);
                const qIdx = State.queue.indexOf(id); if(qIdx > -1) State.queue.splice(qIdx, 1);
                if (index < State.queueIndex) State.queueIndex--;
                UI.renderQueue(); if(window.OnlineWorkspace && State.playbackSourceMode==='online') OnlineWorkspace.saveQueueSnapshot('online');
            },
            playQueueIndex: (index) => {
                if (index >= 0 && index < State.playbackOrder.length) { State.queueIndex = index; Player.startCurrentTrack(); }
            },
            moveQueue: (index, direction) => {
                const from = Number(index); const to = direction === 'up' ? from - 1 : from + 1;
                if (from < 0 || to < 0 || from >= State.playbackOrder.length || to >= State.playbackOrder.length) return;
                const item = State.playbackOrder.splice(from, 1)[0]; State.playbackOrder.splice(to, 0, item);
                if (State.queueIndex === from) State.queueIndex = to;
                else if (State.queueIndex > from && State.queueIndex <= to) State.queueIndex--;
                else if (State.queueIndex < from && State.queueIndex >= to) State.queueIndex++;
                // While shuffled, State.queue keeps the original order so turning shuffle off restores it.
                if (!State.shuffle) State.queue = [...State.playbackOrder];
                StorageAdapter.saveSettings(); UI.renderQueue(); if(window.OnlineWorkspace && State.playbackSourceMode==='online') OnlineWorkspace.saveQueueSnapshot('online');
            },
            setSleepTimer: (val) => {
                clearInterval(State.sleepTimer.intervalId); State.sleepTimer.intervalId = null;
                if (val === 'off') { 
                    State.sleepTimer = { active: false, label: 'Off', endOfSong: false, endTime: null, intervalId: null }; 
                    document.getElementById('st-active-display').style.display = 'none';
                } else if (val === 'end') { 
                    State.sleepTimer = { active: true, endOfSong: true, label: 'End of song', endTime: null, intervalId: null }; 
                    document.getElementById('st-active-display').style.display = 'block';
                    document.getElementById('st-active-display').innerText = "Timer: End of song";
                    UI.showToast("Timer set for end of song", "bedtime"); 
                } else {
                    State.sleepTimer = { active: true, endOfSong: false, endTime: Date.now() + parseInt(val) * 60000, label: val + ' min', intervalId: null };
                    document.getElementById('st-active-display').style.display = 'block'; UI.updateSleepTimerDisplay();
                    UI.showToast(`Timer set for ${val} minutes`, "bedtime");
                    State.sleepTimer.intervalId = setInterval(() => {
                        if (!State.sleepTimer.active) return clearInterval(State.sleepTimer.intervalId);
                        const rem = State.sleepTimer.endTime - Date.now();
                        if (rem <= 0) {
                            clearInterval(State.sleepTimer.intervalId);
                            State.sleepTimer = { active: false, endTime: null, endOfSong: false, label: 'Off', intervalId: null };
                            Player.pause(); document.getElementById('st-status-label').innerText = 'Off';
                            document.getElementById('st-active-display').style.display = 'none';
                            UI.showToast("Sleep timer ended playback", "bedtime");
                        } else { UI.updateSleepTimerDisplay(); }
                    }, 1000);
                }
                document.getElementById('st-status-label').innerText = State.sleepTimer.label; UI.closeSheets();
            }
        };
