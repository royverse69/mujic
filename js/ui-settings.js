/* Mujic UI module: settings: groups, appearance, EQ, stats, import/export, visualizer, install, update checks. Extends the UI object defined in ui.js. */
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
                const defs = [
                    {id:'appearance', title:'UI & Customization', description:'Themes, accent colours, surfaces, corners and motion', icon:'palette', headings:['Appearance']},
                    {id:'player', title:'Player & Audio', description:'Waveform, playback, equalizer, audio effects and keyboard shortcuts', icon:'graphic_eq', headings:['Player','Playback','Playback Effects','Keyboard Shortcuts']},
                    {id:'lyrics', title:'Lyrics', description:'Lyrics providers, position and typography', icon:'lyrics', headings:['Lyrics Providers','Lyrics Display']},
                    {id:'library', title:'Library & Listening', description:'Sort, listening stats, exports and stored files', icon:'library_music', headings:['Library','Your Listening','Data Export','Storage']},
                    {id:'app', title:'App & About', description:'Installation, project links, release notes and app information', icon:'apps', headings:['App','Extras','About Mujic','Change & Update Log']}
                ];
                const pages = document.createElement('div'); pages.id = 'settings-pages';
                for (const def of defs) {
                    const card = document.createElement('button'); card.type='button'; card.className='settings-category-card';
                    card.dataset.action='open-settings-group'; card.dataset.group=def.id;
                    card.innerHTML = `<span class="settings-category-icon material-symbols-rounded">${def.icon}</span><span class="settings-category-copy"><strong>${def.title}</strong><small>${def.description}</small></span><span class="material-symbols-rounded settings-category-chevron">chevron_right</span>`;
                    overview.appendChild(card);
                    const page = document.createElement('div'); page.className='settings-subpage hidden'; page.dataset.settingsGroup=def.id; page.id=`settings-group-${def.id}`;
                    const head=document.createElement('div'); head.className='settings-subpage-header';
                    head.innerHTML=`<button type="button" class="icon-btn settings-back-btn" data-action="settings-group-back" aria-label="Back to settings"><span class="material-symbols-rounded">arrow_back</span></button><div><h2>${def.title}</h2><p>${def.description}</p></div>`;
                    page.appendChild(head);
                    for (const section of sections) {
                        const h=section.querySelector('.section-title');
                        if (h && def.headings.includes(h.textContent.trim())) page.appendChild(section);
                    }
                    pages.appendChild(page);
                }
                // The sections have already been moved into their category pages,
                // so sections[0] is no longer a child of root. Never use it as an
                // insertBefore reference after reparenting; insert next to the title.
                const insertionPoint = title && title.parentNode === root ? title.nextSibling : root.firstChild;
                if (insertionPoint && insertionPoint.parentNode === root) root.insertBefore(overview, insertionPoint);
                else root.appendChild(overview);
                root.appendChild(pages);
                if (footer) { const appPage=pages.querySelector('[data-settings-group="app"]'); if(appPage) appPage.appendChild(footer); }
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
            openSettingsGroup: (group) => { UI.setSettingsGroup(group, false); if (group === 'app') UI.loadChangeLog(); },
            backSettingsGroup: () => {
                if (UI.supportsUrlHistory() && history.state?.mujic && history.state?.settingsGroup) { try { history.back(); } catch (error) { UI.setSettingsGroup(null, true); } }
                else UI.setSettingsGroup(null, true);
            },
            loadChangeLog: async (force = false) => {
                const root = document.getElementById('changelog-content');
                if (!root || (root.dataset.loaded === '1' && !force)) return;
                root.innerHTML = '<div class="changelog-empty">Loading release notes…</div>';
                try {
                    // file:// origins cannot fetch sibling JSON files in Chrome/Edge. Use the
                    // already bundled fallback below instead of raising CORS/ERR_FAILED on startup.
                    if (location.protocol === 'file:') throw new Error('Use bundled release notes for local-file mode');
                    const changelogUrl = force ? `./changlog.json?refresh=${Date.now()}` : './changlog.json';
                    const response = await fetch(changelogUrl, { cache: force ? 'no-store' : 'default' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const data = await response.json();
                    if (!data || !Array.isArray(data.entries)) throw new Error('Invalid changlog.json format');
                    const entries = data.entries.slice(0, 20);
                    root.innerHTML = entries.length ? entries.map(entry => {
                        const changes = Array.isArray(entry.changes) ? entry.changes : [];
                        return `<article class="changelog-entry"><div class="changelog-entry-head"><strong>${Utils.escapeHTML(entry.title || `Mujic ${entry.version || ''}`)}</strong><span>${Utils.escapeHTML(entry.date || '')}</span></div><div class="changelog-version">${Utils.escapeHTML(entry.version || '')}</div>${changes.length ? `<ul>${changes.map(item => `<li>${Utils.escapeHTML(item)}</li>`).join('')}</ul>` : '<p>No details provided.</p>'}</article>`;
                    }).join('') : '<div class="changelog-empty">No release notes are available yet.</div>';
                    root.dataset.loaded = '1';
                } catch (error) {
                    // Keep the update page useful when launched from file:// or while offline.
                    const fallbackEntries = [
                        { version: '12.0.28', date: '2026-10-17', title: 'Artist profiles, suggestions and playlist deduplication', changes: [
                            'Rebuilt Home artist discovery around exact artist names, clickable portrait cards and artist-specific artwork fallback from the documented API response.',
                            'Fixed retry/pagination handling for artist catalogues and removed equivalent recordings from playlists, liked songs, history and automatic suggestions.',
                            'Added initials-based artist portrait fallbacks, tightened Offline Home spacing, aligned the mode toggle and repaired Settings descriptions while preserving the Offline layout.'
                        ]},
                        { version: '12.0.27', date: '2026-10-17', title: 'Artist catalogue and workspace polish', changes: [
                            'Added a swipeable, clickable Artist rail on Home and fixed artist-detail navigation.',
                            'Improved paginated artist loading, retry behavior, duplicate filtering, artwork fallbacks and share-link/song-ID opening.',
                            'Refined streaming Home spacing, mode-switch animation, Library-sharing copy and the Mujic footer wordmark while preserving the Offline workspace.'
                        ]},
                        { version: '12.0.20', date: '2026-10-17', title: 'Optional streaming playback (Beta)', changes: [
                            'Added an Offline / Online source switch; Offline remains the default on fresh installations.',
                            'Integrated the Machhar backend for online search and stream resolution while retaining Mujic’s audio engine and UI.',
                            'Added first-use consent, a visible beta warning, request timeouts, and session-only remote tracks and URLs.'
                        ]},
                        { version: '12.0.15', date: '2026-10-14', title: 'Desktop playlist navigation and player visual polish', changes: [
                            'Desktop users can scroll Home playlist and Top Picks rails with the mouse wheel; normal page scrolling is preserved at rail edges.',
                            'Hardened playlist detail opening and artwork refresh so a previous playlist cover cannot carry over.',
                            'Added a block-style drop shadow to the active Neon lyric line for more depth.',
                            'Changed the Default seek-bar waveform to an audio-responsive bar waveform and updated its settings preview.',
                            'Improved player-control tooltips and the Lyrics icon without changing playback or audio-processing behavior.',
                            'Versioned the service-worker cache so installed PWAs fetch the updated assets.'
                        ]},
                        { version: '12.0.14', date: '2026-10-13', title: 'About, Search and playlist picker polish', changes: [
                            'Added a proper GitHub brand icon and responsive About links for narrow screens.',
                            'Search empty state opens the music downloader in a new tab with the encoded search query.',
                            'Playlist Add Songs selects from tracks already in the library instead of opening the device picker.',
                            'Improved visible selected-state styling for Audio Waveform options.'
                        ]},
                        { version: '12.0.13', date: '2026-10-13', title: 'Restored Settings and core interactions', changes: [
                            'Restored missing action dispatch for song rows, Settings categories, library tabs, transport controls, history and playlist management.',
                            'Search playback now falls back to the full library when there is only one matching song, so Next can continue playing.',
                            'Wrapped delegated actions in error handling and guarded optional gesture controls to prevent silent UI failures.'
                        ]},
                        { version: '12.0.12', date: '2026-10-13', title: 'Startup and local-file navigation recovery', changes: [
                            'Guarded history URL writes on file:// launches so a SecurityError cannot stop navigation handlers from initializing.',
                            'Initialized UI subsystems independently so one optional UI failure cannot prevent main navigation from binding.',
                            'Moved UI initialization inside the app bootstrap error boundary.'
                        ]},
                        { version: '12.0.11', date: '2026-10-13', title: 'Home rail scrolling and launch reliability', changes: [
                            'Prevented a changelog fetch from file:// origins so the browser uses bundled release notes instead of logging a CORS failure.',
                            'Made Home playlist and Top Picks rails horizontally touch-scrollable with non-shrinking cards.',
                            'Renamed the player shortcut to Equalizer and the Bass preset label to Bass.'
                        ]},
                        { version: '12.0.10', date: '2026-10-13', title: 'Unified Audio Waveform settings and release consistency', changes: [
                            'Merged waveform activation and waveform style into one settings row that opens the correct selector.',
                            'Synchronized the application version, published VERSION and service-worker cache for reliable updates.',
                            'Kept Gemini song identification marked Coming soon with no active key manager or API calls.'
                        ]},
                        { version: '12.0.9', date: '2026-10-13', title: 'Unified player effects, update flow and data import', changes: [
                            'Merged Audio Waveform and seek-bar styling into one persistent setting and kept the effect stable across full and mini-player transitions.',
                            'Made mobile sheets opaque, removed active Gemini key/API support in favor of a coming-soon notice, and cleaned obsolete key storage.',
                            'Added automatic update notification, retained JSON settings/listening-data import, clarified Search empty states, and updated About links.'
                        ]},
                        { version: '12.0.8', date: '2026-10-13', title: 'Unified Audio Waveform and streamlined navigation', changes: [
                            'Combined the seek-bar effect and Audio Waveform into one setting with Off, Default, Wavy, Slim and Squiggly styles.',
                            'Favorite Artists now appears inside Your Playlists; search offers a music download link when no local results match.',
                            'Added a version update prompt, JSON settings/listening-data import, and a clearer About page with GitHub links.',
                            'Removed the experimental Gemini integration and purged saved Gemini keys from older settings data.'
                        ]},
                        { version: '12.0.7', date: '2026-10-12', title: 'Gemini API compatibility and key validation', changes: [
                            'Switched to gemini-3.8-flash first with compatible stable Flash model fallbacks if Google reports a model is unavailable.',
                            'Unified Gemini identification and Test keys requests, added detailed Google error messages, increased request timeout, and restored normal origin/referrer behavior for restricted keys.',
                            'Key save is verified by reading the key list back from IndexedDB; Test keys saves current inputs before testing.'
                        ]},
                        { version: '12.0.6', date: '2026-10-12', title: 'Navigation and settings polish', changes: [
                            'Added a compact Gemini API key help guide with key creation, paste/save instructions and common error tips.',
                            'Added Favorite Artists beside Playlists on wide Home layouts and touch swipes between the four main tabs.',
                            'Removed the old footer byline in favor of “Made with ♥ by Machhar” and cleared waveform visuals when disabled.'
                        ]},
                        { version: '12.0.5', date: '2026-10-11', title: 'Local Gemini keys and performance profile', changes: [
                            'Added a key manager for up to four locally stored Gemini API keys, with test and fallback rotation.',
                            'Removed the custom Gemini proxy and reduced waveform and artwork work on low-end devices.'
                        ]},
                        { version: '12.0.4', date: '2026-10-11', title: 'Performance and settings polish', changes: [
                            'Grouped preferences into focused settings pages and moved lyrics styling into Lyrics Display.',
                            'Added Low-End Device Mode to reduce GPU-heavy blur, shadows and nonessential motion.',
                            'Bundled release notes fallback so update history remains readable offline.'
                        ]},
                        { version: '12.0.3', date: '2026-10-11', title: 'Waveform and lyrics refinement', changes: [
                            'Reduced seek waveform height and movement, and limited drawing to the played section.',
                            'Added saved lyrics position, text size, line spacing, width and emphasis preferences.'
                        ]}
                    ];
                    root.innerHTML = fallbackEntries.map(entry => `<article class="changelog-entry"><div class="changelog-entry-head"><strong>${Utils.escapeHTML(entry.title)}</strong><span>${Utils.escapeHTML(entry.date)}</span></div><div class="changelog-version">${Utils.escapeHTML(entry.version)}</div><ul>${entry.changes.map(item => `<li>${Utils.escapeHTML(item)}</li>`).join('')}</ul></article>`).join('');
                    root.dataset.loaded = '1';
                }
            },
            setAccent: (c) => {
                const root = document.documentElement, b = document.body;
                if (c && c !== 'white') {
                    root.style.setProperty('--accent-color', c); b.style.setProperty('--accent-color', c); b.classList.remove('accent-default');
                    // Readable text on the accent: neon lyric stickers and filled buttons pick black or white automatically.
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
                    if (!data || data.app !== 'Mujic' || (!data.settings && !data.playStats && !Array.isArray(data.playHistory))) {
                        throw new Error('This file is not a supported Mujic settings or listening-data export.');
                    }
                    const settings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : null;
                    const hasStats = data.playStats && typeof data.playStats === 'object' && data.playStats.days && typeof data.playStats.days === 'object';
                    const hasHistory = Array.isArray(data.playHistory);
                    const confirmed = await Dialog.show({ type:'confirm', title:'Import Mujic data', message:`Import ${settings ? 'settings' : ''}${settings && (hasStats || hasHistory) ? ' and ' : ''}${hasStats || hasHistory ? 'listening data' : ''}? Imported settings replace matching preferences. Listening-data imports replace current listening statistics/history. Your songs and audio files are not changed.`, confirmText:'Import data' });
                    if (!confirmed) return;

                    if (settings) {
                        const allowed = new Set(['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled','lowEndModeActive']);
                        const boolKeys = new Set(['lowEndMode','resumePlayback','showArtworkLists','muted','shuffle','crossfade','skipSilence','instantSkipSilence','loudnessControl','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled']);
                        const stringEnums = {
                            theme:['system','light','dark'], accentPreset:['dynamic','custom','default'], surfaceTheme:['oled','graphite','midnight','warm','forest'], textScale:['compact','normal','large'], layoutDensity:['compact','comfortable','spacious'], performanceProfile:['auto','low-end','full'], lyricsStyle:['apple','spotify','neon'], lyricsPosition:['upper','center','lower'], lyricsFontSize:['compact','normal','large','extra-large'], lyricsLineSpacing:['compact','normal','relaxed'], lyricsWidth:['narrow','standard','wide'], lyricsEmphasis:['soft','standard','strong','off'], interfaceStyle:['subtle','glass','solid'], cornerRadius:['sharp','rounded','pill'], motion:['full','reduced'], playerBackground:['artwork','solid','black'], playerArtworkMode:['full','contained'], librarySort:['dateAdded','title','artist','album'], librarySortDir:['asc','desc'], loudnessLevel:['soft','balanced','strong'], eq:['off','low','med','high'], eqPreset:['flat','bass','vocal','rock','treble','custom']
                        };
                        for (const [key,value] of Object.entries(settings)) {
                            if (!allowed.has(key)) continue;
                            if (boolKeys.has(key)) { if (typeof value === 'boolean') State[key] = value; continue; }
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
                const settingKeys = ['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','sleepTimer','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled','lyricsRenderEnabled'];
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
                const constrainedDevice = (cores > 0 && cores <= 4) || (memory > 0 && memory <= 4) || reducedMotion;
                const profile = ['auto','low-end','full'].includes(State.performanceProfile) ? State.performanceProfile : 'auto';
                const lowEndActive = profile === 'low-end' || (profile === 'auto' && (constrainedDevice || State.lowEndMode));
                State.lowEndModeActive = lowEndActive;
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
                
                if (State.interfaceStyle === 'off') {
                    root.style.setProperty('--glass-bg', 'var(--bg-surface)'); root.style.setProperty('--glass-blur', 'blur(0px)'); root.style.setProperty('--glass-border', '1px solid var(--border-subtle)');
                } else if (State.interfaceStyle === 'strong') {
                    root.style.setProperty('--glass-bg', 'rgba(10, 10, 10, 0.45)'); root.style.setProperty('--glass-blur', 'blur(40px)');
                } else {
                    root.style.setProperty('--glass-bg', 'rgba(10, 10, 10, 0.65)'); root.style.setProperty('--glass-blur', 'blur(24px)');
                }
                
                if (State.cornerRadius === 'sharp') { root.style.setProperty('--radius-sm', '0px'); root.style.setProperty('--radius-md', '0px'); root.style.setProperty('--radius-lg', '0px'); } 
                else if (State.cornerRadius === 'medium') { root.style.setProperty('--radius-sm', '4px'); root.style.setProperty('--radius-md', '8px'); root.style.setProperty('--radius-lg', '12px'); } 
                else if (State.cornerRadius === 'extra') { root.style.setProperty('--radius-sm', '16px'); root.style.setProperty('--radius-md', '24px'); root.style.setProperty('--radius-lg', '32px'); } 
                else { root.style.setProperty('--radius-sm', '8px'); root.style.setProperty('--radius-md', '12px'); root.style.setProperty('--radius-lg', '16px'); }
                
                if (State.motion === 'reduced') document.body.classList.add('reduced-motion'); else document.body.classList.remove('reduced-motion');
                
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
                
                const fullBg = document.getElementById('full-bg');
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
                State.theme = 'system'; State.accentPreset = 'dynamic'; State.surfaceTheme = 'oled'; State.interfaceStyle = 'subtle'; State.cornerRadius = 'rounded'; State.motion = 'full'; State.lyricsStyle = 'apple';
                StorageAdapter.saveSettings(); UI.applySettings(); UI.showToast("Appearance restored", "refresh");
            },
            setupInstallPrompt: () => {
                window.addEventListener('appinstalled', () => { State.deferredInstallPrompt = null; UI.updateInstallUI(); UI.showToast('Mujic installed', 'check_circle'); });
                UI.updateInstallUI();
            },
            updateInstallUI: () => {
                const btn=document.getElementById('install-pwa-btn'); if(!btn) return;
                const standalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
                btn.disabled=standalone;
                btn.innerText=standalone?'Installed':'Install';
                const desc=document.getElementById('install-pwa-desc');
                if(desc) desc.innerText=standalone ? 'Mujic is installed on this device.' : (State.deferredInstallPrompt ? 'Install Mujic as a standalone app.' : (Utils.isIOS() ? 'Use Share → Add to Home Screen in Safari.' : 'Install Mujic from your browser when the install option is available.'));
            },
            installPWA: async () => {
                const standalone=window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
