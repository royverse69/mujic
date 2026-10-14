/* Mujic UI layer: view rendering, sheets, dialogs, search and interactions. */
        const UI = {
            // History URL mutation is not consistently supported for file:// pages (Windows users
            // often open index.html directly). Keep browser-history helpers guarded so navigation
            // can never abort the rest of startup on those origins.
            supportsUrlHistory: () => location.protocol === 'http:' || location.protocol === 'https:',
            pushHistoryState: (state, hash) => {
                if (!UI.supportsUrlHistory()) return false;
                try { history.pushState(state, '', `${location.pathname}${location.search}${hash || ''}`); return true; }
                catch (error) { console.warn('Navigation history is unavailable; continuing without URL history.', error); return false; }
            },
            replaceHistoryState: (state, hash) => {
                if (!UI.supportsUrlHistory()) return false;
                try { history.replaceState(state, '', `${location.pathname}${location.search}${hash || ''}`); return true; }
                catch (error) { console.warn('Navigation history is unavailable; continuing without URL history.', error); return false; }
            },
            init: () => {
                if (Utils.isIOS()) document.body.classList.add('ios');
                // Initialize each subsystem independently. A failure in history, gestures, or a
                // nonessential panel must not prevent the global navigation handlers from binding.
                const initSteps = [
                    ['settings grouping', UI.setupSettingsGroups],
                    ['navigation history', UI.setupHistory],
                    ['touch gestures', UI.setupGestures],
                    ['PWA install prompt', UI.setupInstallPrompt],
                    ['global interactions', UI.setupGlobalDelegation],
                    ['listening stats', UI.updateStatsUI],
                    ['release notes', UI.loadChangeLog]
                ];
                for (const [label, initialize] of initSteps) {
                    try { initialize.call(UI); }
                    catch (error) { console.error(`Mujic ${label} initialization failed; continuing startup.`, error); }
                }
                setTimeout(() => { const g = document.getElementById('greeting-text'); if (g) g.classList.add('hidden'); }, 25000);
                const persistResume = () => {
                    if (State.resumePlayback && State.currentTrackId) { State.resumePosition = State.currentTime; State.lastPositionSave = Date.now(); StorageAdapter.saveSettings(); }
                };
                window.addEventListener('beforeunload', persistResume);
                document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistResume(); });
            },
            checkForUpdates: async (manual = false) => {
                if (!['http:', 'https:'].includes(location.protocol)) {
                    if (manual) UI.showToast('Run Mujic through localhost or HTTPS to check for updates.', 'info');
                    return false;
                }
                const cleanVer = value => String(value || '').replace(/^\uFEFF/, '').trim().replace(/^v/i, '').split(/[+-]/)[0].trim();
                const parseVersion = value => cleanVer(value).split('.').map(part => Math.max(0, Number.parseInt(part, 10) || 0));
                const compareVersions = (a, b) => {
                    const aa = parseVersion(a), bb = parseVersion(b);
                    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
                        const d = (aa[i] || 0) - (bb[i] || 0);
                        if (d) return d;
                    }
                    return 0;
                };
                const domVersion = cleanVer(document.querySelector('meta[name="application-version"]')?.content || '0.0.0');
                const appliedVersion = cleanVer(localStorage.getItem('mujic-applied-version') || '');
                const current = compareVersions(appliedVersion, domVersion) > 0 ? appliedVersion : domVersion;
                try {
                    const response = await fetch(`./VERSION?check=${Date.now()}`, { cache: 'no-store' });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const latest = cleanVer((await response.text()).split(/[\r\n]/)[0]);
                    if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) throw new Error('The VERSION file is invalid.');
                    if (compareVersions(domVersion, latest) >= 0) {
                        localStorage.setItem('mujic-applied-version', domVersion);
                    }
                    if (compareVersions(latest, current) <= 0) {
                        sessionStorage.removeItem('mujic-update-dismissed');
                        if (manual) UI.showToast(`Mujic ${current} is up to date.`, 'check_circle');
                        return false;
                    }
                    const dismissed = sessionStorage.getItem('mujic-update-dismissed');
                    if (!manual && dismissed === latest) return false;
                    const accept = await Dialog.show({ type: 'confirm', title: 'Mujic update available', message: `Mujic ${latest} is available (you have ${current}). Update now to load the latest fixes?`, confirmText: 'Update now' });
                    if (!accept) { sessionStorage.setItem('mujic-update-dismissed', latest); return true; }
                    UI.showToast(`Updating Mujic to ${latest}…`, 'system_update');
                    localStorage.setItem('mujic-applied-version', latest);
                    sessionStorage.setItem('mujic-update-dismissed', latest);
                    try {
                        const registration = await navigator.serviceWorker?.getRegistration();
                        if (registration) {
                            await registration.update();
                            if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                        if ('caches' in window) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map(k => caches.delete(k)));
                        }
                    } catch (e) {}
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
                    {id:'player', title:'Player & Audio', description:'Waveform, playback, equalizer and audio effects', icon:'graphic_eq', headings:['Player','Playback','Playback Effects']},
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
            setupHistory: () => {
                const validViews = ['home', 'library', 'search', 'settings', 'context-detail'];
                const hashView = location.hash.startsWith('#') ? location.hash.slice(1) : '';
                const initialView = validViews.includes(hashView) ? hashView : 'home';
                if (UI.supportsUrlHistory() && (!history.state || !history.state.mujic)) UI.replaceHistoryState({ mujic:true, view:initialView, player:false, sheet:null }, `#${initialView}`);
                window.addEventListener('popstate', (e) => UI.handlePopState(e.state));
            },
            handlePopState: (state) => {
                const s = state && state.mujic ? state : { mujic:true, view:'home', player:false, sheet:null };
                UI.switchView(s.view || 'home', true);
                if ((s.view || 'home') === 'settings') UI.setSettingsGroup(s.settingsGroup || null, true);
                if (s.player) UI.openFullPlayer(true); else UI.closeFullPlayer(true);
                if (s.sheet) UI.showSheet(s.sheet, true); else UI.closeSheets(true);
            },
            goBack: () => {
                if (UI.supportsUrlHistory() && history.state && history.state.mujic) { try { history.back(); return; } catch (error) {} }
                UI.switchView(UI._prevView || 'library', true);
            },
            switchView: (vid, fromHistory = false) => {
                UI.closeSheets(true);
                const preservePlayer = fromHistory && !!history.state?.mujic && !!history.state?.player;
                if (!preservePlayer) UI.closeFullPlayer(true);
                if (!fromHistory) {
                    const current = document.querySelector('.view.active');
                    if (!current || current.id !== `view-${vid}`) UI.pushHistoryState({ mujic:true, view:vid, player:false, sheet:null }, `#${vid}`);
                }
                document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                
                const el = document.getElementById(`view-${vid}`); 
                if(el) { el.classList.remove('hidden'); el.classList.add('active'); }
                const nav = document.querySelector(`.nav-item[data-view="${vid}"]`); 
                if(nav) nav.classList.add('active');
                
                if (vid === 'home') UI.renderHome();
                if (vid === 'settings' && !fromHistory) UI.setSettingsGroup(null, true);
                if (vid === 'library') {
                    const activeTab = document.querySelector('.tab-item.active');
                    if(activeTab) UI.switchLibraryTab(activeTab.dataset.tab);
                }
                if (vid === 'search') {
                    UI.handleSearch({target: document.getElementById('search-input')});
                }
                const main = document.getElementById('main-content'); if (main) main.scrollTop = 0;
            },
            switchLibraryTab: (tab) => {
                document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.lib-tab-content').forEach(c => { c.classList.remove('active'); c.classList.add('hidden'); });
                const targetTab = document.querySelector(`.tab-item[data-tab="${tab}"]`); if(targetTab) targetTab.classList.add('active');
                const content = document.getElementById(`lib-${tab}`); if (content) { content.classList.remove('hidden'); content.classList.add('active'); }
                
                if(tab==='songs') UI.renderLibrary(); if(tab==='albums') UI.renderAlbums();
                if(tab==='artists') UI.renderArtists(); if(tab==='playlists') UI.renderPlaylists();
            },
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
                } catch(e) {}
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
            renderQueue: () => {
                document.getElementById('queue-list').innerHTML = State.playbackOrder.map((id, i) => {
                    const t = State.library.find(x => x.id === id); if(!t) return '';
                    const isP = i === State.queueIndex;
                    const def = Utils.generateDefaultArt(t.title);
                    const artHtml = State.showArtworkLists ? `<img src="${def}" data-art-id="${t.artworkId||''}" data-seed="${Utils.escapeHTML(t.title)}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';">` : `<div class="track-art-small art-placeholder" style="background-image:url('${def}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">music_note</span></div>`;
                    return `<div class="track-row" data-action="play-queue-index" data-index="${i}" data-queue-index="${i}">
                        <div style="cursor: grab; margin-right: 8px; color: var(--text-tertiary); touch-action:none; user-select:none;" class="drag-handle" role="button" aria-label="Reorder queue item" tabindex="0"><span class="material-symbols-rounded" style="pointer-events:none;">drag_indicator</span></div>
                        ${artHtml}
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(t.title)}</div><div class="item-subtitle">${Utils.escapeHTML(t.artist)}</div></div>
                        <div class="queue-mobile-controls">
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="up" ${i===0?'disabled':''} aria-label="Move up"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_up</span></button>
                            <button class="icon-btn" data-action="move-queue" data-index="${i}" data-direction="down" ${i===State.playbackOrder.length-1?'disabled':''} aria-label="Move down"><span class="material-symbols-rounded" style="pointer-events:none;">keyboard_arrow_down</span></button>
                            ${!isP ? `<button class="icon-btn" data-action="remove-queue" data-index="${i}" aria-label="Remove from queue"><span class="material-symbols-rounded" style="font-size: 20px; pointer-events:none;">close</span></button>` : ''}
                        </div>
                    </div>`;
                }).join('');
                UI.lazyLoadArtwork(); UI.setupQueueDragAndDrop();
            },
            setupQueueDragAndDrop: () => {
                const list = document.getElementById('queue-list');
                let draggedItem = null; let pointerId = null;

                const clearDragState = () => {
                    if (draggedItem) draggedItem.classList.remove('dragging');
                    draggedItem = null; pointerId = null;
                    list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over'));
                };
                const reorder = (fromIndex, toIndex) => {
                    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= State.playbackOrder.length || toIndex >= State.playbackOrder.length) return;
                    const item = State.playbackOrder.splice(fromIndex, 1)[0]; State.playbackOrder.splice(toIndex, 0, item);
                    if (State.queueIndex === fromIndex) State.queueIndex = toIndex;
                    else if (State.queueIndex > fromIndex && State.queueIndex <= toIndex) State.queueIndex--;
                    else if (State.queueIndex < fromIndex && State.queueIndex >= toIndex) State.queueIndex++;
                    StorageAdapter.saveSettings(); UI.renderQueue();
                };

                list.querySelectorAll('.track-row').forEach(row => {
                    row.addEventListener('dragstart', function(e) { draggedItem = this; setTimeout(() => this.classList.add('dragging'), 0); });
                    row.addEventListener('dragend', function() { this.classList.remove('dragging'); draggedItem = null; list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over')); });
                    row.addEventListener('dragover', function(e) { e.preventDefault(); if (this !== draggedItem) this.classList.add('drag-over'); });
                    row.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
                    row.addEventListener('drop', function(e) {
                        e.preventDefault(); this.classList.remove('drag-over');
                        if (this !== draggedItem && draggedItem) reorder(parseInt(draggedItem.dataset.queueIndex), parseInt(this.dataset.queueIndex));
                    });
                });

                list.querySelectorAll('.drag-handle').forEach(handle => {
                    const getTargetRow = (e) => {
                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        return el?.closest('#queue-list .track-row');
                    };
                    const endPointerDrag = (e) => {
                        if (!draggedItem || e.pointerId !== pointerId) return;
                        const fromIndex = parseInt(draggedItem.dataset.queueIndex, 10);
                        const target = getTargetRow(e);
                        const toIndex = target ? parseInt(target.dataset.queueIndex, 10) : fromIndex;
                        clearDragState();
                        reorder(fromIndex, toIndex);
                    };
                    handle.addEventListener('pointerdown', (e) => {
                        e.preventDefault(); e.stopPropagation();
                        draggedItem = handle.closest('.track-row'); pointerId = e.pointerId;
                        if (!draggedItem) return;
                        draggedItem.classList.add('dragging');
                        try { handle.setPointerCapture(pointerId); } catch(err) {}
                    });
                    handle.addEventListener('pointermove', (e) => {
                        if (!draggedItem || e.pointerId !== pointerId) return;
                        e.preventDefault();
                        const target = getTargetRow(e);
                        list.querySelectorAll('.track-row').forEach(r => r.classList.remove('drag-over'));
                        if (target && target !== draggedItem) target.classList.add('drag-over');
                    });
                    handle.addEventListener('pointerup', endPointerDrag);
                    handle.addEventListener('pointercancel', endPointerDrag);
                });
            },
            lazyLoadArtwork: async () => {
                const imgs = [...document.querySelectorAll('.lazy-art')];
                await Promise.all(imgs.map(async img => {
                    const artId = img.dataset.artId; img.classList.remove('lazy-art');
                    img.loading = 'lazy'; img.decoding = 'async';
                    if (artId) { const url = await ArtworkCache.getUrl(artId, img.dataset.seed || ''); if (img.isConnected) img.src = url; } else if (img.dataset.seed) { img.src = Utils.generateDefaultArt(img.dataset.seed); }
                }));
            },
            updatePlayerMeta: async (t) => {
                if(!t) return;
                const reqId = ++State.artworkRequestId;
                
                document.getElementById('mini-title').innerText = t.title; document.getElementById('mini-artist').innerText = t.artist; 
                document.getElementById('full-title').innerText = t.title; document.getElementById('full-artist').innerText = t.artist;
                
                const favBtn = document.getElementById('fav-btn'); const isF = State.favorites.includes(t.id);
                favBtn.innerHTML = `<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${isF?1:0}; color: ${isF?'var(--accent-color)':'inherit'};">favorite</span>`;
                
                clearTimeout(State.lyricsTimeout);
                const lyricsContent = document.getElementById('lyrics-content');
                State.currentLyrics = null; State.activeLyricIndex = -1;
                lyricsContent.className = `player-lyrics-container lyrics-style-${State.lyricsStyle || 'apple'}`;
                lyricsContent.innerHTML = State.isLyricsMode ? `<div style="text-align:center; font-size: 16px; font-weight: 400; color: var(--text-secondary); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">Loading lyrics...</div>` : '';
                
                let artUrl = await ArtworkCache.getUrl(t);
                if (reqId !== State.artworkRequestId) return;
                
                document.getElementById('mini-art').src = artUrl; document.getElementById('full-art').src = artUrl;
                document.getElementById('desktop-lyrics-art').src = artUrl;
                
                const fullBg = document.getElementById('full-bg');
                if (State.playerBackground === 'artwork') {
                    fullBg.style.backgroundImage = `url("${artUrl}")`; fullBg.style.backgroundColor = 'transparent';
                    if (State.accentPreset === 'dynamic') {
                        const extractedColor = await ArtworkCache.getAverageColor(t);
                        if (reqId === State.artworkRequestId) UI.setAccent(extractedColor);
                    }
                } else if (State.playerBackground === 'solid') {
                    fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = 'var(--bg-elevated)';
                } else if (State.playerBackground === 'black') {
                    fullBg.style.backgroundImage = 'none'; fullBg.style.backgroundColor = '#000000';
                }
                if (State.isLyricsMode) UI.loadCurrentLyrics();
            },
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
            updatePlayPause: () => {
                const icon = State.isPlaying ? 'pause' : 'play_arrow';
                document.getElementById('mini-play-btn').innerText = icon; document.getElementById('full-play-btn').innerText = icon;
                const art = document.getElementById('player-art-container');
                if(State.isPlaying) art.classList.remove('paused'); else art.classList.add('paused');
            },
            updateProgress: () => {
                const p = State.duration > 0 ? Math.max(0, Math.min(100, (State.currentTime / State.duration) * 100)) : 0;
                document.getElementById('mini-progress').style.width = `${p}%`; document.getElementById('full-progress').style.width = `${p}%`;
                document.getElementById('scrubber-thumb').style.left = `${p}%`; document.getElementById('time-current').innerText = Utils.formatTime(State.currentTime);
                if (!State.isPlaying && State.visualizerMode === 'wave') AudioAdapter.renderScrubberVisualizerFrame();
            },
            updateDuration: () => { document.getElementById('time-total').innerText = Utils.formatTime(State.duration); },
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
            handleSearch: Utils.debounce((e) => {
                const q = String(e.target.value || '').toLowerCase().trim(); const c = document.getElementById('search-results');
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
                    (t.title && t.title.toLowerCase().includes(q)) || (t.artist && t.artist.toLowerCase().includes(q)) ||
                    (t.album && t.album.toLowerCase().includes(q)) || (t.fileName && t.fileName.toLowerCase().includes(q)) ||
                    (t.albumArtist && t.albumArtist.toLowerCase().includes(q)) || (t.composer && t.composer.toLowerCase().includes(q)) ||
                    (t.genre && t.genre.toLowerCase().includes(q)) || (t.year && String(t.year).includes(q))
                );
                State.searchResults = songs;

                const artists = new Map(); const albums = new Map();
                State.library.forEach(t => {
                    const artist = t.albumArtist || t.artist || '';
                    if (artist && artist.toLowerCase().includes(q) && !artists.has(artist)) artists.set(artist, t);
                    const albumKey = `${t.album || ''}||${artist}`;
                    if (t.album && (t.album.toLowerCase().includes(q) || artist.toLowerCase().includes(q)) && !albums.has(albumKey)) albums.set(albumKey, {name:t.album, artist, track:t});
                });
                const playlists = State.playlists.filter(p => p.name && p.name.toLowerCase().includes(q));

                let htmlOut = '';
                if (artists.size) htmlOut += `<div class="section-title" style="padding:0 16px;">Artists</div><div class="track-list">${[...artists.entries()].map(([name,t]) => { const def=Utils.generateDefaultArt(t.title); return `<div class="track-row" data-action="open-artist" data-key1="${Utils.escapeHTML(name)}"><img src="${def}" data-art-id="${t.artworkId||''}" class="track-art-small lazy-art" style="border-radius:50%;" onerror="this.onerror=null; this.src='${def}';"><div class="track-meta"><div class="item-title">${Utils.escapeHTML(name)}</div><div class="item-subtitle">${State.library.filter(x=>(x.albumArtist||x.artist)===name).length} tracks</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`; }).join('')}</div>`;
                if (albums.size) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Albums</div><div class="track-list">${[...albums.values()].map(a => { const def=Utils.generateDefaultArt(a.track.title); return `<div class="track-row" data-action="open-album" data-key1="${Utils.escapeHTML(a.name)}" data-key2="${Utils.escapeHTML(a.artist)}"><img src="${def}" data-art-id="${a.track.artworkId||''}" class="track-art-small lazy-art" onerror="this.onerror=null; this.src='${def}';"><div class="track-meta"><div class="item-title">${Utils.escapeHTML(a.name)}</div><div class="item-subtitle">${Utils.escapeHTML(a.artist)}</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`; }).join('')}</div>`;
                if (playlists.length) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Playlists</div><div class="track-list">${playlists.map(p => `<div class="track-row" data-action="open-playlist" data-key1="${Utils.escapeHTML(p.id)}"><div class="track-art-small art-placeholder" style="background-image:url('${Utils.defaultArt}');display:flex;align-items:center;justify-content:center;"><span class="material-symbols-rounded">queue_music</span></div><div class="track-meta"><div class="item-title">${Utils.escapeHTML(p.name)}</div><div class="item-subtitle">${p.tracks.length} tracks</div></div><span class="material-symbols-rounded" style="color:var(--text-tertiary)">chevron_right</span></div>`).join('')}</div>`;
                if (songs.length) htmlOut += `<div class="section-title" style="padding:16px 16px 0;">Songs</div><div class="track-list">${songs.map(t => UI.buildTrackRow(t, 'search')).join('')}</div>`;
                c.innerHTML = htmlOut || `<div class="search-no-results"><div class="empty-title">No matching songs found</div><div class="empty-desc">Mujic couldn't find “${Utils.escapeHTML(e.target.value || '')}” in your local library.</div><button type="button" class="btn btn-primary search-download-cta" data-action="find-music-online">Find music online <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span></button></div>`;
                UI.lazyLoadArtwork();
            }, 300),
            showMiniPlayer: () => { const mini=document.getElementById('mini-player'); if(mini) mini.classList.add('visible'); UI.updateVisualizerUI(); AudioAdapter.resizeVisualizer(); if(State.visualizerMode==='wave' && State.isPlaying) AudioAdapter.initWebAudio().then(()=>{AudioAdapter.resizeVisualizer();AudioAdapter.renderScrubberVisualizerFrame();if(AudioAdapter.visualizerShouldRun())AudioAdapter.startVisualizerLoop();}).catch(()=>{}); },
            openFullPlayer: (fromHistory = false) => { 
                if (!State.isFullPlayerOpen) {
                    State.isFullPlayerOpen = true; const fp = document.getElementById('full-player'); fp.style.pointerEvents = 'auto'; fp.setAttribute('aria-hidden','false'); fp.classList.add('active'); document.body.classList.add('player-open');
                    if (!fromHistory) UI.pushHistoryState({ mujic:true, view:(document.querySelector('.view.active')?.id || 'view-home').replace('view-',''), player:true, sheet:null }, '#player');
                }
                if (State.isLyricsMode && State.currentLyrics && State.currentLyrics.isSynced) UI.syncLyrics(State.currentTime);
                AudioAdapter.setWakeLock(State.keepScreenAwake);
                UI.updateVisualizerUI();
                if (State.visualizerMode === 'wave') {
                    AudioAdapter.initWebAudio().then(() => {
                        AudioAdapter.resizeVisualizer(); AudioAdapter.renderScrubberVisualizerFrame();
                        if (AudioAdapter.visualizerShouldRun()) AudioAdapter.startVisualizerLoop();
                    }).catch(() => UI.updateVisualizerUI());
                } else {
                    AudioAdapter.stopVisualizerLoop(); AudioAdapter.resizeVisualizer();
                }
            },
            closeFullPlayer: (fromHistory=false) => {
                const shouldGoBack = !fromHistory && State.isFullPlayerOpen && history.state?.mujic && history.state?.player && !history.state?.sheet;
                State.isFullPlayerOpen=false; clearTimeout(State.lyricsTimeout); State.isLyricsMode=false; State.currentLyrics=null; State.activeLyricIndex=-1; State.statsLastAudioTime = Number(AudioAdapter.audio.currentTime) || State.statsLastAudioTime; AudioAdapter.stopVisualizerLoop();
                const track=document.getElementById('scrubber-bar'); if(track) track.classList.remove('visualizer-active');
                const fp=document.getElementById('full-player'); fp.classList.remove('active'); fp.style.pointerEvents='none'; fp.setAttribute('aria-hidden','true'); document.body.classList.remove('player-open','lyrics-mode','immersive-lyrics'); UI.updateVisualizerUI();
                document.getElementById('lyrics-btn')?.classList.remove('active-state');
                const ib=document.querySelector('.immersive-btn'); if(ib) ib.innerHTML='<span class="material-symbols-rounded">fullscreen</span>';
                AudioAdapter.drawVisualizerFrame();
                AudioAdapter.setWakeLock(false);
                if (shouldGoBack && UI.supportsUrlHistory()) history.back();
            },
            showSheet: (id, fromHistory = false) => { 
                UI.closeSheets(true); document.getElementById('sheet-overlay').classList.add('active'); 
                const sheet = document.getElementById(id); if (sheet) { sheet.classList.add('active'); UI.updatePlayerSettingsLabels(); UI.updateVisualizerUI(); if (id === 'eq-sheet') UI.updateEQUI(); }
                if (!fromHistory) {
                    const view = (document.querySelector('.view.active')?.id || 'view-home').replace('view-','');
                    UI.pushHistoryState({ mujic:true, view, player:State.isFullPlayerOpen, sheet:id }, `#sheet-${id}`);
                }
            },
            closeSheets: (fromHistory = false) => { 
                if (!fromHistory && UI.supportsUrlHistory() && history.state?.mujic && history.state?.sheet) { history.back(); return; }
                document.getElementById('sheet-overlay').classList.remove('active'); 
                document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active')); 
                if (State.dialogResolve) { State.dialogResolve(false); State.dialogResolve = null; }
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
                        UI.showToast('Lyrics lookup timed out. Try again when the connection is available.', 'lyrics');
                    }
                }, 5000);
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
                            <div class="lyrics-unavailable-text">${navigator.onLine ? 'No verified lyrics source matched this track.' : 'You are offline. Check your saved lyrics cache first.'}</div>
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
            renderHistoryContent: (sheet, restoreScroll = 0) => {
                const events = State.playHistory.length ? State.playHistory : State.history.map(id => { const t=State.library.find(x=>x.id===id); return t ? {trackId:id,title:t.title,artist:t.artist,album:t.album,playedAt:null}:null; }).filter(Boolean);
                const list = sheet.querySelector('#history-list');
                list.innerHTML = events.length ? events.map(ev => {
                    const t=State.library.find(x=>x.id===ev.trackId); const title=ev.title||t?.title||'Unknown track'; const artist=ev.artist||t?.artist||'Unknown Artist';
                    const art=Utils.generateDefaultArt(title); const subtitle=ev.playedAt ? new Date(ev.playedAt).toLocaleString() : 'From listening history';
                    return `<div class="track-row" ${t?`data-action="play-track" data-id="${Utils.escapeHTML(t.id)}" data-context="library"`:''}>
                        <img class="track-art-small lazy-art" src="${art}" data-seed="${Utils.escapeHTML(title)}" ${t?.artworkId?`data-art-id="${t.artworkId}"`:''} alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${art}';">
                        <div class="track-meta"><div class="item-title">${Utils.escapeHTML(title)}</div><div class="item-subtitle">${Utils.escapeHTML(artist)} · ${Utils.escapeHTML(subtitle)}</div></div>
                        ${t?'<span class="material-symbols-rounded">play_arrow</span>':''}</div>`;
                }).join('') : '<div class="empty-state"><div class="empty-desc">Your listening history will appear here.</div></div>';
                const more = sheet.querySelector('#history-load-more');
                if (more) { more.hidden = !State.playHistoryHasMore; more.disabled = !!State.playHistoryLoading; more.textContent = State.playHistoryLoading ? 'Loading…' : 'Load older history'; }
                sheet.scrollTop = restoreScroll;
                UI.lazyLoadArtwork();
            },
            showHistorySheet: () => {
                let sheet=document.getElementById('history-sheet');
                if(!sheet){
                    sheet=document.createElement('div'); sheet.id='history-sheet'; sheet.className='bottom-sheet glass-surface';
                    sheet.innerHTML='<div class="sheet-handle"></div><div class="sheet-header"><div class="sheet-title">Listening History</div></div><div id="history-list" class="track-list"></div><button type="button" id="history-load-more" class="btn" data-action="load-older-history" style="width:100%;margin-top:12px;">Load older history</button>';
                    document.body.appendChild(sheet);
                }
                UI.renderHistoryContent(sheet, 0);
                UI.showSheet('history-sheet');
            },
            loadOlderHistory: async () => {
                if (State.playHistoryLoading || !State.playHistoryHasMore) return;
                State.playHistoryLoading = true;
                const sheet = document.getElementById('history-sheet'); if (!sheet) { State.playHistoryLoading = false; return; }
                const beforeScroll = sheet.scrollTop; UI.renderHistoryContent(sheet, beforeScroll);
                try {
                    const batch = await StorageAdapter.getRecentPlayHistory(151, State.playHistoryOffset || State.playHistory.length);
                    const older = batch.slice(0, 150);
                    if (older.length) {
                        State.playHistory.push(...older);
                        State.playHistoryOffset = (Number(State.playHistoryOffset) || 0) + older.length;
                    }
                    State.playHistoryHasMore = batch.length > 150;
                } catch (e) {
                    UI.showToast('Could not load older history.', 'error');
                } finally {
                    State.playHistoryLoading = false;
                    UI.renderHistoryContent(sheet, beforeScroll);
                }
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
                        const allowed = new Set(['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled','lowEndModeActive']);
                        const boolKeys = new Set(['lowEndMode','resumePlayback','showArtworkLists','muted','shuffle','crossfade','skipSilence','instantSkipSilence','loudnessControl','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','keepScreenAwake','lyricsPlusEnabled']);
                        const stringEnums = {
                            theme:['system','light','dark'], accentPreset:['dynamic','custom','default'], surfaceTheme:['oled','graphite','midnight-blue','warm-espresso','forest'], textScale:['compact','normal','large'], layoutDensity:['compact','comfortable','spacious'], performanceProfile:['auto','low-end','full'], lyricsStyle:['apple','spotify','neon'], lyricsPosition:['upper','center','lower'], lyricsFontSize:['compact','normal','large','extra-large'], lyricsLineSpacing:['compact','normal','relaxed'], lyricsWidth:['narrow','standard','wide'], lyricsEmphasis:['soft','standard','strong','off'], interfaceStyle:['subtle','glass','solid'], cornerRadius:['sharp','rounded','pill'], motion:['full','reduced'], playerBackground:['artwork','solid','black'], playerArtworkMode:['full','contained'], librarySort:['dateAdded','title','artist','album'], librarySortDir:['asc','desc'], loudnessLevel:['soft','balanced','strong'], eq:['off','low','med','high'], eqPreset:['flat','bass','vocal','rock','treble','custom']
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
                const settingKeys = ['theme','accentPreset','accentColor','surfaceTheme','textScale','layoutDensity','lowEndMode','performanceProfile','lyricsStyle','lyricsPosition','lyricsVerticalOffset','lyricsTimingOffset','lyricsFontSize','lyricsLineSpacing','lyricsWidth','lyricsEmphasis','interfaceStyle','cornerRadius','motion','playerBackground','playerArtworkMode','resumePlayback','librarySort','librarySortDir','showArtworkLists','playbackRate','volume','muted','repeat','shuffle','sleepTimer','eq','eqPreset','eqBands','visualizerMode','crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','waveformStyle','seekStep','keepScreenAwake','lyricsPlusEnabled'];
                const settings = {}; settingKeys.forEach(key => { if (State[key] !== undefined) settings[key] = State[key]; });
                let payload;
                if (kind === 'settings') {
                    payload = { exportedAt: new Date().toISOString(), app: 'Mujic', settings };
                } else {
                    let fullHistory = [];
                    try { fullHistory = await StorageAdapter.getAllPlayHistory(); } catch(e) {}
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
            showToast: (m, icon = 'check_circle') => { 
                clearTimeout(State.toastTimeout); const t = document.getElementById('toast'); 
                document.getElementById('toast-message').innerText = m; document.getElementById('toast-icon').innerText = icon;
                t.classList.add('show'); State.toastTimeout = setTimeout(() => t.classList.remove('show'), 3000); 
            },
            updateSleepTimerDisplay: () => {
                const st = State.sleepTimer; if(!st.active || st.endOfSong) return;
                const rem = Math.max(0, Math.floor((st.endTime - Date.now()) / 1000));
                document.getElementById('st-active-display').innerText = `Timer: ${Utils.formatTime(rem)}`;
            },
            updateVolumeUI: () => {
                const p = State.muted ? 0 : State.volume * 100;
                document.getElementById('volume-fill').style.width = `${p}%`; document.getElementById('volume-thumb').style.left = `${p}%`;
                let icon = 'volume_up'; if(State.muted || State.volume === 0) icon = 'volume_off'; else if(State.volume < 0.5) icon = 'volume_down';
                document.getElementById('mute-btn').innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
            },
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
                    try { await prompt.prompt(); await prompt.userChoice; } catch(e) {}
                    State.deferredInstallPrompt=null; UI.updateInstallUI(); return;
                }
                if(Utils.isIOS()) {
                    await Dialog.show({type:'confirm', title:'Install Mujic', message:'In Safari, tap Share and choose “Add to Home Screen”. Then open Mujic from your Home Screen for the standalone app experience.', confirmText:'Got it'});
                } else {
                    UI.showToast('Your browser has not exposed the install prompt yet. Open the browser menu and choose Install / Add to Home Screen when available.', 'info');
                }
            },
            setupGlobalDelegation: () => {
                const closePlayerBtn = document.getElementById('close-player-btn');
                if (closePlayerBtn) {
                    let handledPointerUp = false;
                    closePlayerBtn.addEventListener('pointerdown', e => { handledPointerUp=false; e.stopPropagation(); }, {passive:true});
                    closePlayerBtn.addEventListener('pointerup', e => { handledPointerUp=true; e.preventDefault(); e.stopPropagation(); UI.closeFullPlayer(); }, {passive:false});
                    closePlayerBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!handledPointerUp) UI.closeFullPlayer(); handledPointerUp=false; });
                }
                const nav = document.getElementById('bottom-nav');
                if (nav) {
                    const activateNav = (e) => {
                        const item = e.target.closest('.nav-item[data-view]');
                        if (!item) return;
                        const now = Date.now();
                        if (item.dataset.lastNavActivation && now - Number(item.dataset.lastNavActivation) < 350) {
                            // A touch pointerup is followed by a synthetic click on many phones.
                            // Swallow that duplicate instead of letting it reach body delegation.
                            e.preventDefault(); e.stopPropagation(); return;
                        }
                        item.dataset.lastNavActivation = String(now);
                        e.preventDefault(); e.stopPropagation();
                        UI.switchView(item.dataset.view);
                    };
                    nav.addEventListener('click', activateNav, true);
                    nav.addEventListener('pointerup', (e) => {
                        if (e.pointerType === 'touch') activateNav(e);
                    }, true);
                }
                const mini = document.getElementById('mini-player');
                mini?.querySelectorAll('.mini-action').forEach(btn => {
                    ['pointerdown','pointerup','click'].forEach(type => btn.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); }, {passive:false}));
                });
                const miniPlay = mini?.querySelector('[data-action="toggle-play"]');
                const miniNext = mini?.querySelector('[data-action="next-track"]');
                miniPlay?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.togglePlay(); }, true);
                miniNext?.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Player.next(); }, true);
                mini?.querySelector('.mini-progress-bar')?.addEventListener('click', e => e.stopPropagation());
                mini?.querySelector('.mini-progress-bar')?.addEventListener('pointerdown', e => e.stopPropagation());
                const playlistPressTimers = new WeakMap();
                const clearPlaylistTimer = (el) => { const timer=playlistPressTimers.get(el); if(timer){ clearTimeout(timer); playlistPressTimers.delete(el); } };
                const homeSongPressTimers = new WeakMap();
                const clearHomeSongTimer = (el) => { const timer=homeSongPressTimers.get(el); if(timer){ clearTimeout(timer); homeSongPressTimers.delete(el); } };
                document.body.addEventListener('pointerdown', (e) => {
                    const row=e.target.closest('.playlist-longpress-target[data-key1]'); if(!row || e.target.closest('button')) return;
                    clearPlaylistTimer(row);
                    const timer=setTimeout(()=>{ row.dataset.longPressTriggered='1'; UI.openPlaylistActions(row.dataset.key1); }, 520);
                    playlistPressTimers.set(row,timer);
                }, {passive:true});
                document.body.addEventListener('pointerup', (e) => { const row=e.target.closest('.playlist-longpress-target[data-key1]'); if(row) clearPlaylistTimer(row); }, {passive:true});
                document.body.addEventListener('pointercancel', (e) => { const row=e.target.closest('.playlist-longpress-target[data-key1]'); if(row) clearPlaylistTimer(row); }, {passive:true});

                // Android-style press-and-hold for songs on Home.
                document.body.addEventListener('pointerdown', (e) => {
                    const row=e.target.closest('.home-track-longpress-target[data-id]');
                    if(!row || e.target.closest('button') || e.pointerType==='mouse') return;
                    clearHomeSongTimer(row);
                    row.dataset.longPressTriggered='0';
                    row._lpX=e.clientX; row._lpY=e.clientY;
                    const timer=setTimeout(()=>{
                        row.dataset.longPressTriggered='1';
                        if(navigator.vibrate) navigator.vibrate(18);
                        UI.openTrackOptions(row.dataset.id);
                    }, 480);
                    homeSongPressTimers.set(row,timer);
                }, {passive:true});
                document.body.addEventListener('pointermove', (e) => {
                    const row=e.target.closest('.home-track-longpress-target[data-id]');
                    if(!row || row.dataset.longPressTriggered==='1') return;
                    if(Math.abs(e.clientX-(row._lpX||e.clientX))>10 || Math.abs(e.clientY-(row._lpY||e.clientY))>10) clearHomeSongTimer(row);
                }, {passive:true});
                document.body.addEventListener('pointerup', (e) => { const row=e.target.closest('.home-track-longpress-target[data-id]'); if(row) clearHomeSongTimer(row); }, {passive:true});
                document.body.addEventListener('pointercancel', (e) => { const row=e.target.closest('.home-track-longpress-target[data-id]'); if(row) clearHomeSongTimer(row); }, {passive:true});
                document.addEventListener('contextmenu', (e) => { if(e.target.closest('.playlist-longpress-target') || e.target.closest('.home-track-longpress-target')) e.preventDefault(); });

                document.body.addEventListener('click', async (e) => {
                    try {
                    if (State.suppressNextClickUntil && Date.now() < State.suppressNextClickUntil) { e.preventDefault(); e.stopPropagation(); State.suppressNextClickUntil = 0; return; }
                    const btn = e.target.closest('[data-action]'); if (!btn) return;
                    const action = btn.dataset.action;

                    // Central action dispatcher: the previous build omitted core actions here
                    // (song rows, Settings categories, history, playlist actions and transport).
                    // The UI looked normal, but most taps had no handler. Keep this dispatch
                    // explicit, and isolate failures so one action cannot break future taps.
                    try {
                        switch (action) {
                            case 'switch-view':
                                e.preventDefault(); e.stopPropagation(); UI.switchView(btn.dataset.view); return;
                            case 'open-settings-group':
                                e.preventDefault(); e.stopPropagation(); UI.openSettingsGroup(btn.dataset.group); return;
                            case 'settings-group-back':
                                e.preventDefault(); e.stopPropagation(); UI.backSettingsGroup(); return;
                            case 'switch-tab':
                                e.preventDefault(); e.stopPropagation(); UI.switchLibraryTab(btn.dataset.tab); return;
                            case 'click-file-input': {
                                e.preventDefault(); e.stopPropagation();
                                const fileInput = document.getElementById('file-input');
                                if (fileInput) fileInput.click();
                                return;
                            }
                            case 'show-history':
                                e.preventDefault(); e.stopPropagation(); UI.showHistorySheet(); return;
                            case 'load-older-history':
                                e.preventDefault(); e.stopPropagation(); await UI.loadOlderHistory(); return;
                            case 'open-artist':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('artist', btn.dataset.key1); return;
                            case 'open-album':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('album', btn.dataset.key1, btn.dataset.key2); return;
                            case 'open-playlist':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('playlist', btn.dataset.key1); return;
                            case 'open-favorites':
                                e.preventDefault(); e.stopPropagation(); await UI.openContextView('favorites'); return;
                            case 'play-track': {
                                e.preventDefault(); e.stopPropagation();
                                const row = btn.closest('.home-track-longpress-target');
                                if (row?.dataset.longPressTriggered === '1') { row.dataset.longPressTriggered = '0'; return; }
                                const id = btn.dataset.id;
                                if (!id || !State.library.some(track => track.id === id)) { UI.showToast('This track is no longer in your library.', 'error'); return; }
                                const contextName = btn.dataset.context || 'library';
                                let list = State.library;
                                if (contextName === 'search') {
                                    const matches = Array.isArray(State.searchResults) ? State.searchResults.filter(track => State.library.some(item => item.id === track.id)) : [];
                                    // A single search hit should not create a one-track dead-end queue.
                                    list = matches.length > 1 ? matches : State.library;
                                } else if ((contextName === 'playlist' || contextName === 'context') && Array.isArray(State.currentContextView) && State.currentContextView.some(track => track.id === id)) {
                                    list = State.currentContextView;
                                }
                                let index = list.findIndex(track => track.id === id);
                                if (index < 0) { list = State.library; index = list.findIndex(track => track.id === id); }
                                if (index >= 0) Player.playContext(list, index);
                                return;
                            }
                            case 'play-context-all':
                                e.preventDefault(); e.stopPropagation(); Player.playContext(State.currentContextView || [], 0); return;
                            case 'shuffle-context-all':
                                e.preventDefault(); e.stopPropagation(); Player.shuffleContext(State.currentContextView || []); return;
                            case 'shuffle-all':
                                e.preventDefault(); e.stopPropagation(); Player.shuffleContext(State.library || []); return;
                            case 'create-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.promptCreate(); return;
                            case 'rename-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.rename(btn.dataset.key1); return;
                            case 'delete-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.delete(btn.dataset.key1); return;
                            case 'move-playlist':
                                e.preventDefault(); e.stopPropagation(); await Playlists.movePlaylist(btn.dataset.key1, btn.dataset.direction); return;
                            case 'open-playlist-from-sheet': {
                                e.preventDefault(); e.stopPropagation();
                                const pid = State.playlistActionTargetId;
                                UI.closeSheets(); if (pid) await UI.openContextView('playlist', pid);
                                return;
                            }
                            case 'rename-playlist-sheet':
                                e.preventDefault(); e.stopPropagation(); await Playlists.rename(State.playlistActionTargetId); UI.closeSheets(); return;
                            case 'delete-playlist-sheet':
                                e.preventDefault(); e.stopPropagation(); await Playlists.delete(State.playlistActionTargetId); UI.closeSheets(); return;
                            case 'import-playlist-songs': {
                                e.preventDefault(); e.stopPropagation();
                                const pid = State.currentContextType === 'playlist' ? State.currentPlaylistId : State.playlistActionTargetId;
                                if (!pid) { UI.showToast('Open a playlist first.', 'info'); return; }
                                UI.openPlaylistTrackPicker(pid);
                                return;
                            }
                            case 'save-playlist-selected-songs':
                                e.preventDefault(); e.stopPropagation(); await UI.savePlaylistTrackPicker(); return;
                            case 'find-music-online': {
                                e.preventDefault(); e.stopPropagation();
                                const input = document.getElementById('search-input');
                                const rawQuery = String(input?.value || '').trim();
                                if (!rawQuery) { UI.showToast('Enter a song, artist or album to search online.', 'info'); return; }
                                const query = /\bsong\b/i.test(rawQuery) ? rawQuery : `${rawQuery} song`;
                                const targetUrl = `https://royverse69.github.io/mujic/dloader.html?q=${encodeURIComponent(query)}`;
                                const opened = window.open(targetUrl, '_blank');
                                if (opened) opened.opener = null;
                                else UI.showToast('Allow pop-ups to open the music downloader.', 'info');
                                return;
                            }
                            case 'track-options':
                                e.preventDefault(); e.stopPropagation(); await UI.openTrackOptions(btn.dataset.id); return;
                            case 'toggle-favorite':
                                e.preventDefault(); e.stopPropagation(); Player.toggleFavorite(); return;
                            case 'toggle-fav-artist': {
                                e.preventDefault(); e.stopPropagation();
                                const artist = btn.dataset.artist || '';
                                State.favoriteArtists ||= [];
                                const idx = State.favoriteArtists.indexOf(artist);
                                if (idx >= 0) State.favoriteArtists.splice(idx, 1); else State.favoriteArtists.push(artist);
                                await StorageAdapter.saveSettings(); UI.renderHome();
                                await UI.openContextView('artist', artist);
                                return;
                            }
                            case 'toggle-shuffle':
                                e.preventDefault(); e.stopPropagation(); Player.toggleShuffle(); return;
                            case 'toggle-repeat':
                                e.preventDefault(); e.stopPropagation(); Player.toggleRepeat(); return;
                            case 'toggle-play':
                                e.preventDefault(); e.stopPropagation(); Player.togglePlay(); return;
                            case 'next-track':
                                e.preventDefault(); e.stopPropagation(); Player.next(); return;
                            case 'prev-track':
                                e.preventDefault(); e.stopPropagation(); Player.previous(); return;
                            case 'toggle-lyrics':
                                e.preventDefault(); e.stopPropagation(); UI.toggleLyricsMode(); return;
                            case 'toggle-immersive-lyrics':
                                e.preventDefault(); e.stopPropagation(); UI.toggleImmersiveLyrics(); return;
                            case 'go-back':
                                e.preventDefault(); e.stopPropagation(); UI.goBack(); return;
                        }
                    } catch (actionError) {
                        console.error(`Mujic action failed: ${action}`, actionError);
                        UI.showToast(`Couldn't complete ${action.replace(/-/g, ' ')}. Please try again.`, 'error');
                        return;
                    }

                    if (['toggle-play', 'next-track', 'prev-track'].includes(action)) e.stopPropagation();
                    
                    if (action === 'toggle-mute') AudioAdapter.toggleMute();
                    else if (action === 'show-sheet') { e.stopPropagation(); UI.showSheet(btn.dataset.target); }
                    else if (action === 'close-sheets') UI.closeSheets();
                    else if (action === 'prompt-output') AudioAdapter.promptOutputDevice();
                    else if (action === 'set-sleep-timer') Player.setSleepTimer(btn.dataset.val);
                    else if (action === 'set-speed') AudioAdapter.setPlaybackRate(btn.dataset.val);
                    else if (action === 'set-eq') AudioAdapter.setEQ(btn.dataset.val);
                    else if (action === 'set-eq-preset') AudioAdapter.setEQPreset(btn.dataset.val);
                    else if (action === 'set-waveform-style') { e.stopPropagation(); AudioAdapter.setWaveformStyle(btn.dataset.val); }
                    else if (action === 'move-queue') { e.stopPropagation(); Player.moveQueue(parseInt(btn.dataset.index), btn.dataset.direction); }
                    else if (action === 'clear-queue') Player.clearQueue();
                    else if (action === 'remove-queue') { e.stopPropagation(); Player.removeFromQueue(parseInt(btn.dataset.index)); }
                    else if (action === 'play-queue-index') { if (e.target.closest('.drag-handle')) return; Player.playQueueIndex(parseInt(btn.dataset.index)); }
                    else if (action === 'remove-from-playlist') { e.stopPropagation(); Playlists.removeTrack(btn.dataset.key1, parseInt(btn.dataset.index)); }
                    else if (action === 'move-playlist-track') { e.stopPropagation(); Playlists.moveTrack(btn.dataset.key1, parseInt(btn.dataset.index), btn.dataset.direction); }
                    else if (action === 'create-and-add') Playlists.promptCreateAndAdd();
                    else if (action === 'add-to-playlist') Playlists.addTrack(btn.dataset.key1);
                    else if (action === 'open-full-player') UI.openFullPlayer();
                    else if (action === 'close-full-player') UI.closeFullPlayer();
                    else if (action === 'install-pwa') { e.stopPropagation(); UI.installPWA(); }
                    else if (action === 'check-lyrics-cache') {
                        e.stopPropagation();
                        const id = btn.dataset.id;
                        const track = State.library.find(x => x.id === id);
                        const cached = track ? await LyricsFetcher.getCachedOnly(track) : null;
                        if (cached?.text) {
                            State.currentLyrics = cached;
                            // Replace an earlier unavailable result before re-rendering the cached lyrics.
                            LyricsFetcher.cache.set(id, cached);
                            if (cached.isSynced && !cached.parsed) cached.parsed = LyricsFetcher.parseLRC(cached.text);
                            UI.loadCurrentLyrics();
                        } else if (!navigator.onLine) {
                            UI.showToast('No saved lyrics cache. Connect to the internet to fetch lyrics.', 'wifi');
                        } else {
                            UI.showToast('No saved lyrics cache for this song.', 'info');
                        }
                    }
                    else if (action === 'export-settings') UI.exportData('settings');
                    else if (action === 'export-stats') UI.exportData('stats');
                    else if (action === 'import-data') { e.preventDefault(); e.stopPropagation(); document.getElementById('data-import-input')?.click(); }
                    else if (action === 'check-updates') { e.preventDefault(); e.stopPropagation(); UI.checkForUpdates(true); }
                    else if (action === 'refresh-changelog') { e.stopPropagation(); UI.loadChangeLog(true); }
                    else if (action === 'reset-appearance') UI.resetAppearance();
                    else if (action === 'seek-lyric') { AudioAdapter.seek(parseFloat(btn.dataset.time)); }
                    else if (action === 'clear-library') {
                        const confirmed = await Dialog.show({ type: 'confirm', title: 'Wipe Library', message: 'Are you sure you want to completely wipe all application data? This cannot be undone.', confirmText: 'Wipe Data', destructive: true });
                        if(confirmed) {
                            StorageAdapter.clearAll().then(() => {
                                State.library = []; State.playlists = []; State.history = []; State.favorites = []; State.favoriteArtists = []; State.playStats = { days: {} }; State.statsLastAudioTime = null;
                                State.queue = []; State.playbackOrder = []; State.currentTrackId = null; State.queueIndex = -1;
                                AudioAdapter.pause(); AudioAdapter.audio.removeAttribute('src'); AudioAdapter.audio.load();
                                ArtworkCache.clearAll(); UI.closeFullPlayer(); document.getElementById('mini-player').classList.remove('visible');
                                UI.renderHome(); UI.renderLibrary(); UI.renderPlaylists(); UI.updateLibraryStorageStats(); UI.showToast("Library wiped", "delete_forever");
                            });
                        }
                    }
                    else if (action === 'context-opt-play') { Player.playContext(State.library, State.library.findIndex(t=>t.id===State.actionTargetId)); UI.closeSheets(); }
                    else if (action === 'context-opt-next') { Player.addNext(State.actionTargetId); }
                    else if (action === 'context-opt-queue') { Player.addQueue(State.actionTargetId); }
                    else if (action === 'context-opt-fav') { Player.toggleFavorite(State.actionTargetId); }
                    else if (action === 'context-opt-playlist') { UI.closeSheets(); setTimeout(() => UI.showSheet('add-playlist-sheet'), 300); }
                    else if (action === 'context-opt-remove') { 
                        const confirmed = await Dialog.show({ type: 'confirm', title: 'Remove Track', message: 'Remove this track from your library?', confirmText: 'Remove', destructive: true });
                        if(confirmed) Library.removeTrack(State.actionTargetId); 
                    }
                    } catch (error) {
                        console.error('Mujic delegated click handler failed:', error);
                        try { UI.showToast('That action could not be completed. Please try again.', 'error'); } catch (_) {}
                    }
                });

                document.querySelectorAll('.settings-control').forEach(el => {
                    el.addEventListener('change', (e) => {
                        const key = e.target.dataset.setting; if (!key) return;
                        State[key] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'range' || e.target.type === 'number' ? Number(e.target.value) : e.target.value);
                        if (key === 'seekStep') State.seekStep = Number(State.seekStep) || 10;
                        if (key === 'loudnessLevel' && !['soft','balanced','strong'].includes(State.loudnessLevel)) State.loudnessLevel = 'balanced';
                        StorageAdapter.saveSettings(); UI.applySettings(); AudioAdapter.applySettings();
                        if (key === 'keepScreenAwake') AudioAdapter.setWakeLock(State.keepScreenAwake);
                        if (key === 'lyricsTimingOffset') { State.activeLyricIndex = -1; UI.syncLyrics(State.currentTime); }
                        if (key === 'waveformStyle') UI.updateWaveformStyleUI();
                        if (key === 'visualizerMode') UI.updateVisualizerUI();
                        if (key === 'performanceProfile') UI.showToast(State.lowEndModeActive ? 'Low-end performance profile active.' : 'Full visual quality active.', 'speed');
                        if(key === 'librarySort' || key === 'librarySortDir') { Library.sortLibrary(); UI.renderLibrary(); }
                        if(key === 'showArtworkLists') UI.updateHighlights();
                        if(['crossfade','skipSilence','instantSkipSilence','loudnessControl','loudnessLevel','autoSkipOnError','preventDuplicateQueue','preservePitch','varispeed','progressiveSeek','pauseWhenMuted','stopOnPageHide','seekStep','lyricsPlusEnabled'].includes(key)) UI.showToast('Playback preferences updated', 'check_circle');
                    });
                });
                
                const colorSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)');
                const onColorSchemeChange = () => { if (State.theme === 'system') UI.applySettings(); };
                if (colorSchemeQuery?.addEventListener) colorSchemeQuery.addEventListener('change', onColorSchemeChange);
                else if (colorSchemeQuery?.addListener) colorSchemeQuery.addListener(onColorSchemeChange);
            },
            setupGestures: () => {
                window.addEventListener('resize', () => { AudioAdapter.resizeVisualizer(); if (AudioAdapter.visualizerShouldRun()) AudioAdapter.renderScrubberVisualizerFrame(); });
                // Native-style horizontal navigation between the four primary tabs. Vertical scrolling,
                // nested rails, lyrics, inputs, controls and the expanded player keep their own gestures.
                const mainContent = document.getElementById('main-content');
                // On desktop, a conventional mouse wheel is vertical. Translate it to
                // horizontal movement only while the pointer is over a scrollable rail.
                // Trackpads and Shift+wheel keep their native horizontal behavior.
                document.querySelectorAll('.horizontal-rail').forEach((rail) => {
                    if (rail.dataset.desktopWheelBound === '1') return;
                    rail.dataset.desktopWheelBound = '1';
                    rail.addEventListener('wheel', (event) => {
                        if (window.matchMedia('(max-width: 767px)').matches || event.shiftKey) return;
                        const maxScroll = rail.scrollWidth - rail.clientWidth;
                        if (maxScroll <= 1 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
                        const nextScroll = Math.max(0, Math.min(maxScroll, rail.scrollLeft + event.deltaY));
                        if (nextScroll === rail.scrollLeft) return; // preserve normal page scrolling at either rail edge
                        event.preventDefault();
                        rail.scrollLeft = nextScroll;
                    }, { passive: false });
                });
                const primaryViews = ['home','library','search','settings'];
                let navSwipeStart = null;
                const swipeIgnoreSelector = 'input,textarea,select,a,.horizontal-rail,.tab-bar,.search-container,.settings-subpage:not(.hidden),.player-lyrics-container,.scrubber-wrap,.bottom-sheet,.dialog-box,[data-eq-band],.lyrics-offset-control';
                mainContent?.addEventListener('pointerdown', (e) => {
                    if (e.pointerType !== 'touch' || State.isFullPlayerOpen || !mainContent.contains(e.target)) { navSwipeStart = null; return; }
                    const view = document.querySelector('.view.active');
                    const viewId = view?.id?.replace('view-','');
                    if (!primaryViews.includes(viewId) || e.target.closest(swipeIgnoreSelector)) { navSwipeStart = null; return; }
                    navSwipeStart = {x:e.clientX, y:e.clientY, viewId, pointerId:e.pointerId};
                }, {passive:true});
                mainContent?.addEventListener('pointerup', (e) => {
                    if (!navSwipeStart || e.pointerId !== navSwipeStart.pointerId) { navSwipeStart = null; return; }
                    const start = navSwipeStart; navSwipeStart = null;
                    const dx = e.clientX - start.x, dy = e.clientY - start.y;
                    if (Math.abs(dx) < 78 || Math.abs(dy) > 58 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
                    const idx = primaryViews.indexOf(start.viewId);
                    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
                    if (nextIdx < 0 || nextIdx >= primaryViews.length) return;
                    State.suppressNextClickUntil = Date.now() + 320;
                    UI.switchView(primaryViews[nextIdx]);
                }, {passive:true});
                mainContent?.addEventListener('pointercancel', () => { navSwipeStart = null; }, {passive:true});
                const sb = document.getElementById('scrubber-bar');
                const updateScrubber = (e) => { 
                    const r = sb.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX);
                    const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); AudioAdapter.seek(p * State.duration); 
                };
                if (sb) {
                    sb.addEventListener('pointerdown', e => { if (!sb.setPointerCapture) return; sb.setPointerCapture(e.pointerId); updateScrubber(e); });
                    sb.addEventListener('pointermove', e => { if(sb.hasPointerCapture?.(e.pointerId)) updateScrubber(e); });
                    sb.addEventListener('pointerup', e => { if(sb.hasPointerCapture?.(e.pointerId)) sb.releasePointerCapture(e.pointerId); });
                    sb.addEventListener('pointercancel', e => { if(sb.hasPointerCapture?.(e.pointerId)) sb.releasePointerCapture(e.pointerId); });
                }
                
                const vb = document.getElementById('volume-slider-track');
                const updateVolume = (e) => { 
                    const r = vb.getBoundingClientRect(); const x = e.clientX || (e.touches && e.touches[0].clientX);
                    const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); AudioAdapter.setVolume(p); 
                };
                if (vb) {
                    vb.addEventListener('pointerdown', e => { if (!vb.setPointerCapture) return; vb.setPointerCapture(e.pointerId); updateVolume(e); });
                    vb.addEventListener('pointermove', e => { if(vb.hasPointerCapture?.(e.pointerId)) updateVolume(e); });
                    vb.addEventListener('pointerup', e => { if(vb.hasPointerCapture?.(e.pointerId)) vb.releasePointerCapture(e.pointerId); });
                    vb.addEventListener('pointercancel', e => { if(vb.hasPointerCapture?.(e.pointerId)) vb.releasePointerCapture(e.pointerId); });
                }
                
                let sy = 0, sx = 0; const fp = document.getElementById('full-player');
                fp?.addEventListener('touchstart', e => { sy = e.touches[0].clientY; sx = e.touches[0].clientX; }, {passive:true});
                fp?.addEventListener('touchend', e => { 
                    const dy = e.changedTouches[0].clientY - sy; const dx = Math.abs(e.changedTouches[0].clientX - sx);
                    if(dy > 120 && dy > dx && !e.target.closest('.player-lyrics-container') && !e.target.closest('.scrubber-wrap')) {
                         UI.closeFullPlayer(); 
                    }
                });
                
                document.querySelectorAll('[data-eq-band]').forEach(input => {
                    input.addEventListener('input', (e) => { AudioAdapter.setEQBand(e.target.dataset.eqBand, e.target.value); });
                });
                document.getElementById('file-input')?.addEventListener('change', (e) => Library.importFiles(e, State.playlistImportTargetId));
                document.getElementById('data-import-input')?.addEventListener('change', (e) => UI.importData(e.target.files?.[0]));
                document.getElementById('playlist-track-picker-search')?.addEventListener('input', () => UI.renderPlaylistTrackPicker());
                document.getElementById('search-input')?.addEventListener('input', UI.handleSearch);
            }
        };
