/* Mujic player engine: Web Audio graph, transport, Media Session and queue. */
        const AudioAdapter = {
            audio: new Audio(), ctx: null, source: null, analyser:null, eqFilter:null, eqFilters:[], compressor:null, masterGain:null,
            currentObjectUrl:null, visualizerRAF:0, visualizerLastFrameAt:0, visualizerSmooth:null, visualizerFreqData:null, waveformEnvelope:null, waveformAmplitude:0, silenceStart:0, lastSilenceCheck:0, wakeLock:null, lastMediaSeekAt:0, progressiveSeekCount:0,
            init: () => {
                AudioAdapter.audio.addEventListener('timeupdate', () => {
                    State.currentTime = AudioAdapter.audio.currentTime;
                    State.resumePosition = State.currentTime;
                    Stats.consumeAudioDelta(State.currentTime);
                    UI.updateProgress();
                    AudioAdapter.updateMediaSessionPosition();
                    if (State.resumePlayback && State.currentTrackId && Date.now() - State.lastPositionSave > 5000) {
                        State.lastPositionSave = Date.now();
                        StorageAdapter.saveSettings();
                    }
                    AudioAdapter.maybeSkipSilence();
                    if (State.isLyricsMode && State.currentLyrics && State.currentLyrics.isSynced) {
                        UI.syncLyrics(State.currentTime);
                    }
                });
                AudioAdapter.audio.addEventListener('loadedmetadata', () => {
                    State.duration = AudioAdapter.audio.duration;
                    const t = Player.getCurrentTrack();
                    if (State.resumePosition > 0 && t && State.resumePlayback && State.currentTrackId === t.id) {
                        const resume = Math.max(0, Math.min(State.resumePosition, Math.max(0, State.duration - 0.25)));
                        try { AudioAdapter.audio.currentTime = resume; } catch(e) {}
                        State.currentTime = resume;
                    }
                    UI.updateDuration(); UI.updateProgress(); AudioAdapter.updateMediaSessionPosition();
                    if(t && (!t.duration || Math.abs(t.duration - State.duration) > 2)) { 
                        t.duration = State.duration; StorageAdapter.saveTrackMeta(t); 
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
                    State.isPlaying = false; State.resumePosition = State.currentTime; UI.updatePlayPause(); AudioAdapter.stopVisualizerLoop();
                    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
                    Stats.flush();
                    if (State.resumePlayback && State.currentTrackId) { State.lastPositionSave = Date.now(); StorageAdapter.saveSettings(); }
                });
                AudioAdapter.audio.addEventListener('error', (e) => {
                    const track = Player.getCurrentTrack();
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
                try { AudioAdapter.audio.preservesPitch = State.preservePitch !== false && !State.varispeed; } catch(e) {}
                try { AudioAdapter.audio.webkitPreservesPitch = State.preservePitch !== false && !State.varispeed; } catch(e) {}
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
                    AudioAdapter.eqFilter=AudioAdapter.eqFilters[0]||null;
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
                if (!shouldHold) { try { await AudioAdapter.wakeLock?.release(); } catch(e) {} AudioAdapter.wakeLock = null; return; }
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
                if (AudioAdapter.requiresWebAudio()) { try { await AudioAdapter.initWebAudio(); } catch(e) {} }
                if(requestId!==State.playbackRequestId) return false;
                if (AudioAdapter.masterGain) { try { const now=AudioAdapter.ctx.currentTime; AudioAdapter.masterGain.gain.cancelScheduledValues(now); AudioAdapter.masterGain.gain.setValueAtTime(fadeIn ? 0 : 1, now); } catch(e) {} }
                try{ await AudioAdapter.audio.play(); if (fadeIn) AudioAdapter.fadeMaster(1,220); return true; }
                catch(e){ AudioAdapter.handlePlaybackFailure(requestId, trackName, e); return false; }
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
                State.waveformStyle = valid.includes(style) ? style : 'wavy';
                // Choosing a style always selects the Audio Waveform effect, even if another mode was active.
                State.visualizerMode = 'wave';
                StorageAdapter.saveSettings(); UI.updateWaveformStyleUI(); UI.updateVisualizerUI(); AudioAdapter.resizeVisualizer();
                AudioAdapter.initWebAudio().then(() => {
                    AudioAdapter.renderScrubberVisualizerFrame();
                    if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                }).catch(() => UI.showToast('Audio waveform is unavailable in this browser.', 'info'));
                UI.closeSheets();
            },
            setPlaybackRate: (r) => { 
                State.playbackRate = parseFloat(r); AudioAdapter.audio.playbackRate = State.playbackRate;
                try { AudioAdapter.audio.preservesPitch = State.preservePitch !== false && !State.varispeed; } catch(e) {}
                try { AudioAdapter.audio.webkitPreservesPitch = State.preservePitch !== false && !State.varispeed; } catch(e) {}
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
                const dpr=Math.min(window.devicePixelRatio||1,2);
                const sc=document.getElementById('scrubber-visualizer');
                if(!sc) return;
                const rect=sc.getBoundingClientRect();
                const cssWidth=Math.max(1,Math.floor(rect.width));
                const cssHeight=Math.max(12,Math.min(20,Math.floor(rect.height||18)));
                const pixelWidth=Math.max(1,Math.floor(cssWidth*dpr));
                const pixelHeight=Math.max(1,Math.floor(cssHeight*dpr));
                if(sc.width!==pixelWidth) sc.width=pixelWidth;
                if(sc.height!==pixelHeight) sc.height=pixelHeight;
                // Keep the CSS viewport compact even when a stale canvas had a 150px intrinsic height.
                sc.style.height=`${cssHeight}px`;
            },
            visualizerShouldRun: () => !!(State.isFullPlayerOpen && State.visualizerMode !== 'off' && State.isPlaying && AudioAdapter.analyser),
            stopVisualizerLoop: () => {
                if(AudioAdapter.visualizerRAF){ cancelAnimationFrame(AudioAdapter.visualizerRAF); AudioAdapter.visualizerRAF=0; }
                AudioAdapter.visualizerLastFrameAt=0;
                // Keep a static timeline/wave while paused; clear only when the player/effect is actually closed.
                if(State.visualizerMode !== 'off' && State.isFullPlayerOpen && AudioAdapter.analyser) AudioAdapter.renderScrubberVisualizerFrame();
                else {
                    const sc=document.getElementById('scrubber-visualizer');
                    if(sc){ const x=sc.getContext('2d'); if(x) x.clearRect(0,0,sc.width,sc.height); }
                }
            },
            renderVisualizerFrame: () => {},
            renderScrubberVisualizerFrame: () => {
                const c=document.getElementById('scrubber-visualizer'); if(!c) return;
                const ctx=c.getContext('2d'); if(!ctx) return;
                const effectEnabled=!!(State.isFullPlayerOpen && State.visualizerMode !== 'off' && AudioAdapter.analyser);
                const dpr=Math.min(window.devicePixelRatio||1,2), w=c.width/dpr,h=c.height/dpr;
                ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
                if(!effectEnabled || !AudioAdapter.analyser || w<=0 || h<=0 || !State.duration) return;
                const progress=Math.max(0,Math.min(1,Number(State.currentTime)/Number(State.duration)));
                const playedW=Math.max(0,w*progress);
                const accent=getComputedStyle(document.body).getPropertyValue('--accent-color').trim()||'#fff';
                const freq=(AudioAdapter.visualizerFreqData && AudioAdapter.visualizerFreqData.length===AudioAdapter.analyser.frequencyBinCount) ? AudioAdapter.visualizerFreqData : (AudioAdapter.visualizerFreqData=new Uint8Array(AudioAdapter.analyser.frequencyBinCount));
                if (!AudioAdapter.visualizerSmooth || AudioAdapter.visualizerSmooth.length !== freq.length) AudioAdapter.visualizerSmooth = new Float32Array(freq.length);
                const smooth=AudioAdapter.visualizerSmooth;
                const mode=State.visualizerMode==='aurora'?'pulse':State.visualizerMode;
                ctx.lineCap='round'; ctx.lineJoin='round';
                // Draw only the unplayed timeline here. CSS hides the stock track/fill while an effect is active,
                // so no grey baseline can show through the played waveform.
                if (playedW < w) {
                    ctx.strokeStyle='rgba(255,255,255,.24)'; ctx.globalAlpha=1; ctx.lineWidth=2;
                    ctx.beginPath(); ctx.moveTo(Math.max(0,playedW),h*.5); ctx.lineTo(w,h*.5); ctx.stroke();
                }
                if (playedW < 1) { ctx.globalAlpha=1; return; }
                ctx.save(); ctx.beginPath(); ctx.rect(0,0,playedW,h); ctx.clip();

                if(mode==='wave'){
                    const waveformStyle = ['default','wavy','slim','squiggly'].includes(State.waveformStyle) ? State.waveformStyle : 'wavy';
                    if (waveformStyle === 'default') {
                        ctx.strokeStyle=accent; ctx.globalAlpha=.96; ctx.lineWidth=1.8;
                        ctx.beginPath(); ctx.moveTo(0,h*.5); ctx.lineTo(playedW,h*.5); ctx.stroke();
                        ctx.restore(); ctx.shadowBlur=0; ctx.globalAlpha=1; return;
                    }
                    // Restrained, broad waveform: small peaks, long wavelength and gentle audio reactivity.
                    // The canvas is capped at 18px CSS height; amplitudes are deliberately kept inside it.
                    if (State.isPlaying) AudioAdapter.analyser.getByteFrequencyData(freq);
                    const envelopeCount = waveformStyle === 'squiggly' ? 4 : 3;
                    if (!AudioAdapter.waveformEnvelope || AudioAdapter.waveformEnvelope.length !== envelopeCount) {
                        AudioAdapter.waveformEnvelope = new Float32Array(envelopeCount);
                    }
                    const envelope = AudioAdapter.waveformEnvelope;
                    if (State.isPlaying) {
                        for (let i=0;i<envelopeCount;i++) {
                            const startBin = 2 + i * 4;
                            let total = 0, count = 0;
                            for (let j=startBin;j<Math.min(freq.length,startBin+3);j++) { total += freq[j]; count++; }
                            const sample = count ? total / count / 255 : 0;
                            envelope[i] = envelope[i] * .92 + sample * .08;
                        }
                        let lowEnergy = 0;
                        for (let i=0;i<Math.min(12,freq.length);i++) lowEnergy += freq[i] / 255;
                        lowEnergy = Math.min(1, lowEnergy / Math.max(1,Math.min(12,freq.length)) * 1.35);
                        AudioAdapter.waveformAmplitude = (AudioAdapter.waveformAmplitude || 0) * .94 + lowEnergy * .06;
                    }
                    const cycles = waveformStyle === 'squiggly' ? 1.45 : waveformStyle === 'slim' ? 0.95 : 1.15;
                    const baseRatio = waveformStyle === 'slim' ? .075 : .145;
                    const amplitude = Math.min(h * .19, h * (baseRatio + (AudioAdapter.waveformAmplitude || 0) * .035));
                    const pointCount = Math.max(18, Math.min(32, Math.floor(playedW / 12)));
                    const phase = State.isPlaying ? ((performance.now ? performance.now() : Date.now()) / 18000 * Math.PI * 2) : 0;
                    const points = [];
                    for (let i=0;i<pointCount;i++) {
                        const t = i/(pointCount-1);
                        const envPosition = t*(envelopeCount-1);
                        const envIndex = Math.floor(envPosition);
                        const envFrac = envPosition-envIndex;
                        const envA = envelope[Math.min(envelopeCount-1,envIndex)] || 0;
                        const envB = envelope[Math.min(envelopeCount-1,envIndex+1)] || envA;
                        const localEnergy = envA + (envB-envA)*envFrac;
                        const fine = waveformStyle === 'squiggly' ? Math.sin(t*Math.PI*2*cycles*1.45+phase*.15)*.012 : Math.sin(t*Math.PI*2*cycles*1.2+phase*.12)*.006;
                        const shape = Math.sin(t*Math.PI*2*cycles+phase*.10) * (.94 + localEnergy*.06) + fine;
                        points.push([playedW*t, h*.5 + shape*amplitude]);
                    }
                    ctx.strokeStyle=accent;
                    ctx.globalAlpha=.96;
                    ctx.lineWidth=waveformStyle === 'slim' ? 1.35 : 1.8;
                    ctx.shadowBlur=0;
                    ctx.beginPath();
                    ctx.moveTo(points[0][0],points[0][1]);
                    for (let i=0;i<points.length-1;i++) {
                        const p0=points[Math.max(0,i-1)], p1=points[i], p2=points[i+1], p3=points[Math.min(points.length-1,i+2)];
                        const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
                        const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
                        ctx.bezierCurveTo(c1x,c1y,c2x,c2y,p2[0],p2[1]);
                    }
                    ctx.stroke();
                } else if(mode==='dots'){
                    AudioAdapter.analyser.getByteFrequencyData(freq);
                    for(let i=0;i<freq.length;i++) smooth[i]+=(freq[i]-smooth[i])*.10;
                    const count=Math.max(10,Math.min(34,Math.floor(playedW/14))), step=playedW/count;
                    ctx.fillStyle='#fff'; ctx.shadowColor=accent; ctx.shadowBlur=3;
                    for(let i=0;i<count;i++){ const sample=smooth[Math.min(smooth.length-1,Math.floor(i/count*smooth.length))]/255; const r=1.2+sample*1.8; const x=i*step+step*.5; ctx.globalAlpha=.32+sample*.5; ctx.beginPath(); ctx.arc(x,h*.5,r,0,Math.PI*2); ctx.fill(); }
                } else if(mode==='pulse'){
                    AudioAdapter.analyser.getByteFrequencyData(freq);
                    for(let i=0;i<freq.length;i++) smooth[i]+=(freq[i]-smooth[i])*.10;
                    const sample=smooth[5]/255||0; const half=h*(.07+sample*.13);
                    ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1.4,h*.08); ctx.globalAlpha=.85; ctx.shadowColor=accent; ctx.shadowBlur=4;
                    ctx.beginPath(); const waves=Math.max(2,Math.min(4,Math.floor(playedW/90))); for(let i=0;i<=waves*2;i++){ const x=playedW*(i/(waves*2)); const y=h*.5+(i%2?half:-half)*.7; if(i===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.stroke();
                } else if(mode==='mirror'){
                    AudioAdapter.analyser.getByteFrequencyData(freq);
                    for(let i=0;i<freq.length;i++) smooth[i]+=(freq[i]-smooth[i])*.10;
                    const count=Math.max(8,Math.min(28,Math.floor(playedW/16))), bw=playedW/count;
                    ctx.fillStyle='#fff'; ctx.shadowColor=accent; ctx.shadowBlur=3;
                    for(let i=0;i<count;i++){ const sample=smooth[Math.min(smooth.length-1,Math.floor(i/count*smooth.length))]/255; const bh=Math.max(1,h*(.05+sample*.16)); const x=i*bw+.4; ctx.globalAlpha=.35+sample*.5; ctx.fillRect(x,h*.5-bh/2,Math.max(1,bw-1),bh); }
                } else {
                    AudioAdapter.analyser.getByteFrequencyData(freq);
                    for(let i=0;i<freq.length;i++) smooth[i]+=(freq[i]-smooth[i])*.10;
                    const count=Math.max(8,Math.min(26,Math.floor(playedW/15))), bw=playedW/count;
                    ctx.fillStyle='#fff'; ctx.shadowColor=accent; ctx.shadowBlur=3;
                    for(let i=0;i<count;i++){ const sample=smooth[Math.min(smooth.length-1,Math.floor(i/count*smooth.length))]/255; const bh=Math.max(1.2,h*(.045+sample*.14)); const x=i*bw+.5; const y=h*.5-bh*.5; ctx.globalAlpha=.32+sample*.55; if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,Math.max(1,bw-1),bh,2);ctx.fill();} else ctx.fillRect(x,y,Math.max(1,bw-1),bh); }
                }
                ctx.restore(); ctx.shadowBlur=0; ctx.globalAlpha=1;
            },
            startVisualizerLoop: () => {
                if(AudioAdapter.visualizerRAF || !AudioAdapter.visualizerShouldRun()) return;
                const frame=(timestamp=0)=>{
                    AudioAdapter.visualizerRAF=0;
                    if(!AudioAdapter.visualizerShouldRun()){ AudioAdapter.stopVisualizerLoop(); return; }
                    // Draw at up to 30 FPS: smooth enough for a small seek-bar waveform without wasting CPU on low-end phones.
                    if (!AudioAdapter.visualizerLastFrameAt || timestamp - AudioAdapter.visualizerLastFrameAt >= 32) {
                        AudioAdapter.visualizerLastFrameAt=timestamp;
                        AudioAdapter.renderScrubberVisualizerFrame();
                    }
                    AudioAdapter.visualizerRAF=requestAnimationFrame(frame);
                };
                AudioAdapter.visualizerRAF=requestAnimationFrame(frame);
            },
            drawVisualizerFrame: () => {
                if(!AudioAdapter.visualizerShouldRun()){ AudioAdapter.stopVisualizerLoop(); return; }
                AudioAdapter.renderScrubberVisualizerFrame(); AudioAdapter.startVisualizerLoop();
            },
            setVisualizer: (mode) => {
                const valid=['off','spectrum','wave','pulse','dots','mirror'];
                const normalized = mode === 'aurora' ? 'pulse' : mode;
                State.visualizerMode=valid.includes(normalized)?normalized:'off';
                StorageAdapter.saveSettings(); UI.updateVisualizerUI(); AudioAdapter.resizeVisualizer();
                if(State.visualizerMode==='off') AudioAdapter.stopVisualizerLoop();
                else AudioAdapter.initWebAudio().then(() => {
                    AudioAdapter.resizeVisualizer();
                    AudioAdapter.renderScrubberVisualizerFrame();
                    if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                }).catch(()=>UI.showToast('Audio waveform is unavailable in this browser.', 'info'));
                UI.closeSheets();
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
                try { navigator.mediaSession.setPositionState({ duration, playbackRate, currentTime: Math.min(currentTime, Math.max(0, duration - 0.001)) }); } catch(e) {}
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
            getCurrentTrack: () => {
                if (State.queueIndex < 0 || State.queueIndex >= State.playbackOrder.length) return null;
                const id = State.playbackOrder[State.queueIndex];
                return State.library.find(t => t.id === id);
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
                
                if (State.currentTrackId && State.currentTrackId !== track.id && State.resumePlayback) {
                    State.resumePosition = State.currentTime;
                    State.lastPositionSave = Date.now();
                    StorageAdapter.saveSettings().catch(()=>{});
                }
                State.currentTrackId = track.id;
                State.currentTime = 0; State.duration = 0; State.resumePosition = 0; State.statsLastAudioTime = null; AudioAdapter.visualizerSmooth = null; AudioAdapter.waveformSmooth = null;
                UI.updateProgress(); UI.updateDuration();
                
                let blob;
                try {
                    blob = await StorageAdapter.getAudioBlob(track.id);
                } catch (err) {
                    console.warn("Storage fetch failed", err);
                }
                
                if (requestId !== State.playbackRequestId) return;

                if (!blob) { 
                    UI.showToast("Audio file not found or unavailable offline.", "error"); 
                    Player.pause(); 
                    return; 
                }

                State.history = State.history.filter(id => id !== track.id);
                State.history.unshift(track.id);
                if(State.history.length > 100) State.history.pop();
                StorageAdapter.saveSettings();

                const fadeIn = !!State.transitionFadePending;
                State.transitionFadePending = false;
                // Artwork color extraction and media metadata are background tasks: never delay audio start on them.
                UI.updatePlayerMeta(track).catch(err => console.warn('Player metadata update failed', err));
                UI.showMiniPlayer(); UI.updateHighlights(false); UI.renderQueue();
                try {
                    const played = await AudioAdapter.playBlob(blob, track.fileName, requestId, fadeIn);
                    if (played && requestId === State.playbackRequestId) {
                        Stats.recordPlay(track);
                        StorageAdapter.recordPlayHistory(track).then(entry => { if (entry) { State.playHistory.unshift(entry); State.playHistoryOffset = (Number(State.playHistoryOffset) || 0) + 1; } }).catch(()=>{});
                    }
                } catch(e) {
                    UI.showToast("Failed to play track.", "error");
                }
                if (requestId !== State.playbackRequestId) return;
                AudioAdapter.updateMediaSessionMeta(track);
            },
            togglePlay: () => {
                if (State.queueIndex === -1 && State.playbackOrder.length > 0) { State.queueIndex = 0; Player.startCurrentTrack(); } 
                else if (AudioAdapter.audio.paused) AudioAdapter.play();
                else AudioAdapter.pause();
            },
            pause: () => AudioAdapter.pause(),
            next: async (options = {}) => {
                if (State.playbackOrder.length === 0) return;
                const ticket = ++State.playbackRequestId;
                const canFade = !!(State.crossfade && !options.skipTransition && !options.ended && !AudioAdapter.audio.paused && AudioAdapter.masterGain);
                if (canFade) await AudioAdapter.fadeMaster(0, 200);
                if (ticket !== State.playbackRequestId) return;
                AudioAdapter.pause();
                State.transitionFadePending = canFade;
                State.queueIndex++;
                if (State.queueIndex >= State.playbackOrder.length) {
                    if (State.repeat === 1) { State.queueIndex = 0; }
                    else { State.queueIndex = State.playbackOrder.length - 1; State.transitionFadePending=false; AudioAdapter.pause(); AudioAdapter.seek(0); return; }
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
                if (State.playbackOrder.length === 0) return Player.playContext(State.library, State.library.findIndex(t=>t.id===id));
                State.playbackOrder.splice(State.queueIndex + 1, 0, id);
                if (!State.queue.includes(id)) State.queue.push(id);
                UI.renderQueue(); UI.showToast("Playing next", "playlist_play"); UI.closeSheets();
            },
            addQueue: (id) => {
                if (State.preventDuplicateQueue && State.playbackOrder.includes(id)) { UI.showToast('That song is already in the queue', 'info'); UI.closeSheets(); return; }
                if (State.playbackOrder.length === 0) return Player.playContext(State.library, State.library.findIndex(t=>t.id===id));
                State.playbackOrder.push(id);
                if (!State.queue.includes(id)) State.queue.push(id);
                UI.renderQueue(); UI.showToast("Added to queue", "queue_music"); UI.closeSheets();
            },
            clearQueue: () => {
                if (State.queueIndex < 0) return;
                const curId = State.playbackOrder[State.queueIndex];
                State.playbackOrder = [curId]; State.queue = [curId]; State.queueIndex = 0;
                UI.renderQueue(); UI.showToast("Queue cleared", "clear_all");
            },
            removeFromQueue: (index) => {
                if (index < 0 || index >= State.playbackOrder.length || index === State.queueIndex) return;
                const id = State.playbackOrder[index]; State.playbackOrder.splice(index, 1);
                const qIdx = State.queue.indexOf(id); if(qIdx > -1) State.queue.splice(qIdx, 1);
                if (index < State.queueIndex) State.queueIndex--;
                UI.renderQueue();
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
                State.queue = [...new Set(State.playbackOrder)];
                StorageAdapter.saveSettings(); UI.renderQueue();
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
