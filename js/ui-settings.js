/* Copyright mujic@royverse69 */
        Object.assign(UI, {
            checkForUpdates: async (manual = false) => {
                if (!['http:', 'https:'].includes(location.protocol)) {
                    if (manual) UI.showToast('Run Mujic through localhost or HTTPS to check for updates.', 'info');
                    return false;
                }
                const parseVersion = value => String(value || '').trim().split(/[+-]/)[0].split('.').map(part => Math.max(0, Number.parseInt(part, 10) || 0));
                const compareVersions = (a,b) => { const aa=parseVersion(a),bb=parseVersion(b); for(let i=0;i<Math.max(aa.length,bb.length);i++){const d=(aa[i]||0)-(bb[i]||0);if(d)return d;}return 0; };
                const current = document.querySelector('meta[name="application-version"]')?.content?.split('-')[0] || '0.0.0';
                try {
                    const response = await fetch(`./VERSION?check=${Date.now()}`, { cache:'no-store' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const latest = (await response.text()).trim().split(/[\r\n]/)[0];
                    if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) throw new Error('The VERSION file is invalid.');
                    if (compareVersions(latest, current) <= 0) {
                        if (manual) UI.showToast(`Mujic ${current} is up to date.`, 'check_circle');
                        return false;
                    }
                    const dismissed = sessionStorage.getItem('mujic-update-dismissed');
                    if (!manual && dismissed === latest) return false;
                    const accept = await Dialog.show({ type:'confirm', title:'Mujic update available', message:`Mujic ${latest} is available (you have ${current}). Update now to load the latest fixes?`, confirmText:'Update now' });
                    if (!accept) { sessionStorage.setItem('mujic-update-dismissed', latest); return true; }
                    UI.showToast(`Updating Mujic to ${latest}…`, 'system_update');
                    try { const registration = await navigator.serviceWorker?.getRegistration(); if (registration) await registration.update(); } catch (e) { Utils.warn(e); }
                    setTimeout(() => location.reload(), 450);
                    return true;
                } catch (error) {
                    if (manual) UI.showToast(`Couldn't check for updates. ${error?.message || 'Check your connection.'}`, 'error');
                    else console.warn('Mujic update check failed', error);
                    return false;
                }
            },
            setupSettingsGroups: () => {
                const root = document.getElementById('view-settings');
                if (!root || root.dataset.grouped === '1') return;
                root.dataset.grouped = '1';
                const title = root.querySelector(':scope > h1');
                const sections = Array.from(root.querySelectorAll(':scope > .settings-section'));
                const footer = Array.from(root.children).find(el => el !== title && !el.classList.contains('settings-section') && el.tagName === 'DIV');
                const overview = document.createElement('div');
                overview.id = 'settings-overview'; overview.className = 'settings-overview';
                overview.innerHTML = `<div class="settings-overview-intro"><div class="settings-overview-kicker">PREFERENCES</div><div class="settings-overview-copy">Personalize your listening experience, playback, lyrics and library.</div></div>`;
                const searchBar=document.createElement('div');searchBar.className='settings-search-bar';searchBar.innerHTML='<input id="settings-search-input" class="settings-search-input" type="search" placeholder="Search settings…" aria-label="Search settings" autocomplete="off">';
                const defs = [
                    {id:'appearance', title:'UI & Customization', description:'Themes, accent colours, surfaces, corners and motion', icon:'palette', headings:['Appearance']},
                    {id:'player', title:'Player & Audio', description:'Waveform, playback, equalizer, audio effects and keyboard shortcuts', icon:'graphic_eq', headings:['Player','Playback','Playback Effects','Keyboard Shortcuts']},
                    {id:'lyrics', title:'Lyrics', description:'Lyrics providers, position and typography', icon:'lyrics', headings:['Lyrics Providers','Lyrics Display']},
                    {id:'library', title:'Library & Listening', description:'Sort, listening stats, exports and stored files', online:'Streaming library, listening stats, backups and offline cache', icon:'library_music', headings:['Library','Streaming Library','Your Listening','Streaming Listening','Data Export','Storage','Streaming Cache']},
                    {id:'app', title:'App & About', description:'Installation, project links, release notes, privacy and app information', icon:'apps', headings:['App','Extras','Privacy','About Mujic','Change & Update Log']}
                ];
                const pages = document.createElement('div'); pages.id = 'settings-pages';
                for (const def of defs) {
                    const card = document.createElement('button'); card.type='button'; card.className='settings-category-card';
                    card.dataset.action='open-settings-group'; card.dataset.group=def.id;
                    card.innerHTML = `<span class="settings-category-icon material-symbols-rounded">${def.icon}</span><span class="settings-category-copy"><strong>${def.title}</strong>${def.online ? `<small data-mode="offline">${def.description}</small><small data-mode="online">${def.online}</small>` : `<small>${def.description}</small>`}</span><span class="material-symbols-rounded settings-category-chevron">chevron_right</span>`;
                    overview.appendChild(card);
                    const page = document.createElement('div'); page.className='settings-subpage hidden'; page.dataset.settingsGroup=def.id; page.id=`settings-group-${def.id}`;
                    const head=document.createElement('div'); head.className='settings-subpage-header';
                    head.innerHTML=`<button type="button" class="icon-btn settings-back-btn" data-action="settings-group-back" aria-label="Back to settings"><span class="material-symbols-rounded">arrow_back</span></button><div><h2>${def.title}</h2>${def.online ? `<p data-mode="offline">${def.description}</p><p data-mode="online">${def.online}</p>` : `<p>${def.description}</p>`}</div>`;
                    page.appendChild(head);
                    for (const section of sections) {
                        const h=section.querySelector('.section-title');
                        if (h && def.headings.includes(h.textContent.trim())) page.appendChild(section);
                    }
                    pages.appendChild(page);
                }
                const insertionPoint = title && title.parentNode === root ? title.nextSibling : root.firstChild;
                if (insertionPoint && insertionPoint.parentNode === root) {
                    root.insertBefore(searchBar, insertionPoint);
                    root.insertBefore(overview, searchBar.nextSibling);
                } else { root.appendChild(searchBar); root.appendChild(overview); }
                root.appendChild(pages);
                if (footer) { const appPage=pages.querySelector('[data-settings-group="app"]'); if(appPage) appPage.appendChild(footer); }
                const analyticsToggle=root.querySelector('#analytics-consent-toggle');
                if(analyticsToggle) {
                    analyticsToggle.checked=Boolean(window.MujicAnalytics?.isEnabled?.());
                    if(analyticsToggle.dataset.bound!=='1'){
                        analyticsToggle.dataset.bound='1';
                        analyticsToggle.addEventListener('change',()=>{
                            const enabled=Boolean(analyticsToggle.checked);
                            window.MujicAnalytics?.setEnabled?.(enabled);
                            UI.showToast(enabled?'Anonymous analytics enabled.':'Analytics disabled. No new analytics requests will be made.','info');
                        });
                    }
                }
                const searchInput=searchBar.querySelector('input');
                let lastSettingsSearchTerm='';
                let settingsFilterTimer=0;
                const filterSettings=query=>{
                    const term=String(query||'').trim().toLowerCase();
                    const enteringSearch=Boolean(term&&!lastSettingsSearchTerm);
                    const overviewShown=!term;
                    overview.classList.toggle('hidden',!overviewShown);
                    overview.querySelectorAll('.settings-category-card').forEach(card=>{
                        const match=!term||card.textContent.toLowerCase().includes(term);
                        card.hidden=!match;
                    });
                    pages.querySelectorAll('.settings-subpage').forEach(page=>{
                        let pageMatches=false;
                        page.querySelectorAll('.settings-section').forEach(section=>{
                            const heading=section.querySelector('.section-title')?.textContent.toLowerCase()||'';
                            const headingMatch=Boolean(term&&heading.includes(term));
                            let sectionMatches=!term||headingMatch;
                            section.querySelectorAll('.settings-row').forEach(row=>{
                                const text=row.textContent.toLowerCase();
                                const match=!term||headingMatch||text.includes(term);
                                row.hidden=!match;
                                if(match)sectionMatches=true;
                            });
                            section.hidden=!sectionMatches;
                            if(sectionMatches)pageMatches=true;
                        });
                        const pageVisible=Boolean(term&&pageMatches);
                        page.classList.toggle('active',pageVisible);
                        page.classList.toggle('hidden',term?!pageVisible:true);
                    });
                    if(term){
                        const title=root.querySelector(':scope > h1');if(title)title.classList.add('hidden');
                        State.settingsGroup=null;
                        /* Only reset scroll when search starts; scrolling every keypress caused jumps and forced layout. */
                        if(enteringSearch){const main=document.getElementById('main-content');if(main)main.scrollTop=0;else window.scrollTo({top:0,behavior:'auto'});}
                    } else {
                        const selected=State.settingsGroup;
                        const title=root.querySelector(':scope > h1');if(title)title.classList.toggle('hidden',Boolean(selected));
                        overview.classList.toggle('hidden',Boolean(selected));
                        sections.forEach(section=>{section.hidden=false;section.querySelectorAll('.settings-row').forEach(row=>row.hidden=false);});
                        pages.querySelectorAll('.settings-subpage').forEach(page=>{const match=page.dataset.settingsGroup===selected;page.classList.toggle('active',Boolean(selected&&match));page.classList.toggle('hidden',!selected||!match);});
                    }
                    lastSettingsSearchTerm=term;
                };
                searchInput?.addEventListener('input',()=>{
                    window.clearTimeout(settingsFilterTimer);
                    settingsFilterTimer=window.setTimeout(()=>filterSettings(searchInput.value),45);
                });
            },
            setSettingsGroup: (group, fromHistory = false) => {
                const root=document.getElementById('view-settings'); if(!root) return;
                const valid=['appearance','player','lyrics','library','app'];
                const selected=valid.includes(group) ? group : null;
                const title=root.querySelector(':scope > h1'); if(title) title.classList.toggle('hidden',!!selected);
                const overview=document.getElementById('settings-overview'); if(overview) overview.classList.toggle('hidden',!!selected);
                root.querySelectorAll('.settings-subpage').forEach(page=>{ const match=page.dataset.settingsGroup===selected; page.classList.toggle('active',match); page.classList.toggle('hidden',!match); });
                State.settingsGroup=selected;
                if(selected && !fromHistory) UI.pushHistoryState({mujic:true, view:'settings', player:false, sheet:null, settingsGroup:selected}, '#settings');
                if(!selected && !fromHistory && history.state?.mujic && history.state?.settingsGroup) UI.replaceHistoryState({mujic:true, view:'settings', player:false, sheet:null, settingsGroup:null}, '#settings');
                const main=document.getElementById('main-content'); if(main) main.scrollTop=0;
            },
            openSettingsGroup: (group) => { UI.setSettingsGroup(group, false); if (group === 'library') window.OnlineWorkspace?.renderSettings?.(); },
            backSettingsGroup: () => {
                if (UI.supportsUrlHistory() && history.state?.mujic && history.state?.settingsGroup) { try { history.back(); } catch (error) { UI.setSettingsGroup(null, true); } }
                else UI.setSettingsGroup(null, true);
            },
            setAccent: (c) => {
                const root = document.documentElement, b = document.body;
                if (c && c !== 'white') {
                    root.style.setProperty('--accent-color', c); b.style.setProperty('--accent-color', c); b.classList.remove('accent-default');
                    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
                    if (m) { const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, bl = n & 255; root.style.setProperty('--accent-ink', (r * 299 + g * 587 + bl * 114) / 1000 >= 150 ? '#000' : '#fff'); }
                    else root.style.removeProperty('--accent-ink');
                }
                else { root.style.removeProperty('--accent-color'); b.style.removeProperty('--accent-color'); root.style.removeProperty('--accent-ink'); b.classList.add('accent-default'); }
            },
            updatePlayerSettingsLabels: () => {
                const speed = Number(State.playbackRate);
                const speedLabel = Number.isFinite(speed) ? `${speed}x` : '1x';
                const eqLabels = {'off':'Flat', 'low':'Bass +3 dB', 'med':'Bass +6 dB', 'high':'Bass +9 dB', 'custom':'Custom'};
                document.getElementById('speed-status-label').innerText = speedLabel;
                document.getElementById('eq-status-label').innerText = eqLabels[State.eq] || 'Flat';
                document.getElementById('st-status-label').innerText = State.sleepTimer?.label || 'Off';
            },
            updateEQUI: () => {
                const bands = Array.isArray(State.eqBands) ? State.eqBands : [0,0,0,0,0];
                document.querySelectorAll('[data-eq-band]').forEach(input => {
                    const i = Number(input.dataset.eqBand); const value = Number(bands[i]) || 0;
                    input.value = value;
                    const valueEl = input.closest('.eq-band')?.querySelector('.eq-value');
                    if (valueEl) valueEl.textContent = `${value > 0 ? '+' : ''}${value} dB`;
                });
                const preset = State.eqPreset || (State.eq === 'off' ? 'flat' : 'custom');
                const sum = bands.reduce((a,b)=>a+Number(b||0),0);
                const labelMap = { flat:'Flat', bass:'Bass', vocal:'Vocal', rock:'Rock', treble:'Treble', custom:'Custom' };
                const label = labelMap[preset] || 'Custom';
                const summary = document.getElementById('eq-summary-label');
                if(summary) summary.innerText = preset === 'custom' ? `Custom ${sum > 0 ? '+' : ''}${sum} dB` : label;
                document.querySelectorAll('.eq-preset').forEach(btn => {
                    const isActive = btn.dataset.val === preset;
                    btn.classList.toggle('active', isActive);
                    btn.classList.toggle('custom-active', preset === 'custom' && btn.dataset.val !== 'custom');
                    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                });
                document.getElementById('eq-status-label').innerText = preset === 'custom' ? 'Custom' : label;
            },
            updateStatsUI: () => {
                const s=Stats.summary();
                const settingsGrid = document.getElementById('settings-stats-grid');
                if (settingsGrid) {
                    settingsGrid.innerHTML = `
                        <div class="settings-stat-card"><span class="stat-kicker">Today</span><strong>${s.today.plays}</strong><span>${Stats.formatMinutes(s.today.seconds)}</span></div>
                        <div class="settings-stat-card"><span class="stat-kicker">This week</span><strong>${s.week.plays}</strong><span>${Stats.formatMinutes(s.week.seconds)}</span></div>
                        <div class="settings-stat-card"><span class="stat-kicker">This month</span><strong>${s.month.plays}</strong><span>${Stats.formatMinutes(s.month.seconds)}</span></div>
                        <div class="settings-stat-card"><span class="stat-kicker">All time</span><strong>${s.all.plays}</strong><span>${Stats.formatMinutes(s.all.seconds)}</span></div>`;
                }
                const settingsTop = document.getElementById('settings-stats-top');
                if (settingsTop) {
                    const monthKeys = Stats._monthKeys();
                    const map = monthKeys.reduce((acc,key) => { const day=State.playStats?.days?.[key]; if(day) Object.entries(day.tracks||{}).forEach(([id,n])=>acc[id]=(acc[id]||0)+Number(n||0)); return acc; }, {});
                    const ranked = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
                    settingsTop.innerHTML = `<div class="settings-top-list-title">Most played this month</div>` + (ranked.length ? ranked.map(([id,count],i)=>{ const t=State.library.find(x=>x.id===id); return `<div class="settings-top-row"><span class="settings-top-rank">${i+1}</span><span class="settings-top-song">${t?Utils.escapeHTML(t.title):'Removed track'}</span><span class="settings-top-count">${count} plays</span></div>`; }).join('') : `<div class="settings-top-row"><span class="settings-top-rank">—</span><span class="settings-top-song">Play some music to build your listening history.</span><span class="settings-top-count"></span></div>`);
                }
                const monthly = document.getElementById('settings-monthly-stats'); if(monthly) monthly.innerText=`${s.month.plays} plays • ${Stats.formatMinutes(s.month.seconds)}`;
            },
            importData: async (file) => {
                if (!file) return;
                try {
                    if (file.size > 10 * 1024 * 1024) throw new Error('Choose a JSON export smaller than 10 MB.');
                    const data = JSON.parse(await file.text());
                    if (data && data.app === 'Mujic' && data.type === 'mujic-streaming-library') {
                        const accepted = await Dialog.show({ type:'confirm', title:'Import streaming library', message:'Merge liked songs, playlists and history from this file into your streaming library?', confirmText:'Import' });
                        if (accepted) OnlineWorkspace.importStreamingLibrary(data);
                        return;
                    }
                    if (!data || data.app !== 'Mujic' || (!data.settings && !data.playStats && !Array.isArray(data.playHistory))) {
                        throw new Error('This file is not a supported Mujic settings or listening-data export.');
                    }
                    const settings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : null;
                    const hasStats = data.playStats && typeof data.playStats === 'object' && data.playStats.days && typeof data.playStats.days === 'object';
                    const hasHistory = Array.isArray(data.playHistory);
                    const confirmed = await Dialog.show({ type:'confirm', title:'Import Mujic data', message:`Import ${settings ? 'settings' : ''}${settings && (hasStats || hasHistory) ? ' and ' : ''}${hasStats || hasHistory ? 'listening data' : ''}? Imported settings replace matching preferences. Listening-data imports replace current listening statistics/history. Your songs and audio files are not changed.`, confirmText:'Import data' });
                    if (!confirmed) return;

                    if (settings) {
                        const allowed = new Set(['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsShareStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsWordByWord','lyricsShareEnabled','lyricsShareStyle','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled','lowEndModeActive']);
                        const boolKeys = new Set(['lowEndMode','resumePlayback','showArtworkLists','muted','shuffle','crossfade','skipSilence','instantSkipSilence','loudnessControl','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled','lyricsWordByWord','lyricsShareEnabled']);
                        const stringEnums = {
                            theme:['system','light','dark'], accentPreset:['dynamic','custom','default'], surfaceTheme:['oled','graphite','midnight','warm','forest'], textScale:['compact','normal','large'], layoutDensity:['compact','comfortable','spacious'], performanceProfile:['auto','low-end','full'], lyricsStyle:['apple','spotify','neon'], lyricsShareStyle:['mujic','spotify'], lyricsPosition:['upper','center','lower'], lyricsFontSize:['compact','normal','large','extra-large'], lyricsLineSpacing:['compact','normal','relaxed'], lyricsWidth:['narrow','standard','wide'], lyricsEmphasis:['soft','standard','strong','off'], interfaceStyle:['subtle','strong','off'], cornerRadius:['sharp','medium','rounded','extra'], motion:['auto','full','reduced'], playerBackground:['artwork','solid','black'], playerArtworkMode:['full','contained'], librarySort:['dateAdded','title','artist','album'], librarySortDir:['asc','desc'], loudnessLevel:['soft','balanced','strong'], eq:['off','low','med','high'], eqPreset:['flat','bass','vocal','rock','treble','custom']
                        };
                        for (const [key,value] of Object.entries(settings)) {
                            if (!allowed.has(key)) continue;
                            if (boolKeys.has(key)) { if (typeof value === 'boolean') State[key] = value; continue; }
                            if (key === 'interfaceStyle') { const mapped = value === 'glass' ? 'subtle' : value === 'solid' ? 'off' : value; if (['subtle','strong','off'].includes(mapped)) State.interfaceStyle = mapped; continue; }
                            if (key === 'cornerRadius') { const mapped = value === 'pill' ? 'extra' : value; if (['sharp','medium','rounded','extra'].includes(mapped)) State.cornerRadius = mapped; continue; }
                            if (stringEnums[key]) { if (typeof value === 'string' && stringEnums[key].includes(value)) State[key] = value; continue; }
                            if (key === 'eqBands') { if (Array.isArray(value) && value.length === 5 && value.every(v => Number.isFinite(Number(v)))) State.eqBands = value.map(v => Math.max(-12,Math.min(12,Number(v)))); continue; }
                            if (key === 'visualizerMode') { State.visualizerMode = value === 'off' ? 'off' : 'wave'; continue; }
                            if (key === 'waveformStyle') { if (['default','wavy','slim','squiggly'].includes(value)) State.waveformStyle = value; continue; }
                            if (typeof value === 'number' && Number.isFinite(value)) {
                                if (['volume'].includes(key)) State[key] = Math.max(0,Math.min(1,value));
                                else if (key === 'playbackRate') State[key] = Math.max(0.5,Math.min(3,value));
                                else if (key === 'lyricsVerticalOffset') State[key] = Math.max(-8,Math.min(8,value));
                                else if (key === 'lyricsTimingOffset') State[key] = Math.max(-2,Math.min(2,Math.round(value*10)/10));
                                else if (key === 'lyricsWidth') continue;
                                else if (key === 'repeat') State.repeat = [0,1,2].includes(Math.round(value)) ? Math.round(value) : 0;
                                else if (key === 'seekStep') State.seekStep = [5,10,15,30].includes(value) ? value : 10;
                                else State[key] = value;
                            }
                            if (key === 'accentColor' && typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) State.accentColor = value;
                        }
                        State.lowEndModeActive = State.lowEndMode || State.performanceProfile === 'low-end';
                    }
                    if (hasStats) {
                        const days = {};
                        for (const [day,record] of Object.entries(data.playStats.days).slice(0,2500)) {
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !record || typeof record !== 'object') continue;
                            const tracks = {};
                            if (record.tracks && typeof record.tracks === 'object') Object.entries(record.tracks).slice(0,1000).forEach(([id,n]) => { const count=Number(n); if(id && Number.isFinite(count) && count>=0) tracks[String(id).slice(0,180)]=Math.floor(count); });
                            days[day] = { plays:Math.max(0,Math.floor(Number(record.plays)||0)), seconds:Math.max(0,Number(record.seconds)||0), tracks };
                        }
                        State.playStats = { days };
                    }
                    if (hasHistory) await StorageAdapter.replacePlayHistory(data.playHistory);
                    await StorageAdapter.saveSettings();
                    UI.applySettings(); AudioAdapter.applySettings(); AudioAdapter.resizeVisualizer();
                    UI.updateVisualizerUI(); UI.updateWaveformStyleUI(); UI.updatePlayerSettingsLabels(); UI.updateEQUI(); UI.updateStatsUI(); UI.updateStatsSettings?.();
                    if (hasHistory) {
                        const entries = await StorageAdapter.getRecentPlayHistory(151);
                        State.playHistory = entries.slice(0,150); State.playHistoryOffset = State.playHistory.length; State.playHistoryHasMore = entries.length > 150;
                        State.history = [...new Set(entries.map(entry => entry.trackId).filter(id => id && State.library.some(track => track.id === id)))].slice(0,100);
                    }
                    UI.renderHome();
                    UI.showToast('Mujic data imported.', 'check_circle');
                } catch (error) {
                    UI.showToast(`Import failed: ${error?.message || 'This JSON file could not be imported.'}`, 'error');
                } finally {
                    const input = document.getElementById('data-import-input'); if(input) input.value='';
                }
            },
            exportData: async (kind) => {
                const settingKeys = ['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsWordByWord','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','sleepTimer','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled'];
                const settings = {}; settingKeys.forEach(key => { if (State[key] !== undefined) settings[key] = State[key]; });
                let payload;
                if (kind === 'settings') {
                    payload = { exportedAt: new Date().toISOString(), app: 'Mujic', settings };
                } else {
                    let fullHistory = [];
                    try { fullHistory = await StorageAdapter.getAllPlayHistory(); } catch (e) { Utils.warn(e); }
                    payload = { exportedAt: new Date().toISOString(), app: 'Mujic', playStats: State.playStats || { days: {} }, summary: Stats.summary(), playHistory: fullHistory };
                }
                const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `mujic-${kind}-${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                UI.showToast(`${kind === 'settings' ? 'Settings' : 'Listening stats'} exported`, 'download');
            },
            updateVisualizerUI: () => {
                const labels = { default:'Default', wavy:'Wavy', slim:'Slim', squiggly:'Squiggly' };
                const enabled = State.visualizerMode === 'wave';
                const label = enabled ? (labels[State.waveformStyle] || 'Wavy') : 'Off';
                ['waveform-style-summary','waveform-style-sheet-summary','visualizer-settings-summary','visualizer-status-label','visualizer-summary-label','visualizer-settings-summary'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.textContent = label;
                });
                document.querySelectorAll('[data-action="set-waveform-style"]').forEach(el => {
                    const active = el.dataset.val === 'off' ? !enabled : (enabled && el.dataset.val === State.waveformStyle);
                    el.classList.toggle('active-state', active); el.setAttribute('aria-pressed', String(active));
                });
                const fullPlayer = document.getElementById('full-player');
                const miniPlayer = document.getElementById('mini-player');
                const fullActive = !!(enabled && State.isFullPlayerOpen && fullPlayer?.classList.contains('active'));
                const miniActive = !!(enabled && miniPlayer?.classList.contains('visible'));
                const scrubber = document.getElementById('scrubber-bar');
                if (scrubber) {
                    scrubber.classList.toggle('visualizer-active', fullActive);
                    const canvas = document.getElementById('scrubber-visualizer');
                    if (canvas) canvas.style.display = fullActive ? 'block' : 'none';
                    if (!fullActive && canvas) { const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0,0,canvas.width,canvas.height); }
                }
                if (miniPlayer) miniPlayer.classList.toggle('waveform-active', miniActive);
                const miniCanvas = document.getElementById('mini-visualizer');
                if (miniCanvas) {
                    miniCanvas.style.display = miniActive ? 'block' : 'none';
                    if (!miniActive) { const ctx = miniCanvas.getContext('2d'); if (ctx) ctx.clearRect(0,0,miniCanvas.width,miniCanvas.height); }
                }
                if (enabled && AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                else if (!enabled) AudioAdapter.stopVisualizerLoop();
            },
            updateWaveformStyleUI: () => { UI.updateVisualizerUI(); },
            applySettings: () => {
                const root = document.documentElement;
                const cores = Number(navigator.hardwareConcurrency) || 0;
                const memory = Number(navigator.deviceMemory) || 0;
                const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                const saveData = !!(navigator.connection && navigator.connection.saveData);
                const constrainedDevice = (cores > 0 && cores <= 2) || (memory > 0 && memory <= 2) || saveData;
                const profile = ['auto','low-end','full'].includes(State.performanceProfile) ? State.performanceProfile : 'auto';
                const lowEndActive = profile === 'low-end' || (profile === 'auto' && (constrainedDevice || State.lowEndMode));
                State.lowEndModeActive = lowEndActive;
                document.body.dataset.performanceProfile = profile;
                document.body.setAttribute('data-performance-profile', profile);
                document.body.classList.toggle('low-end-mode', lowEndActive);
                document.body.classList.remove('theme-light');
                if (State.theme === 'light') document.body.classList.add('theme-light');
                else if (State.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches) { document.body.classList.add('theme-light'); }
                document.body.classList.remove('surface-graphite','surface-midnight','surface-warm','surface-forest');
                if (!document.body.classList.contains('theme-light') && ['graphite','midnight','warm','forest'].includes(State.surfaceTheme)) document.body.classList.add(`surface-${State.surfaceTheme}`);
                document.body.classList.remove('text-scale-compact','text-scale-normal','text-scale-large','layout-compact','layout-comfortable','layout-spacious');
                document.body.classList.add(`text-scale-${['compact','normal','large'].includes(State.textScale) ? State.textScale : 'normal'}`);
                document.body.classList.add(`layout-${['compact','comfortable','spacious'].includes(State.layoutDensity) ? State.layoutDensity : 'comfortable'}`);
                document.body.classList.remove('lyrics-position-upper','lyrics-position-center','lyrics-position-lower','lyrics-size-compact','lyrics-size-normal','lyrics-size-large','lyrics-size-extra-large','lyrics-spacing-compact','lyrics-spacing-normal','lyrics-spacing-relaxed','lyrics-width-narrow','lyrics-width-standard','lyrics-width-wide','lyrics-emphasis-soft','lyrics-emphasis-standard','lyrics-emphasis-strong','lyrics-emphasis-off');
                document.body.classList.add(`lyrics-position-${['upper','center','lower'].includes(State.lyricsPosition) ? State.lyricsPosition : 'center'}`);
                document.body.classList.add(`lyrics-size-${['compact','normal','large','extra-large'].includes(State.lyricsFontSize) ? State.lyricsFontSize : 'normal'}`);
                document.body.classList.add(`lyrics-spacing-${['compact','normal','relaxed'].includes(State.lyricsLineSpacing) ? State.lyricsLineSpacing : 'normal'}`);
                document.body.classList.add(`lyrics-width-${['narrow','standard','wide'].includes(State.lyricsWidth) ? State.lyricsWidth : 'standard'}`);
                document.body.classList.add(`lyrics-emphasis-${['soft','standard','strong','off'].includes(State.lyricsEmphasis) ? State.lyricsEmphasis : 'soft'}`);
                const lyricsOffset = Math.max(-8, Math.min(8, Number(State.lyricsVerticalOffset) || 0));
                root.style.setProperty('--lyrics-offset', `${lyricsOffset}vh`);
                const lyricsWidth = ({narrow:'72%',standard:'92%',wide:'100%'})[State.lyricsWidth] || '92%';
                root.style.setProperty('--lyrics-line-width', lyricsWidth);
                const timingLabel = document.getElementById('lyrics-timing-value'); if (timingLabel) { const tv = Number(State.lyricsTimingOffset) || 0; timingLabel.innerText = `${tv > 0 ? '+' : ''}${tv.toFixed(1)}`; }
                const lyricsOffsetLabel = document.getElementById('lyrics-offset-value'); if (lyricsOffsetLabel) lyricsOffsetLabel.innerText = `${lyricsOffset > 0 ? '+' : ''}${lyricsOffset}`;
                
                UI.setAccent(State.accentPreset === 'custom' ? State.accentColor : (State.accentPreset === 'dynamic' ? null : State.accentPreset));
                
                const interfaceStyle = ['subtle','strong','off'].includes(State.interfaceStyle) ? State.interfaceStyle : 'subtle';
                State.interfaceStyle = interfaceStyle;
                document.body.dataset.interfaceStyle = interfaceStyle;
                document.body.setAttribute('data-interface-style', interfaceStyle);
                /* Glass colours must follow the active theme. They used to be hard-coded dark, which made the
                   sidebar, mini player, sheets and cards unreadable (black text on dark glass) in light mode. */
                const lightTheme = document.body.classList.contains('theme-light');
                const glass = lightTheme ? {
                    off:    { bg: 'var(--bg-elevated)', panel: 'var(--bg-elevated)', blur: 'blur(0px)', border: '1px solid var(--border-subtle)', panelBorder: '1px solid var(--border-subtle)', shadow: 'none' },
                    strong: { bg: 'rgba(255,255,255,.56)', panel: 'rgba(255,255,255,.62)', blur: 'blur(38px) saturate(165%)', border: '1px solid rgba(0,0,0,.08)', panelBorder: '1px solid rgba(0,0,0,.09)', shadow: '0 22px 60px rgba(0,0,0,.12)' },
                    subtle: { bg: 'rgba(255,255,255,.80)', panel: 'rgba(255,255,255,.78)', blur: 'blur(24px) saturate(140%)', border: '1px solid rgba(0,0,0,.07)', panelBorder: '1px solid rgba(0,0,0,.08)', shadow: '0 18px 54px rgba(0,0,0,.10)' }
                } : {
                    off:    { bg: 'var(--bg-elevated)', panel: 'var(--bg-elevated)', blur: 'blur(0px)', border: '1px solid var(--border-subtle)', panelBorder: '1px solid var(--border-subtle)', shadow: 'none' },
                    strong: { bg: 'rgba(10,10,10,.38)', panel: 'rgba(10,10,10,.42)', blur: 'blur(38px) saturate(155%)', border: '1px solid rgba(255,255,255,.14)', panelBorder: '1px solid rgba(255,255,255,.14)', shadow: '0 22px 60px rgba(0,0,0,.24)' },
                    subtle: { bg: 'rgba(10,10,10,.65)', panel: 'rgba(12,12,12,.62)', blur: 'blur(24px) saturate(135%)', border: '1px solid rgba(255,255,255,.08)', panelBorder: '1px solid rgba(255,255,255,.09)', shadow: '0 18px 54px rgba(0,0,0,.2)' }
                };
                const g = glass[interfaceStyle] || glass.subtle;
                const bs = document.body.style;
                bs.setProperty('--glass-bg', g.bg); bs.setProperty('--glass-panel-bg', g.panel); bs.setProperty('--glass-blur', g.blur);
                bs.setProperty('--glass-border', g.border); bs.setProperty('--glass-panel-border', g.panelBorder); bs.setProperty('--glass-panel-shadow', g.shadow);

                const cornerRadius = ['sharp','medium','rounded','extra'].includes(State.cornerRadius) ? State.cornerRadius : 'rounded';
                State.cornerRadius = cornerRadius;
                document.body.dataset.cornerRadius = cornerRadius;
                document.body.setAttribute('data-corner-radius', cornerRadius);
                const radiusProfiles = {
                    sharp:   {sm:'0px', md:'0px', lg:'0px', panel:'0px', hero:'0px', action:'0px'},
                    medium:  {sm:'4px', md:'8px', lg:'12px', panel:'12px', hero:'14px', action:'10px'},
                    rounded: {sm:'8px', md:'12px', lg:'16px', panel:'14px', hero:'20px', action:'9999px'},
                    extra:   {sm:'16px', md:'24px', lg:'32px', panel:'24px', hero:'30px', action:'24px'}
                };
                const radius = radiusProfiles[cornerRadius];
                root.style.setProperty('--radius-sm', radius.sm);
                root.style.setProperty('--radius-md', radius.md);
                root.style.setProperty('--radius-lg', radius.lg);
                root.style.setProperty('--panel-radius', radius.panel);
                root.style.setProperty('--radius-hero', radius.hero);
                root.style.setProperty('--radius-action', radius.action);

                const motionMode = ['auto','full','reduced'].includes(State.motion) ? State.motion : 'auto';
                State.motion = motionMode;
                document.body.dataset.motion = motionMode;
                const adaptiveReducedMotion = reducedMotion || motionMode === 'reduced' || (motionMode === 'auto' && lowEndActive);
                document.body.classList.toggle('reduced-motion', adaptiveReducedMotion);
                
                const cornerControl = document.getElementById('corner-radius'); if (cornerControl && cornerControl.value !== State.cornerRadius) cornerControl.value = State.cornerRadius || 'rounded';
                const artContainer = document.getElementById('player-art-container');
                if (State.playerArtworkMode === 'contained') artContainer.classList.add('contained'); else artContainer.classList.remove('contained');

                const lyricsContainer = document.getElementById('lyrics-content');
                lyricsContainer.classList.remove('lyrics-style-apple','lyrics-style-spotify','lyrics-style-neon');
                lyricsContainer.classList.add(`lyrics-style-${State.lyricsStyle || 'apple'}`);
                if (State.currentLyrics && !State.currentLyrics.isSynced) lyricsContainer.classList.add('un-synced');

                document.querySelectorAll('.settings-control').forEach(el => {
                    const key = el.dataset.setting;
                    if(key === 'accentColor') el.value = State.accentColor;
                    else if(el.type === 'checkbox') el.checked = State[key];
                    else if (State[key] !== undefined) el.value = State[key];
                    if(key === 'accentPreset') { document.getElementById('accent-color').style.display = State.accentPreset === 'custom' ? 'block' : 'none'; }
                });
                const lyricShareAction = document.getElementById('player-more-share-lyrics');
                if (lyricShareAction) {
                    const disabled = State.lyricsShareEnabled === false;
                    lyricShareAction.hidden = disabled;
                    lyricShareAction.classList.toggle('hidden', disabled);
                    if (disabled && window.LyricsShare?.isSelecting?.()) window.LyricsShare.cancelSelection();
                }
                
                const fullBg = document.getElementById('full-bg');
                if (fullBg) fullBg.dataset.backgroundMode = State.playerBackground || 'artwork';
                const currentTrack = State.currentTrackId ? Player.getCurrentTrack() : null;
                if (State.playerBackground === 'solid') { fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = 'var(--bg-elevated)'; }
                else if (State.playerBackground === 'black' || !currentTrack) { fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = '#000000'; }
                else {
                    const art = document.getElementById('full-art');
                    if (art && art.src) { fullBg.style.backgroundImage = `url("${art.src.replace(/"/g, '%22')}")`; fullBg.style.backgroundColor = 'transparent'; }
                    if (State.accentPreset === 'dynamic' && currentTrack) ArtworkCache.getAverageColor(currentTrack).then(color => { if (State.currentTrackId === currentTrack.id && State.accentPreset === 'dynamic') UI.setAccent(color); }).catch(()=>{});
                }
                UI.updatePlayerSettingsLabels(); UI.updateEQUI(); UI.updateVisualizerUI(); UI.updateWaveformStyleUI();
            },
            resetAppearance: () => {
                State.theme = 'system'; State.accentPreset = 'dynamic'; State.accentColor = '#ffffff'; State.surfaceTheme = 'oled'; State.interfaceStyle = 'subtle'; State.cornerRadius = 'rounded'; State.motion = 'auto'; State.lyricsStyle = 'apple'; State.textScale = 'normal'; State.layoutDensity = 'comfortable'; State.performanceProfile = 'auto';
                StorageAdapter.saveSettings(); UI.applySettings(); UI.showToast("Appearance restored", "refresh");
            },
            setupInstallPrompt: () => {
                if (State.installPromptListenersReady) { UI.updateInstallUI(); return; }
                State.installPromptListenersReady = true;
                window.addEventListener('appinstalled', () => { State.deferredInstallPrompt = null; UI.updateInstallUI(); UI.showToast('Mujic installed', 'check_circle'); });
                ['standalone','window-controls-overlay','minimal-ui','fullscreen'].forEach(mode => {
                    try { window.matchMedia(`(display-mode: ${mode})`).addEventListener?.('change', UI.updateInstallUI); } catch (_) {}
                });
                window.addEventListener('focus', UI.updateInstallUI, {passive:true});
                document.addEventListener('visibilitychange', () => { if (!document.hidden) UI.updateInstallUI(); }, {passive:true});
                UI.updateInstallUI();
            },
            updateInstallUI: () => {
                const btn=document.getElementById('install-pwa-btn'); if(!btn) return;
                const standalone=Utils.isInstalledApp();
                btn.disabled=standalone;
                btn.innerText=standalone?'Installed':'Install';
                const desc=document.getElementById('install-pwa-desc');
                if(desc) desc.innerText=standalone ? 'Mujic is installed on this device.' : (State.deferredInstallPrompt ? 'Install Mujic as a standalone app.' : (Utils.isIOS() ? 'Use Share → Add to Home Screen in Safari.' : 'Install Mujic from your browser when the install option is available.'));
            },
            installPWA: async () => {
                const standalone=Utils.isInstalledApp();
                if(standalone){ UI.showToast('Mujic is already installed', 'check_circle'); return; }
                const prompt=State.deferredInstallPrompt;
                if(prompt){
                    try { await prompt.prompt(); await prompt.userChoice; } catch (e) { Utils.warn(e); }
                    State.deferredInstallPrompt=null; UI.updateInstallUI(); return;
                }
                if(Utils.isIOS()) {
                    await Dialog.show({type:'confirm', title:'Install Mujic', message:'In Safari, tap Share and choose “Add to Home Screen”. Then open Mujic from your Home Screen for the standalone app experience.', confirmText:'Got it'});
                } else {
                    UI.showToast('Your browser has not exposed the install prompt yet. Open the browser menu and choose Install / Add to Home Screen when available.', 'info');
                }
            },
        });
