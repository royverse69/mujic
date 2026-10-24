/* Copyright mujic@royverse69 */
(() => {
    const KEYS = { history:'mujic-online-history-v1', searches:'mujic-online-searches-v1', playlists:'mujic-online-playlists-v1', favorites:'mujic-online-favorites-v1', linked:'mujic-workspaces-linked-v1', queues:'mujic-workspace-queues-v1', shelves:'mujic-online-shelves-v10', caching:'mujic-online-caching-v1', taste:'mujic-online-taste-v1', trackPlays:'mujic-online-track-plays-v1', suggest:'mujic-online-suggest-v1', publicPlaylists:'mujic-online-public-playlists-v1', artistCache:'mujic-online-artist-cache-v6', artistCatalogue:'mujic-online-artist-catalogue-v4', artistStats:'mujic-online-artist-stats-v1' };
    let onlineHistory = [], searchHistory = [], playlists = [], onlineFavorites = [], searchQuery = '', searchPage = 0, searchType = 'all';
    let searchResults = [], entityResults = [], allSearchResults = null, activePlaylistId = null, pendingTrackId = null, requestSequence = 0, visibleSearchCount = 8, searchHasMore = false;
    let libraryTab = 'playlists', remoteRequestSequence = 0;
    let initialized = false, isLoadingMore = false, searchMoreObserver = null;
    let linked = false, queueSnapshots = {offline:null, online:null};
    let taste = {parts:{}}, trackPlays = {}, suggestState = {sig:'',items:[],savedAt:0,loading:''}, personalTimer = null, greetingTimer = null;
    let artistCatalogue = [], artistCataloguePromise = null, artistSortMode = 'recommended', artistStats = {};
    const shelfContexts = new Map();
    let homeShelves = {}, homeLoadPromise = null, homeLastLoaded = 0, publicPlaylistQuery = 'Hindi romantic', publicPlaylistPage = 0, publicPlaylistResults = [], activeRemoteEntity = null;
    const artistTrackCache = new Map(), artistAlbumCache = new Map(), artistLoadPromises = new Map();
    const safeRead = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch (_) { return fallback; } };
    const DISCOVERY_RESULT_KEY='mujic-discovery-results-v1', RADIO_RESULT_KEY='mujic-radio-results-v2', RADIO_HISTORY_KEY='mujic-radio-history-v1';
    const DISCOVERY_FALLBACK = window.MUJIC_DISCOVERY_CATALOG || {
        categories:[
            {id:'bollywood',label:'Bollywood',description:'Hindi film favourites, fresh soundtracks and Bollywood essentials.',theme:'bollywood',art:'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=82',songs:['Bollywood hits','Hindi film songs'],playlists:['Bollywood playlists'],albums:['Hindi movie soundtracks']},
            {id:'pop',label:'Pop',description:'Big pop hooks and global hits.',theme:'pop',art:'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=82',songs:['English pop hits','global pop hits'],playlists:['English pop playlists'],albums:['English pop albums']},
            {id:'punjabi',label:'Punjabi',description:'Punjabi pop, bhangra and the latest hits.',theme:'punjabi',art:'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=82',songs:['Punjabi hits','new Punjabi songs'],playlists:['Punjabi hits playlists'],albums:['Punjabi albums']},
            {id:'rock',label:'Rock',description:'Guitar-driven classics and modern rock.',theme:'rock',art:'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1000&q=82',songs:['rock classics','alternative rock hits'],playlists:['rock playlists'],albums:['rock albums']},
            {id:'lofi',label:'Lo-fi',description:'Soft beats for focus and slower moments.',theme:'lofi',art:'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1000&q=82',songs:['lofi study beats','lofi hip hop'],playlists:['lofi study playlists'],albums:['lofi albums']}
        ],
        stations:[
            {id:'drive',name:'Drive Radio',description:'Steady, upbeat music for the open road.',art:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=82',accent:'#d06b36',queries:['driving songs','road trip hits','upbeat pop songs']},
            {id:'bollywood',name:'Bollywood Radio',description:'Hindi film favourites and fresh soundtrack picks.',art:'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1000&q=82',accent:'#c83b65',queries:['Bollywood hits','Hindi film songs','new Bollywood songs']},
            {id:'english',name:'English Radio',description:'Global pop and English-language hits.',art:'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=82',accent:'#3d78c6',queries:['English hits','global pop hits','international pop songs']},
            {id:'old-hindi',name:'Old Hindi Radio',description:'Evergreen Hindi songs and old Bollywood classics.',art:'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=1000&q=82',accent:'#ac8a53',queries:['old Hindi songs','90s Hindi hits','classic Bollywood songs']}
        ]
    };
    let discoveryCatalog=null, discoveryCatalogPromise=null, activeRadioSession=null;
    let discoveryResultCache=safeRead(DISCOVERY_RESULT_KEY,{}), radioResultCache=safeRead(RADIO_RESULT_KEY,{}), radioHistory=safeRead(RADIO_HISTORY_KEY,{});
    const saveBoundedCache=(key,cache,limit=8)=>{
        const ordered=Object.entries(cache||{}).sort((a,b)=>(Number(b[1]?.savedAt)||0)-(Number(a[1]?.savedAt)||0)).slice(0,limit);
        const normalized=Object.fromEntries(ordered);
        try{localStorage.setItem(key,JSON.stringify(normalized));}catch(_){try{const reduced=Object.fromEntries(ordered.slice(0,Math.max(2,Math.floor(limit/2))));localStorage.setItem(key,JSON.stringify(reduced));}catch(__){}}
        return normalized;
    };
    const loadDiscoveryCatalog=()=>{
        if(discoveryCatalog)return Promise.resolve(discoveryCatalog);
        if(discoveryCatalogPromise)return discoveryCatalogPromise;
        if(typeof fetch!=='function'){discoveryCatalog=DISCOVERY_FALLBACK;return Promise.resolve(discoveryCatalog);}
        discoveryCatalogPromise=fetch('./data/discovery-catalog.json',{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error('Discovery catalog unavailable');return response.json();}).then(data=>{
            if(!Array.isArray(data?.categories)||!data.categories.length||!Array.isArray(data?.stations)||!data.stations.length)throw new Error('Discovery catalog is incomplete');
            discoveryCatalog=data;renderRadioShelf();
            const searchInput=document.getElementById('online-search-input');
            if(document.getElementById('view-online-search')?.classList.contains('active')&&!searchInput?.value?.trim())renderSearchBlank();
            return discoveryCatalog;
        }).catch(()=>{discoveryCatalog=DISCOVERY_FALLBACK;renderRadioShelf();return discoveryCatalog;});
        return discoveryCatalogPromise;
    };
    const shuffleTracks=list=>{const out=[...(Array.isArray(list)?list:[])];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
    const radioFingerprint=track=>`${titleKey(track?.title||'')}|${artistKey(track?.artist||'')}`;
    const radioTrackKeys=track=>[`id:${String(track?.id||'')}`,`fp:${radioFingerprint(track)}`];
    const getRadioHistory=id=>Array.isArray(radioHistory?.[id])?radioHistory[id]:[];
    const rememberRadioTrack=(id,track)=>{
        if(!id||!track?.id)return;
        const rows=getRadioHistory(id),keys=radioTrackKeys(track).filter(value=>!value.endsWith(':'));
        radioHistory={...radioHistory,[id]:[...rows.filter(row=>!keys.includes(row)),...keys].slice(-90)};
        try{localStorage.setItem(RADIO_HISTORY_KEY,JSON.stringify(radioHistory));}catch(_){}
    };
    const currentViewName=()=>{const id=document.querySelector('.view.active')?.id||'view-online-home';return id.replace(/^view-/,'');};
    const cachedRadioTracks=(station,page=0)=>{
        const row=radioResultCache?.[`${station.id}:${page}`];
        if(!row||Date.now()-Number(row.savedAt||0)>20*60*1000)return [];
        return (row.tracks||[]).map(restoreTrack).filter(Boolean);
    };
    const saveRadioTracks=(station,page,tracks)=>{
        radioResultCache[`${station.id}:${page}`]={savedAt:Date.now(),tracks:tracks.slice(0,65).map(serializeTrack)};
        radioResultCache=saveBoundedCache(RADIO_RESULT_KEY,radioResultCache,10);
    };
    const persist = () => {
        try { onlineHistory=dedupePlaylistTracks(onlineHistory).slice(0,100); localStorage.setItem(KEYS.history, JSON.stringify(onlineHistory)); } catch (_) {}
        try { localStorage.setItem(KEYS.artistStats,JSON.stringify(artistStats)); } catch (_) {}
        try { localStorage.setItem(KEYS.searches, JSON.stringify(searchHistory.slice(0,30))); } catch (_) {}
        try { onlineFavorites=dedupePlaylistTracks(onlineFavorites).slice(0,500); localStorage.setItem(KEYS.favorites, JSON.stringify(onlineFavorites)); } catch (_) {}
        try { localStorage.setItem(KEYS.playlists, JSON.stringify(playlists.map(p => ({...p, tracks:dedupePlaylistTracks((p.tracks||[]).map(t=>trackById(t?.id)||t)).map(t => OnlineCache?.sanitize ? OnlineCache.sanitize(t) : t)})))); } catch (_) {}
    };
    const esc = value => Utils.escapeHTML(String(value ?? ''));
    const restoreTrack = value => {
        if (!value || typeof value !== 'object' || !value.id) return null;
        const savedId=String(value.id),provider=value.provider||(savedId.startsWith('machhar:machhar:')?'machhar':'saavn');
        let onlineTrackId=String(value.onlineTrackId||value.songId||value.song_id||'').trim();
        if(!onlineTrackId&&!/^(?:artists|albums|playlists):/i.test(savedId))onlineTrackId=savedId.replace(/^machhar:(?:saavn|machhar):/,'').replace(/^machhar:/,'');
        if(!onlineTrackId)return null;
        const id=savedId.startsWith('machhar:')?savedId:`machhar:${provider}:${onlineTrackId}`;
        return OnlineMusic.registerTrack({...value,id,onlineTrackId,provider,source:'machhar-online',isOnline:true,raw:value.raw||{}});
    };
    const hydrate = list => (Array.isArray(list) ? list : []).map(restoreTrack).filter(Boolean);
    const serializeTrack = track => window.OnlineCache?.sanitize ? OnlineCache.sanitize(track) : ({
        id:track.id, onlineTrackId:track.onlineTrackId, provider:track.provider || 'saavn', source:'machhar-online',
        title:track.title, artist:track.artist, album:track.album, duration:track.duration, year:track.year,
        language:track.language, genre:track.genre, composer:track.composer, artworkUrl:track.artworkUrl, fileName:track.fileName, isOnline:true
    });
    const trackById = value => {
        const id = value && typeof value === 'object' ? String(value.id || '') : String(value ?? '');
        if (!id) return null;
        return Player.getTrackById(id) || OnlineMusic.getTrack(id) || window.OnlineCache?.getTrack(id) || (value && typeof value === 'object' ? value : null);
    };
    const titleKey = text => (OnlineRecommendations?.cleanTitle ? OnlineRecommendations.cleanTitle(text) : String(text||'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9]+/g,' ').trim());
    const artistKey = text => (OnlineRecommendations?.cleanArtist ? OnlineRecommendations.cleanArtist(text) : String(text||'').toLowerCase().split(',')[0].replace(/[^a-z0-9]+/g,' ').trim());
    const sameSong = (a,b) => {
        if(!a||!b)return false;
        if(String(a.id||'')&&String(a.id||'')===String(b.id||''))return true;
        const ta=titleKey(a.title),tb=titleKey(b.title),aa=artistKey(a.artist),ab=artistKey(b.artist);
        if(!ta||ta!==tb)return false;
        if(aa&&ab)return aa===ab || Boolean(window.OnlineRecommendations?.isSameRecording?.(a,b));
        return true;
    };
    const dedupePlaylistTracks = list => {
        const out=[];
        for(const track of Array.isArray(list)?list:[]) {
            if(!track?.id)continue;
            if(out.some(previous=>sameSong(previous,track)))continue;
            out.push(track);
        }
        return out;
    };
    const searchHistoryChip = query => `<div class="online-search-history-chip"><button type="button" class="online-chip" data-action="online-search-query" data-query="${esc(query)}">${esc(query)}</button><button type="button" class="online-search-history-remove" data-action="online-remove-search-history" data-query="${esc(query)}" aria-label="Remove search ${esc(query)}" title="Remove from search history"><span class="material-symbols-rounded" aria-hidden="true">close</span></button></div>`;
    const rememberSearch = q => {
        const value = String(q||'').trim(); if (!value) return;
        searchHistory = [value, ...searchHistory.filter(x => String(x).toLowerCase() !== value.toLowerCase())].slice(0,30); persist(); renderSearchHistory();
        if (document.getElementById('view-online-search')?.classList.contains('active') && !document.getElementById('online-search-input')?.value?.trim()) renderSearchBlank();
    };
    const removeSearchHistory = query => {
        const value=String(query||'').trim(); if(!value)return false;
        const before=searchHistory.length;
        searchHistory=searchHistory.filter(item=>String(item).toLocaleLowerCase()!==value.toLocaleLowerCase());
        if(searchHistory.length===before)return false;
        persist(); renderSearchHistory();
        if(document.getElementById('view-online-search')?.classList.contains('active')&&!document.getElementById('online-search-input')?.value?.trim())renderSearchBlank();
        return true;
    };
    const renderSearchHistory = () => {
        const el = document.getElementById('online-recent-searches'); if (!el) return;
        el.innerHTML = searchHistory.slice(0,8).map(searchHistoryChip).join('');
    };
    const renderTrackRows = (tracks, context, emptyText='Nothing here yet.') => {
        const list = (Array.isArray(tracks) ? tracks : []).filter(Boolean);
        if (!list.length) return `<div class="online-empty-inline">${esc(emptyText)}</div>`;
        return `<div class="track-list">${list.map(t => UI.buildTrackRow(t, context)).join('')}</div>`;
    };
    const setSearchContext = tracks => { searchResults = tracks.slice(); };
    const renderConnectivityState = () => {
        const disconnected = !navigator.onLine;
        const status = document.getElementById('online-home-connection');
        const statusText = document.getElementById('online-home-status');
        if (status) status.hidden = !disconnected;
        if (statusText) statusText.textContent = disconnected ? 'You’re offline' : '';
        const searchEl = document.getElementById('online-search-results');
        if (searchEl && disconnected && !searchResults.length && !entityResults.length) {
            searchEl.innerHTML = `<div class="online-network-state"><span class="material-symbols-rounded">wifi_off</span><div class="empty-title">No connection</div><div class="online-network-actions"><button class="btn" data-action="retry-online-search">Retry</button><button class="btn" data-action="toggle-playback-mode">Offline library</button></div></div>`;
        }
        const pill = document.getElementById('workspace-online-pill'); if (pill) pill.hidden = true;
    };
    const searchTypeLabels = {all:'All',songs:'Songs',playlists:'Playlists',albums:'Albums',artists:'Artists'};
    const setSearchTypeUI = () => {
        document.querySelectorAll('.online-search-tab').forEach(button => {
            const active=button.dataset.type===searchType;
            button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
        });
    };
    const setSearchType = (kind, query = '') => {
        searchType = ['all','songs','playlists','albums','artists'].includes(kind) ? kind : 'all';
        setSearchTypeUI();
        const input=document.getElementById('online-search-input');
        if (query && input) input.value=query;
        if (State.playbackSourceMode!=='online') return;
        renderSearchBlank();
        if (input?.value?.trim()) performSearch(input.value);
    };
    const renderSearchBlank = () => {
        const c = document.getElementById('online-search-results'); if (!c) return;
        setSearchTypeUI();
        if (!navigator.onLine) { renderConnectivityState(); return; }
        const recent = searchHistory.slice(0,8);
        const chips = recent.map(searchHistoryChip).join('');
        const categories = discoveryCatalog?.categories || DISCOVERY_FALLBACK.categories;
        const categoryCards = categories.map(category => `<button type="button" class="online-category-card category-${esc(category.theme||category.id)}" data-action="online-open-category" data-id="${esc(category.id)}" aria-label="Explore ${esc(category.label)}"><img width="320" height="200" class="online-category-art" src="${esc(category.art)}" alt="" loading="lazy" decoding="async"><span class="online-category-kicker">Explore</span><strong>${esc(category.label)}</strong></button>`).join('');
        if(!discoveryCatalog)loadDiscoveryCatalog();
        c.innerHTML = `<div class="online-search-start">${chips ? `<section class="online-search-recent"><div class="online-section-topline"><div><div class="online-mini-label">Pick up where you left off</div><h2>Recent searches</h2></div><span class="online-section-note">${recent.length} saved</span></div><div class="online-chip-list">${chips}</div></section>` : ''}<section class="online-browse-section"><div class="online-section-topline"><div><div class="online-mini-label">Explore the catalogue</div><h2>Browse Categories</h2><p>Find something for your mood, moment or music taste.</p></div></div><div class="online-category-grid">${categoryCards}</div></section></div>`;
        const tabs=document.querySelector('.online-search-tabs');if(tabs)tabs.hidden=true;
        const suggestions=document.getElementById('online-search-suggestions');if(suggestions)suggestions.hidden=false;
        const clear=document.querySelector('.online-search-clear');if(clear)clear.hidden=!(document.getElementById('online-search-input')?.value||'').trim();
    };
    const entityKey = item => String(item?.id || (item?.type && item?.sourceId ? `${item.type}:${item.sourceId}` : ''));
    const isTrackVariant = track => /\b(remix|rework|mashup|slowed|reverb|sped ?up|nightcore|live|acoustic|instrumental|karaoke|cover|extended|club mix|version|lo.?fi)\b/i.test(String(track?.title||''));
    const dedupeCatalogueTracks = tracks => {
        const out=[];
        const score=track => (isTrackVariant(track)?0:10)+(track?.artworkUrl?2:0)+(track?.duration?1:0)+(track?.isrc?2:0);
        for(const track of Array.isArray(tracks)?tracks:[]) {
            if(!track?.id)continue;
            const title=titleKey(track.title),artist=artistKey(track.artist);
            const foundIndex=out.findIndex(item=>{
                if(item.id===track.id)return true;
                const sameFingerprint=title&&title===titleKey(item.title)&&artist===artistKey(item.artist);
                return Boolean(sameFingerprint||window.OnlineRecommendations?.isSameRecording?.(track,item));
            });
            if(foundIndex<0){out.push(track);continue;}
            if(score(track)>score(out[foundIndex]))out[foundIndex]=track;
        }
        return out;
    };
    const mergeUnique = (oldList, newList, kind='songs') => {
        const seen=new Set((oldList||[]).map(item=>entityKey(item)).filter(Boolean));
        const baseSongs=new Set((oldList||[]).filter(item=>item?.onlineTrackId).filter(item=>!isTrackVariant(item)).map(item=>`${titleKey(item.title)}|${artistKey(item.artist)}`));
        const out=[...(oldList||[])];let added=0;
        for(const item of newList||[]){
            const key=entityKey(item);if(!key||seen.has(key))continue;
            if(kind==='songs'&&item?.onlineTrackId){
                const fingerprint=`${titleKey(item.title)}|${artistKey(item.artist)}`;
                const equivalent=out.some(previous=>previous?.onlineTrackId&&(fingerprint===`${titleKey(previous.title)}|${artistKey(previous.artist)}`||window.OnlineRecommendations?.isSameRecording?.(item,previous)));
                if(equivalent)continue;
                if(!isTrackVariant(item))baseSongs.add(fingerprint);
            }
            seen.add(key);out.push(item);added++;
        }
        return {items:out,added};
    };
    const renderAllSearchResults = (q, hasMore = false) => {
        const target=document.getElementById('online-search-results');if(!target)return;
        target.classList.remove('is-refreshing');target.removeAttribute('aria-busy');
        const tabs=document.querySelector('.online-search-tabs');if(tabs)tabs.hidden=false;
        const suggestions=document.getElementById('online-search-suggestions');if(suggestions)suggestions.hidden=true;
        const data=allSearchResults||{topQuery:[],albums:[],artists:[],playlists:[]};
        const uniq=list=>{
            const seen=new Set();return (Array.isArray(list)?list:[]).filter(item=>item?.id&&!seen.has(item.id)&&seen.add(item.id));
        };
        const tracks=searchResults.slice(0,visibleSearchCount);
        const renderShelf=(kind,label,items)=>{
            const list=uniq(items).slice(0,8);if(!list.length)return '';
            return `<section class="online-all-search-section"><div class="online-shelf-heading"><h3>${label}</h3><button class="text-action" data-action="online-set-search-type" data-type="${kind}">See all</button></div><div class="online-card-rail">${renderEntityRail(list,kind)}</div></section>`;
        };
        let html=`<div class="online-results-toolbar"><strong>${searchResults.length.toLocaleString()} results</strong></div>`;
        const top=Array.isArray(data.topQuery)?data.topQuery:[];
        const topEntities=top.filter(item=>item.type&&['artists','albums','playlists'].includes(item.type));
        const topSongs=top.filter(item=>item.onlineTrackId);
        if(topEntities.length)html+=renderShelf(topEntities[0].type,'Top result',topEntities.slice(0,5));
        if(topSongs.length&&tracks.every(t=>t.id!==topSongs[0].id))html+=`<section class="online-all-search-section"><div class="online-shelf-heading"><h3>Top match</h3></div>${renderTrackRows(topSongs.slice(0,1),'online-search')}</section>`;
        html+=`<section class="online-all-search-section"><div class="online-shelf-heading"><h3>Songs</h3><button class="text-action" data-action="online-set-search-type" data-type="songs">See all</button></div>${tracks.length?renderTrackRows(tracks,'online-search'):'<div class="online-all-search-empty">No songs found.</div>'}</section>`;
        html+=renderShelf('artists','Artists',data.artists);
        html+=renderShelf('albums','Albums',data.albums);
        html+=renderShelf('playlists','Playlists',data.playlists);
        if(hasMore||searchResults.length>tracks.length)html+=`<div class="online-load-more-wrap"><button class="btn" data-action="online-load-more">Load more</button></div>`;
        target.innerHTML=html;
        if(window.OnlineCache)OnlineCache.warmTracks(searchResults.slice(0,50));
        const topSongsForWarm=(Array.isArray(data.topQuery)?data.topQuery:[]).filter(item=>item?.onlineTrackId).slice(0,1);
        OnlineMusic.warmPlaybackCandidates?.([...topSongsForWarm,...searchResults.slice(0,8)],8,{primaryFirst:true}).catch(()=>{});
        UI.lazyLoadArtwork();
        attachSearchInfiniteScroll(target);
    };
    const paintSearchResults = (q, total = 0, hasMore = false) => {
        const target=document.getElementById('online-search-results');if(!target)return;
        target.classList.remove('is-refreshing');target.removeAttribute('aria-busy');
        const tabs=document.querySelector('.online-search-tabs');if(tabs)tabs.hidden=false;
        const suggestions=document.getElementById('online-search-suggestions');if(suggestions)suggestions.hidden=true;
        searchHasMore=Boolean(hasMore);
        if(searchType==='all'){renderAllSearchResults(q,hasMore);return;}
        const sourceList=searchType==='songs'?searchResults:entityResults;
        const list=sourceList.slice(0,visibleSearchCount);
        const count=String(sourceList.length.toLocaleString());
        let body='';
        if(searchType==='songs') body=renderTrackRows(list,'online-search',`No results for “${q}”.`);
        else body=renderEntityGrid(list,searchType,'Search to discover more.');
        const more=(hasMore||sourceList.length>list.length)?'<div class="online-load-more-wrap"><button class="btn" data-action="online-load-more">Load more</button></div>':'';
        target.innerHTML=`<div class="online-results-toolbar"><strong>${esc(count)} ${searchTypeLabels[searchType].toLowerCase()}</strong></div>${body}${more}`;
        if(searchType==='songs') { setSearchContext(searchResults); if(window.OnlineCache)OnlineCache.warmTracks(searchResults.slice(0,50)); OnlineMusic.warmPlaybackCandidates?.(searchResults.slice(0,8),8,{primaryFirst:true}).catch(()=>{}); }
        UI.lazyLoadArtwork();
        attachSearchInfiniteScroll(target);
    };
    const getSearchExpansions = (query, kind) => {
        const q=String(query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
        if (kind === 'songs' && ['english hits','english hit','english songs','english song','english pop','international hits'].includes(q)) {
            return ['popular English songs','English pop hits','international pop hits'];
        }
        return [];
    };
    const getEntitySearchExpansions = (query, kind) => {
        const q=String(query||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
        if (kind === 'playlists' && /\b(english|international|global|hollywood)\b/.test(q)) {
            return ['English pop playlists','international hits playlist','global pop hits playlist'];
        }
        if (kind === 'albums' && /\b(english|international|global|hollywood)\b/.test(q)) {
            return ['English hit albums','popular English albums','international pop albums'];
        }
        return [];
    };
    let searchAbort = null;
    /* Pages 1-2 are requested together so the fill loop below finds them already in flight instead of paying one round trip per page. */
    const warmSearchPages = q => { const pages = {}; for (const warmPage of [1, 2]) pages[warmPage] = OnlineMusic.search(q, { page:warmPage, limit:10, background:true }).catch(() => []); return pages; };
    const performSearch = async (query, append = false) => {
        const input=document.getElementById('online-search-input');
        const target=document.getElementById('online-search-results');if(!target)return [];
        const q=String(query ?? input?.value ?? '').trim();
        if(!q){searchQuery='';searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;visibleSearchCount=8;searchHasMore=false;searchMoreObserver?.disconnect();searchMoreObserver=null;target.classList.remove('is-refreshing');target.removeAttribute('aria-busy');renderSearchBlank();return [];}
        if(State.playbackSourceMode!=='online')return [];
        if(!navigator.onLine){renderConnectivityState();return [];}
        if(!append){
            const hadVisibleResults=Boolean(target.querySelector('.track-row,.online-entity-card,.online-media-card,.online-all-search-section'));
            searchQuery=q;searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;visibleSearchCount=8;searchHasMore=false;
            const requestId=++requestSequence;target.dataset.requestId=String(requestId);try{searchAbort?.abort();}catch(_){}searchAbort=new AbortController();
            target.classList.add('is-refreshing');target.setAttribute('aria-busy','true');
            if(hadVisibleResults) target.insertAdjacentHTML('afterbegin','<div class="online-search-loading-status" role="status">Updating results…</div>');
            else target.innerHTML='<div class="online-skeleton-list" aria-hidden="true"><span></span><span></span><span></span></div>';
            rememberSearch(q);
        }
        else if(q!==searchQuery)return [];
        const requestId=Number(target.dataset.requestId||requestSequence);
        const page=append?searchPage+1:0;
        const isCurrent=()=>requestId===Number(target.dataset.requestId||requestId)&&State.playbackSourceMode==='online';
        try{
            if(!append&&searchType==='all'){
                try {
                    const searchSignal=searchAbort?.signal;
                    allSearchResults=await OnlineMusic.globalSearch(q,searchSignal);
                    if(!isCurrent())return [];
                    const globalHasResults=Boolean((allSearchResults.topQuery||[]).length||(allSearchResults.songs||[]).length||(allSearchResults.albums||[]).length||(allSearchResults.artists||[]).length||(allSearchResults.playlists||[]).length);
                    if(!globalHasResults)throw new Error('Global search returned no usable results');
                    searchResults=dedupeCatalogueTracks(allSearchResults.songs||[]);
                    setSearchContext(searchResults);
                    paintSearchResults(q,searchResults.length,searchResults.length>=8);
                    if(window.OnlineCache)OnlineCache.warmTracks(searchResults.slice(0,50));
                    return searchResults;
                } catch (_) {
                    if(!isCurrent())return [];
                    const [songs,artists,albums,playlists]=await Promise.all([
                        OnlineMusic.search(q,{page:0,limit:10}).catch(()=>[]),
                        OnlineMusic.searchEntities('artists',q,{page:0,limit:20}).catch(()=>({items:[]})),
                        OnlineMusic.searchEntities('albums',q,{page:0,limit:20}).catch(()=>({items:[]})),
                        OnlineMusic.searchEntities('playlists',q,{page:0,limit:20}).catch(()=>({items:[]}))
                    ]);
                    if(!isCurrent())return [];
                    searchResults=dedupeCatalogueTracks(songs||[]);
                    let pageMeta=songs.searchMeta||OnlineMusic.getSearchMeta();
                    allSearchResults={topQuery:[],songs:searchResults,artists:artists.items||[],albums:albums.items||[],playlists:playlists.items||[]};
                    setSearchContext(searchResults);
                    paintSearchResults(q,Number(pageMeta.total)||searchResults.length,Boolean(pageMeta.hasMore));
                    const warmed=pageMeta?.hasMore&&searchResults.length<24?warmSearchPages(q):{};
                    for(let nextPage=1;nextPage<8&&searchResults.length<24&&pageMeta?.hasMore&&isCurrent();nextPage++){
                        await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
                        const next=await (warmed[nextPage]||OnlineMusic.search(q,{page:nextPage,limit:10,background:true}).catch(()=>[]));
                        if(!isCurrent())return [];
                        if(!Array.isArray(next)||!next.length)break;
                        const mergedPage=mergeUnique(searchResults,next,'songs');
                        if(!mergedPage.added)break;
                        searchResults=mergedPage.items;
                        allSearchResults.songs=searchResults;
                        setSearchContext(searchResults);
                        pageMeta=next.searchMeta||OnlineMusic.getSearchMeta()||pageMeta;
                        searchPage=nextPage;
                        paintSearchResults(q,Number(pageMeta.total)||searchResults.length,Boolean(pageMeta.hasMore));
                    }
                    return searchResults;
                }
            }
            if(searchType==='all'&&append){
                const nextPageResult=await OnlineMusic.search(q,{page,limit:10});
                if(!isCurrent())return [];
                const pageMeta=nextPageResult.searchMeta||OnlineMusic.getSearchMeta()||{};
                const mergedAll=mergeUnique(searchResults,nextPageResult,'songs');
                searchResults=mergedAll.items;searchPage=page;searchHasMore=Boolean(pageMeta.hasMore);
                if(allSearchResults)allSearchResults.songs=searchResults;
                setSearchContext(searchResults);
                paintSearchResults(q,Number(pageMeta.total)||searchResults.length,Boolean(pageMeta.hasMore));
                return searchResults;
            }
            if(searchType==='songs'){
                const firstPage=await OnlineMusic.search(q,{page,limit:10});
                if(!isCurrent())return [];
                let meta=firstPage.searchMeta||OnlineMusic.getSearchMeta();
                let merged=mergeUnique(append?searchResults:[],firstPage,'songs');
                searchResults=merged.items;
                setSearchContext(searchResults);
                searchPage=page;
                paintSearchResults(q,Number(meta.total)||searchResults.length,Boolean(meta.hasMore));
                const expansions=!append?getSearchExpansions(q,'songs'):[];
                if(expansions.length){
                    Promise.allSettled(expansions.map(term=>OnlineMusic.search(term,{page:0,limit:10,background:true}))).then(results=>{
                        if(!isCurrent()||searchType!=='songs'||(String(input?.value||'').trim()&&String(input.value).trim().toLowerCase()!==q.toLowerCase()))return;
                        const expanded=results.flatMap(result=>result.status==='fulfilled'?Array.from(result.value||[]):[]);
                        if(!expanded.length)return;
                        const enriched=mergeUnique(searchResults,expanded,'songs');
                        if(enriched.added){
                            searchResults=enriched.items;
                            setSearchContext(searchResults);
                            paintSearchResults(q,Math.max(Number(meta.total)||0,searchResults.length),Boolean(meta.hasMore));
                        }
                    }).catch(()=>{});
                }
                if(!append){
                    const warmed=meta?.hasMore&&searchResults.length<24?warmSearchPages(q):{};
                    for(let nextPage=1;nextPage<8&&searchResults.length<24&&meta?.hasMore&&isCurrent();nextPage++){
                        await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
                        const next=await (warmed[nextPage]||OnlineMusic.search(q,{page:nextPage,limit:10,background:true}).catch(()=>[]));
                        if(!isCurrent())return [];
                        if(!Array.isArray(next)||!next.length)break;
                        merged=mergeUnique(searchResults,next,'songs');
                        if(!merged.added)break;
                        searchResults=merged.items;
                        setSearchContext(searchResults);
                        searchPage=nextPage;
                        meta=next.searchMeta||OnlineMusic.getSearchMeta()||meta;
                        paintSearchResults(q,Number(meta.total)||searchResults.length,Boolean(meta.hasMore));
                    }
                }
                return searchResults;
            }
            const result=await OnlineMusic.searchEntities(searchType,q,{page,limit:30});
            if(!isCurrent())return [];
            const merged=mergeUnique(append?entityResults:[],result.items||[],searchType);
            entityResults=merged.items;
            searchPage=page;
            paintSearchResults(q,Number(result.total)||entityResults.length,Boolean(result.hasMore));
            const expansions=!append?getEntitySearchExpansions(q,searchType):[];
            if(expansions.length){
                Promise.allSettled(expansions.map(term=>OnlineMusic.searchEntities(searchType,term,{page:0,limit:20}))).then(results=>{
                    if(!isCurrent()||searchType==='songs'||(String(input?.value||'').trim()&&String(input.value).trim().toLowerCase()!==q.toLowerCase()))return;
                    const expanded=results.flatMap(item=>item.status==='fulfilled'?(item.value.items||[]):[]);
                    const enriched=mergeUnique(entityResults,expanded,searchType);
                    if(enriched.added){entityResults=enriched.items;paintSearchResults(q,Math.max(Number(result.total)||0,entityResults.length),Boolean(result.hasMore));}
                }).catch(()=>{});
            }
            return entityResults;
        }catch(error){
            if(!isCurrent())return [];
            target.classList.remove('is-refreshing');target.removeAttribute('aria-busy');
            const offline=!navigator.onLine;
            target.innerHTML=`<div class="online-network-state"><span class="material-symbols-rounded">${offline?'wifi_off':'cloud_off'}</span><div class="empty-title">${offline?'You’re offline':'Streaming search is temporarily unavailable'}</div><p class="online-network-description">${offline?'Reconnect to search the streaming catalogue. Your local music remains available.':'The streaming service did not return usable results. This may be a temporary service or network issue; try again in a moment.'}</p><div class="online-network-actions"><button class="btn" data-action="retry-online-search">Retry</button><button class="btn" data-action="toggle-playback-mode">Offline library</button></div></div>`;
            return [];
        }
    };
    const attachSearchInfiniteScroll = target => {
        searchMoreObserver?.disconnect();searchMoreObserver=null;
        if(!target||!('IntersectionObserver' in window))return;
        const sentinel=target.querySelector('.online-load-more-wrap');if(!sentinel)return;
        searchMoreObserver=new IntersectionObserver(entries=>{
            if(!entries.some(entry=>entry.isIntersecting)||isLoadingMore||State.playbackSourceMode!=='online')return;
            const button=sentinel.querySelector('[data-action="online-load-more"]');
            if(button&&!button.disabled){button.dataset.autoLoading='1';loadMore();}
        },{root:null,rootMargin:'280px 0px',threshold:0});
        searchMoreObserver.observe(sentinel);
    };
    const loadMore = async () => {
        const q=searchQuery||document.getElementById('online-search-input')?.value||'';
        const available=searchType==='songs'||searchType==='all'?searchResults:entityResults;
        if(!q||isLoadingMore)return [];
        isLoadingMore=true;
        const button=document.querySelector('#online-search-results [data-action="online-load-more"]');if(button){button.disabled=true;button.textContent='Loading…';}
        try {
            if(available.length>visibleSearchCount){
                visibleSearchCount=Math.min(available.length,visibleSearchCount+8);
                paintSearchResults(q,available.length,searchHasMore);
                return available;
            }
            visibleSearchCount+=8;
            return await performSearch(q,true);
        } finally { isLoadingMore=false; attachSearchInfiniteScroll(document.getElementById('online-search-results')); }
    };
    const HOME_TTL = 45 * 60 * 1000;
    const HOME_CACHE_VERSION = 7;
    const HOME_DEFS = [
        {key:'quick',kind:'quick',node:'online-shelf-quick',derived:true,stage:1},
        {key:'suggested',kind:'songs',query:'',node:'online-shelf-suggested',layout:'list',stage:1},
        {key:'romantic',kind:'playlists',query:'Hindi romantic playlists',node:'online-shelf-romantic',stage:1},
        {key:'trending',kind:'songs',query:'trending songs 2026',node:'online-shelf-trending',stage:1},
        {key:'latest',kind:'songs',query:'latest new songs 2026',queries:['latest new songs 2026','new Hindi songs 2026'],node:'online-shelf-latest',stage:1},
        {key:'artists',kind:'wall',node:'online-home-artists-mosaic',wrap:'online-shelf-artists-wrap',stage:2},
        {key:'hits',kind:'songs',query:'Hindi hits',node:'online-shelf-hits',stage:2},
        {key:'englishHits',kind:'songs',query:'English hits',queries:['English hits'],node:'online-shelf-english-hits',stage:2},
        {key:'englishHitAlbums',kind:'albums',query:'English hit albums',queries:['English hit albums'],node:'online-shelf-english-hit-albums',stage:2},
        {key:'englishPlaylists',kind:'playlists',query:'English hits playlists',queries:['English hits playlists'],node:'online-shelf-english-playlists',stage:2},
        {key:'forYouArtists',kind:'artists',query:'',node:'online-shelf-for-you-artists',stage:2},
        {key:'punjabi',kind:'playlists',query:'Punjabi love songs',node:'online-shelf-punjabi',stage:3},
        {key:'albums',kind:'albums',query:'Hindi film albums',node:'online-shelf-albums',stage:3}
    ];
    const safeEntity = item => ({id:String(item.id||''),sourceId:String(item.sourceId||''),type:String(item.type||''),title:String(item.title||''),artist:String(item.artist||''),image:String(item.image||''),description:String(item.description||''),year:String(item.year||''),language:String(item.language||''),songCount:Number(item.songCount||0),playCount:Number(item.playCount||0)});
    const cacheHomeShelves = () => { try { localStorage.setItem(KEYS.shelves,JSON.stringify({version:HOME_CACHE_VERSION,savedAt:Date.now(),shelves:Object.fromEntries(Object.entries(homeShelves).map(([key,val])=>[key,{kind:val.kind,items:(val.items||[]).map(item=>val.kind==='songs'?serializeTrack(item):safeEntity(item))}]))})); } catch (_) {} };
    const restoreHomeShelves = () => {
        const stored=safeRead(KEYS.shelves,null);if(!stored?.shelves)return false;
        const stale=stored.version!==HOME_CACHE_VERSION;
        homeShelves={};
        for(const [key,value] of Object.entries(stored.shelves)){
            if(stale&&['latest','quick','suggested'].includes(key))continue;
            const restored=(value.items||[]).map(item=>value.kind==='songs'?restoreTrack(item):item).filter(Boolean);homeShelves[key]={kind:value.kind,items:value.kind==='songs'?dedupeCatalogueTracks(restored):restored};
        }
        homeLastLoaded=stale?0:(Number(stored.savedAt)||0);return true;
    };
    const menuButton = t => `<button type="button" class="icon-btn online-card-menu" data-action="track-options" data-id="${esc(t.id)}" aria-label="More actions for ${esc(t.title)}" title="More actions"><span class="material-symbols-rounded">more_vert</span></button>`;
    const compactRow = (t, context, menu) => `<div class="online-compact-row" role="button" tabindex="0" data-action="online-play-track" data-id="${esc(t.id)}" data-context="${esc(context)}"><img width="48" height="48" loading="lazy" decoding="async" src="${esc(t.artworkUrl||'')||'./icons/icon-192.png'}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-compact-meta"><span class="online-compact-artist">${esc(t.artist||'')}</span><span class="online-compact-title">${esc(t.title)}</span></span>${menu?menuButton(t):''}</div>`;
    const renderCompactRows = (tracks, context, menu=true, limit=8) => {
        const items=(tracks||[]).filter(Boolean);
        shelfContexts.set(context,items);
        return items.slice(0,limit).map(t=>compactRow(t,context,menu)).join('');
    };
    const renderQuickPicks = (tracks, context) => {
        const items=(tracks||[]).filter(Boolean).slice(0,16);
        shelfContexts.set(context,items);
        const columns=[];
        for(let i=0;i<items.length;i+=4)columns.push(items.slice(i,i+4));
        return columns.map(col=>`<div class="online-quick-col">${col.map(t=>compactRow(t,context,false)).join('')}</div>`).join('');
    };
    const renderTrackCards = (tracks, context, emptyText='') => {
        const items=(tracks||[]).filter(Boolean).slice(0,24);
        if(!items.length)return emptyText?`<div class="online-empty-inline">${esc(emptyText)}</div>`:'';
        shelfContexts.set(context,items);
        return items.map(t=>`<div class="online-media-card is-song" role="button" tabindex="0" data-action="online-play-track" data-id="${esc(t.id)}" data-context="${esc(context)}"><span class="online-media-art"><img width="180" height="180" loading="lazy" decoding="async" src="${esc(t.artworkMediumUrl||t.artworkUrl||'')||'./icons/icon-192.png'}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-card-play material-symbols-rounded">play_arrow</span></span><span class="online-media-info"><span class="online-media-text"><span class="online-media-artist">${esc(t.artist||'')}</span><span class="online-media-title">${esc(t.title)}</span></span>${menuButton(t)}</span></div>`).join('');
    };
    const renderEntityGrid = (items, kind, emptyText='') => {
        if(!items?.length)return emptyText?`<div class="online-empty-inline">${esc(emptyText)}</div>`:'';
        if(kind==='artists')return `<div class="online-entity-grid online-artist-grid">${items.map(item=>{
            const title=item.title||item.name||'Artist';
            const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
            const image=item.image&&!OnlineMusic.isGenericArtistArtwork?.(item.image)?item.image:'';
            const id=item.sourceId||String(item.id||'').split(':').slice(1).join(':');
            return `<button class="online-entity-card is-artist" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}"><span class="online-entity-art online-artist-grid-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials||'♪')}</span>${image?`<img width="280" height="280" loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-entity-art').classList.add('has-no-art')">`:''}</span><span class="online-entity-title">${esc(title)}</span></button>`;
        }).join('')}</div>`;
        return `<div class="online-entity-grid">${items.map(item=>`<button class="online-entity-card" data-action="online-open-entity" data-type="${esc(kind)}" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}"><span class="online-entity-art"><img width="280" height="280" loading="lazy" decoding="async" src="${esc(item.image||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"></span><span class="online-entity-title">${esc(item.title||item.name||'Untitled')}</span><span class="online-entity-subtitle">${esc(item.artist||item.description||((item.songCount||item.total)?`${item.songCount||item.total} songs`:''))}</span></button>`).join('')}</div>`;
    };
    const renderEntityRail = (items, kind) => {
        const list=(items||[]).filter(Boolean).slice(0,40);if(!list.length)return '';
        if(kind==='artists')return `${list.map(item=>{const title=item.title||'Artist';const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();const image=item.image&&!OnlineMusic.isGenericArtistArtwork?.(item.image)?item.image:'';return `<button class="online-artist-card" data-action="online-open-entity" data-type="artists" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}" aria-label="Open artist ${esc(title)}"><span class="online-artist-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials||'♪')}</span>${image?`<img width="280" height="280" loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.closest('.online-artist-orb').classList.add('has-no-art');this.remove()">`:''}</span><span class="online-artist-name">${esc(title)}</span></button>`;}).join('')}`;
        return `${list.map(item=>`<button class="online-media-card" data-action="online-open-entity" data-type="${esc(kind)}" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}"><span class="online-media-art"><img width="280" height="280" loading="lazy" decoding="async" src="${esc(item.image||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"></span><span class="online-media-title">${esc(item.title||'Untitled')}</span><span class="online-media-subtitle">${esc(item.description||((item.songCount||item.total)?`${item.songCount||item.total} songs`:''))}</span></button>`).join('')}`;
    };
    const renderUserPlaylistCards = list => {
        const items=(list||[]).filter(Boolean);
        const likedCard=`<article class="online-user-playlist-card"><button class="online-media-card" data-action="online-open-liked-from-home"><span class="online-media-art online-liked-home-art"><span class="material-symbols-rounded">favorite</span></span><span class="online-media-title">Liked Songs</span><span class="online-media-subtitle">${onlineFavorites.length} tracks</span></button></article>`;
        const cards=items.map(playlist=>{
            const cover=playlist.tracks?.[0]||null;
            return `<article class="online-user-playlist-card"><button class="online-media-card" data-action="online-open-playlist" data-id="${esc(playlist.id)}"><span class="online-media-art"><img width="240" height="240" loading="lazy" decoding="async" src="${esc(cover?.artworkUrl||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-card-play material-symbols-rounded">play_arrow</span></span><span class="online-media-title">${esc(playlist.name)}</span><span class="online-media-subtitle">${Number(playlist.tracks?.length)||0} songs</span></button></article>`;
        }).join('');
        return likedCard+cards;
    };
    const renderShelfItem = (definition, items) => {
        const wrap=document.getElementById(definition.wrap||`${definition.node}-wrap`);
        const node=document.getElementById(definition.node);
        if(!node)return;
        let list=(items||[]).filter(Boolean);
        if(definition.key==='quick')list=quickPickTracks();
        if(definition.key==='suggested')list=(suggestState.items&&suggestState.items.length?suggestState.items:list);
        if(definition.key==='artists'){if(!list.length&&artistCatalogue.length)list=artistCatalogue.slice();list=rankArtistItems(list,'recommended');}
        if(definition.key==='forYouArtists'){
            const played=artistCatalogue.filter(item=>(artistStatFor(item)?.plays||0)>0);
            list=rankArtistItems(played,'popular').slice(0,14);
        }
        if(wrap)wrap.hidden=!list.length;
        const signature=`${definition.key}|${list.slice(0,40).map(item=>item.id||item.sourceId||'').join(',')}`;
        if(definition.kind!=='wall'){
            if(node.dataset.signature===signature&&node.childElementCount)return;
            node.dataset.signature=signature;
        }
        if(definition.key==='quick')node.innerHTML=renderQuickPicks(list,'home:quick');
        else if(definition.kind==='wall')renderArtistMosaic(list,definition.node);
        else if(definition.layout==='list')node.innerHTML=renderCompactRows(list,`home:${definition.key}`,true,8);
        else if(definition.kind==='songs')node.innerHTML=renderTrackCards(list,`home:${definition.key}`);
        else node.innerHTML=renderEntityRail(list,definition.kind);
        UI.lazyLoadArtwork();
    };
    const collectTrackPages = async query => {
        if(!navigator.onLine||State.playbackSourceMode!=='online')return [];
        const queries=(Array.isArray(query)?query:[query]).map(value=>String(value||'').trim()).filter(Boolean).slice(0,2);
        if(!queries.length)return [];
        let merged=[];
        try {
            for(const term of queries){
                const page=await OnlineMusic.search(term,{page:0,limit:24,background:true}).catch(()=>[]);
                merged=dedupeCatalogueTracks([...merged,...Array.from(page||[])]);
                if(merged.length>=8)break;
            }
            return merged.slice(0,24);
        } catch (_) { return merged.slice(0,24); }
    };
    const collectEntityPages = async (kind,query) => {
        if(!navigator.onLine||State.playbackSourceMode!=='online')return [];
        const queries=(Array.isArray(query)?query:[query]).map(value=>String(value||'').trim()).filter(Boolean).slice(0,2);
        if(!queries.length)return [];
        try {
            const seenIds=new Set(),seenNames=new Set(),merged=[];
            for(const term of queries){
                const result=await OnlineMusic.searchEntities(kind,term,{page:0,limit:20}).catch(()=>({items:[]}));
                for(const item of result.items||[]){
                    const id=String(item.sourceId||item.id||'');
                    const name=String(item.title||'').toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
                    if(!id||seenIds.has(id)||!name||seenNames.has(name))continue;
                    seenIds.add(id);seenNames.add(name);merged.push(item);
                }
                if(merged.length>=8)break;
            }
            return merged.slice(0,30);
        } catch (_) { return []; }
    };
    const getHomeArtistQueries = limit => {
        const names = [];
        const add = value => {
            const name = String(value || '').trim();
            const key = titleKey(name);
            if (key && !names.some(existing => titleKey(existing) === key)) names.push(name);
        };
        for (const item of [...onlineHistory, ...onlineFavorites].slice(0, 18)) {
            const artist = String(item?.artist || '').split(/,|&|\bfeat(?:uring)?\.?\b|\bft\.?\b/i)[0].trim();
            if (artist) add(artist);
            if (names.length >= limit) break;
        }
        for (const item of topArtistSeeds(limit)) { add(item.name); if (names.length >= limit) break; }
        return names.slice(0, limit);
    };
    const hasRealArtistImage = item => Boolean(item?.image && !OnlineMusic.isGenericArtistArtwork?.(item.image));
    const isNonArtistRawType = item => {
        const kind=String(item?.raw?.type||item?.raw?.resultType||item?.raw?.entityType||'').toLowerCase().trim().replace(/[_\s]+/g,'-');
        return new Set(['song','songs','track','tracks','album','albums','playlist','playlists','podcast','podcasts','episode','episodes','channel','channels','label','labels','video','videos','radio','station','stations']).has(kind);
    };
    const findArtistMatch = (items, query) => {
        const q=titleKey(query),qt=q.split(' ').filter(Boolean);
        const ranked=(items||[]).filter(item=>item?.sourceId&&item.title&&!isNonArtistRawType(item)).map(item=>{
            const title=titleKey(item.title),tokens=title.split(' ').filter(Boolean);
            const overlap=qt.filter(token=>tokens.includes(token)).length;
            const exact=title===q;
            const starts=title.startsWith(q+' ')||title.startsWith(q+' -');
            const containsAll=qt.length>0&&overlap===qt.length;
            const score=exact?100:starts?35:containsAll?20:0;
            const generic=/\b(?:singers? rights|top singers|popular singers|singer collection|artist collection|various artists|music label|music channel|official audio|songs collection|hits playlist)\b/i.test(item.title);
            return {item,score:generic?-1:score};
        }).filter(row=>row.score>=20).sort((a,b)=>(hasRealArtistImage(b.item)?1:0)-(hasRealArtistImage(a.item)?1:0)||b.score-a.score);
        return ranked[0]?.item||null;
    };
    const uniqueArtistItems = items => {
        const out=[], seenIds=new Set(), seenNames=new Set();
        for(const item of Array.isArray(items)?items:[]) {
            if(!item) continue;
            const title=String(item.title||item.name||'').trim();
            const id=String(item.sourceId||String(item.id||'').replace(/^artists:/,'' )).trim();
            const name=titleKey(title);
            if(!title||!name||!id||seenIds.has(id)||seenNames.has(name)) continue;
            seenIds.add(id); seenNames.add(name); out.push(item);
        }
        return out;
    };
    const artistStatFor = item => artistStats[titleKey(item?.title||item?.name||'')] || (item?.sourceId?artistStats[`id:${item.sourceId}`]:null) || null;
    const rankArtistItems = (items, mode=artistSortMode) => {
        const list=uniqueArtistItems(items);
        const stats=item=>artistStatFor(item)||{plays:0,lastPlayedAt:0};
        if(mode==='alpha')return list.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
        if(mode==='recent')return list.sort((a,b)=>(stats(b).lastPlayedAt||0)-(stats(a).lastPlayedAt||0)||Number(hasRealArtistImage(b))-Number(hasRealArtistImage(a))||String(a.title||'').localeCompare(String(b.title||'')));
        if(mode==='popular')return list.sort((a,b)=>(stats(b).plays||0)-(stats(a).plays||0)||(stats(b).lastPlayedAt||0)-(stats(a).lastPlayedAt||0)||Number(hasRealArtistImage(b))-Number(hasRealArtistImage(a)));
        const score=item=>{const st=stats(item),days=st.lastPlayedAt?Math.max(0,(Date.now()-st.lastPlayedAt)/86400000):999;return (st.plays||0)*5+(days<3?24:days<14?12:days<45?5:0)+(hasRealArtistImage(item)?1:0);};
        return list.sort((a,b)=>score(b)-score(a)||String(a.title||'').localeCompare(String(b.title||'')));
    };
    const restoreArtistCatalogue = () => {
        if(artistCatalogue.length)return artistCatalogue;
        const cached=safeRead(KEYS.artistCatalogue,null);
        if(cached?.items?.length){artistCatalogue=uniqueArtistItems(cached.items.filter(item=>item?.sourceId&&item?.title)).slice(0,40);return artistCatalogue;}
        const shelves=safeRead(KEYS.shelves,null)?.shelves;
        const partial=shelves?.artists?.items||[];
        if(partial.length)artistCatalogue=uniqueArtistItems(partial.filter(item=>item?.sourceId&&item?.title));
        return artistCatalogue;
    };
    const saveArtistCatalogue = () => { try{localStorage.setItem(KEYS.artistCatalogue,JSON.stringify({savedAt:Date.now(),items:artistCatalogue.map(safeEntity)}));}catch(_){} };
    const collectHomeArtists = (onProgress=null, targetCount=12) => {
        targetCount=Math.min(40,Math.max(8,Number(targetCount)||12));
        if(artistCatalogue.length>=targetCount){const ranked=rankArtistItems(artistCatalogue).slice(0,targetCount);onProgress?.(ranked);return Promise.resolve(ranked);}
        if(artistCataloguePromise)return artistCataloguePromise.then(items=>{
            onProgress?.(items);
            return items.length>=targetCount ? items.slice(0,targetCount) : collectHomeArtists(onProgress,targetCount);
        });
        const cached=restoreArtistCatalogue();
        if(cached.length>=targetCount){const ranked=rankArtistItems(cached).slice(0,targetCount);onProgress?.(ranked);return Promise.resolve(ranked);}
        artistCataloguePromise=(async()=>{
            const selected=[...cached],seenIds=new Set(selected.map(item=>String(item.sourceId||item.id))),seenNames=new Set(selected.map(item=>titleKey(item.title)));
            const accept=(item,query)=>{
                if(selected.length>=targetCount||!item||!item.sourceId||!item.title||isNonArtistRawType(item)||/\b(?:playlist|mix|collection|compilation|singer rights|top singers|various artists|official audio|label channel|song collection|album collection|official video)\b/i.test(item.title))return;
                const matched=findArtistMatch([item],query)||((titleKey(item.title)===titleKey(query))?item:null);if(!matched)return;
                const id=String(item.sourceId||item.id),name=titleKey(item.title);if(!id||seenIds.has(id)||seenNames.has(name))return;
                seenIds.add(id);seenNames.add(name);selected.push({...item,image:hasRealArtistImage(item)?item.image:''});
            };
            const cachedNames=new Set(selected.map(item=>titleKey(item.title)));
            const queues=getHomeArtistQueries(Math.min(4, Math.max(0, targetCount-selected.length))).filter(q=>!cachedNames.has(titleKey(q)));
            for(let offset=0;offset<queues.length;offset+=2){
                if(!navigator.onLine||State.playbackSourceMode!=='online'||selected.length>=targetCount)break;
                const batch=queues.slice(offset,offset+2);
                const results=await Promise.all(batch.map(async query=>{
                    let items=[];try{const page=await OnlineMusic.searchEntities('artists',query,{page:0,limit:10});items=page.items||[];}catch(_){}
                    return {query,items};
                }));
                for(const result of results)accept(findArtistMatch(result.items,result.query),result.query);
                artistCatalogue=selected.slice();onProgress?.(rankArtistItems(artistCatalogue).slice(0,targetCount));
            }
            if(selected.length<Math.min(8,targetCount)&&!onlineHistory.length&&!onlineFavorites.length&&navigator.onLine&&State.playbackSourceMode==='online'){
                try{
                    const page=await OnlineMusic.searchEntities('artists','popular music artists',{page:0,limit:20});
                    for(const item of page.items||[]){
                        const title=String(item.title||'');if(!item?.sourceId||!title||isNonArtistRawType(item)||/\b(?:playlist|mix|collection|compilation|singer rights|various artists|official audio|song collection|album collection|official video)\b/i.test(title))continue;
                        const name=titleKey(title),id=String(item.sourceId);if(seenIds.has(id)||seenNames.has(name)||name.length<2)continue;
                        seenIds.add(id);seenNames.add(name);selected.push({...item,image:hasRealArtistImage(item)?item.image:''});
                        if(selected.length>=targetCount)break;
                    }
                }catch(_){}
                artistCatalogue=selected.slice();onProgress?.(rankArtistItems(artistCatalogue).slice(0,targetCount));
            }
            const missing=targetCount>=24?selected.filter(item=>!item.image).slice(0,Math.min(4,selected.length)):[];
            for(let offset=0;offset<missing.length;offset+=2){
                await Promise.all(missing.slice(offset,offset+2).map(async item=>{
                    try{const detail=await OnlineMusic.fetchArtistDetails(item.sourceId);if(detail?.image&&!OnlineMusic.isGenericArtistArtwork?.(detail.image)){item.image=detail.image;item.description=item.description||detail.description||'';}}catch(_){}
                }));
                artistCatalogue=selected.slice();onProgress?.(rankArtistItems(artistCatalogue).slice(0,targetCount));
            }
            artistCatalogue=selected.slice(0,40);saveArtistCatalogue();
            return rankArtistItems(artistCatalogue).slice(0,targetCount);
        })().finally(()=>{artistCataloguePromise=null;});
        return artistCataloguePromise;
    };
    const wallArtist = (item, cls) => {
        const title=String(item?.title||'Artist'),id=String(item?.sourceId||item?.id||'').replace(/^(?:saavn|machhar):/,'').replace(/^artists:/,''),image=hasRealArtistImage(item)?item.image:'';
        const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'♪';
        return `<button type="button" class="online-wall-artist ${cls}" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}" aria-label="Open ${esc(title)}" title="${esc(title)}"><span class="online-wall-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials)}</span>${image?`<img width="280" height="280" loading="lazy" decoding="async" draggable="false" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-wall-orb').classList.add('has-no-art')">`:''}<span class="online-wall-name">${esc(title)}</span></span></button>`;
    };
    const wallUnits = list => {
        const units=[];let i=0;
        while(i<list.length){
            units.push(`<div class="online-wall-unit is-big">${wallArtist(list[i++],'is-big')}</div>`);
            if(i<list.length){const group=list.slice(i,i+4);i+=group.length;units.push(`<div class="online-wall-unit is-grid">${group.map(item=>wallArtist(item,'is-small')).join('')}</div>`);}
            if(i<list.length)units.push(`<div class="online-wall-unit is-big">${wallArtist(list[i++],'is-big')}</div>`);
        }
        return units.join('');
    };
    const updateWallButtons = nodeId => {
        const node=document.getElementById(nodeId);if(!node)return;
        const atStart=node.scrollLeft<=4,atEnd=node.scrollLeft+node.clientWidth>=node.scrollWidth-4;
        document.querySelectorAll(`[data-action="online-shift-artist-wall"][data-target="${nodeId}"]`).forEach(button=>{
            const left=button.dataset.direction==='left';
            button.disabled=left?atStart:atEnd;
            button.setAttribute('aria-disabled',String(button.disabled));
        });
    };
    const bindWall = node => {
        if(node.dataset.wallBound==='1')return;
        node.dataset.wallBound='1';
        let frame=0;
        node.addEventListener('scroll',()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;updateWallButtons(node.id);});},{passive:true});
        let startX=0,startLeft=0,dragging=false,moved=false;
        node.addEventListener('pointerdown',event=>{
            if(event.pointerType!=='mouse'||event.button!==0)return;
            dragging=true;moved=false;startX=event.clientX;startLeft=node.scrollLeft;
        });
        window.addEventListener('pointermove',event=>{
            if(!dragging)return;
            const delta=event.clientX-startX;
            if(!moved&&Math.abs(delta)>6){moved=true;node.classList.add('is-dragging');}
            if(moved)node.scrollLeft=startLeft-delta;
        });
        window.addEventListener('pointerup',()=>{
            if(!dragging)return;
            dragging=false;
            if(moved)setTimeout(()=>{node.classList.remove('is-dragging');moved=false;},0);
        });
        node.addEventListener('click',event=>{if(moved){event.preventDefault();event.stopPropagation();}},true);
        node.addEventListener('keydown',event=>{
            if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();shiftHomeArtistWall(event.key==='ArrowRight'?'right':'left',node.id);}
        });
        window.addEventListener('resize',()=>updateWallButtons(node.id),{passive:true});
    };
    const renderArtistMosaic = (items,nodeId='online-artists-feature-mosaic') => {
        const node=document.getElementById(nodeId);if(!node)return;
        const unique=uniqueArtistItems(items);
        const list=[...unique.filter(hasRealArtistImage),...unique.filter(item=>!hasRealArtistImage(item))].slice(0,40);
        const signature=list.map(item=>String(item.sourceId||item.id)+(hasRealArtistImage(item)?'1':'0')).join('|');
        if(node.dataset.signature===signature&&node.childElementCount){updateWallButtons(nodeId);return;}
        const previous=node.scrollLeft;
        node.dataset.signature=signature;
        node.innerHTML=list.length?`<div class="online-wall-track">${wallUnits(list)}</div>`:'<div class="online-empty-inline">Artists will appear as the catalogue loads.</div>';
        node.scrollLeft=previous;
        bindWall(node);
        updateWallButtons(nodeId);
    };
    const shiftHomeArtistWall = (direction, targetId='online-home-artists-mosaic') => {
        const node=document.getElementById(targetId);if(!node)return;
        const unit=node.querySelector('.online-wall-unit');
        const step=Math.max(unit?unit.offsetWidth*1.5:0,node.clientWidth*.8,180);
        node.scrollBy({left:(direction==='left'?-1:1)*step,behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth'});
    };
    const renderArtistDirectory = () => {
        const node=document.getElementById('online-artists-directory');if(!node)return;
        const list=rankArtistItems(artistCatalogue,artistSortMode);
        const total=document.getElementById('online-artists-total');if(total)total.textContent=`${list.length} artists`;
        document.querySelectorAll('.online-artist-sort [data-sort]').forEach(button=>button.classList.toggle('active',button.dataset.sort===artistSortMode));
        node.innerHTML=list.length?`<div class="online-artist-directory-grid">${list.map(item=>{const title=item.title||'Artist',id=String(item.sourceId||item.id||'').replace(/^(?:saavn|machhar):/,''),image=hasRealArtistImage(item)?item.image:'',initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'♪',st=artistStatFor(item);return `<button class="online-artist-directory-card" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}"><span class="online-artist-directory-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials)}</span>${image?`<img width="280" height="280" loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-artist-directory-orb').classList.add('has-no-art')">`:''}</span><span class="online-artist-directory-name">${esc(title)}</span><span class="online-artist-directory-meta">${st?.plays?`${st.plays} plays`:st?.lastPlayedAt?'Played recently':'Artist'}</span></button>`;}).join('')}</div>`:'<div class="online-empty-inline">No artists have loaded yet. Check your connection and retry Home.</div>';
        renderArtistMosaic(list,'online-artists-feature-mosaic');UI.lazyLoadArtwork();
    };
    const renderArtistExplorer = async () => {
        if(artistCatalogue.length)renderArtistDirectory();
        try{await collectHomeArtists(items=>{artistCatalogue=items.slice();renderArtistDirectory();},40);}catch(_){}
        renderArtistDirectory();
    };
    const sortArtists = mode => {artistSortMode=['recommended','recent','popular','alpha'].includes(mode)?mode:'recommended';renderArtistDirectory();};
    const daypart = (date=new Date()) => {
        const hour=date.getHours();
        return hour>=5&&hour<12?'morning':hour>=12&&hour<17?'afternoon':hour>=17&&hour<21?'evening':'night';
    };
    const greetingText = () => ({morning:'Good morning',afternoon:'Good afternoon',evening:'Good evening',night:'Good night'})[daypart()];
    const updateGreeting = () => {
        const el=document.getElementById('online-greeting-text');if(!el)return;
        const text=greetingText();
        if(el.textContent!==text)el.textContent=text;
        el.classList.remove('hidden');
    };
    const dayKey = (date=new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const trimCounts = (map, keep) => {
        const keys=Object.keys(map);
        if(keys.length<=keep)return;
        keys.sort((a,b)=>map[b]-map[a]).slice(keep).forEach(key=>delete map[key]);
    };
    const persistTaste = () => {
        try{localStorage.setItem(KEYS.taste,JSON.stringify(taste));}catch(_){}
        try{localStorage.setItem(KEYS.trackPlays,JSON.stringify(trackPlays));}catch(_){}
    };
    const recordTaste = track => {
        const part=daypart(),language=String(track.language||'').toLowerCase().trim(),artist=artistKey(track.artist);
        taste.parts=taste.parts||{};
        const bucket=taste.parts[part]=taste.parts[part]||{langs:{},artists:{}};
        if(language&&language!=='unknown')bucket.langs[language]=(bucket.langs[language]||0)+1;
        if(artist)bucket.artists[artist]=(bucket.artists[artist]||0)+1;
        trimCounts(bucket.langs,8);trimCounts(bucket.artists,24);
        trackPlays[track.id]=(trackPlays[track.id]||0)+1;
        trimCounts(trackPlays,300);
        const today=dayKey();
        taste.days=taste.days||{};
        const day=taste.days[today]=taste.days[today]||{plays:0,seconds:0};
        day.plays+=1;day.seconds+=Number(track.duration)||0;
        Object.keys(taste.days).sort().slice(0,-60).forEach(key=>delete taste.days[key]);
        taste.total=taste.total||{plays:0,seconds:0};
        taste.total.plays+=1;taste.total.seconds+=Number(track.duration)||0;
        persistTaste();
    };
    const fingerprint = track => `${titleKey(track?.title)}|${artistKey(track?.artist)}`;
    const topArtistSeeds = limit => {
        const bucket=taste.parts?.[daypart()]?.artists||{};
        const rows=Object.entries(artistStats).filter(([key,value])=>!key.startsWith('id:')&&value?.name).map(([key,value])=>{
            const days=value.lastPlayedAt?Math.max(0,(Date.now()-value.lastPlayedAt)/86400000):999;
            const score=(value.plays||0)*3+(days<2?18:days<7?9:days<30?3:0)+(bucket[artistKey(value.name)]||0)*2;
            return {name:value.name,key:artistKey(value.name),score};
        }).filter(row=>row.key&&row.key!=='unknown artist'&&row.score>0);
        return rows.sort((a,b)=>b.score-a.score).slice(0,limit);
    };
    const quickPickTracks = () => {
        const part=daypart(),bucket=taste.parts?.[part]||{langs:{},artists:{}};
        const history=onlineHistory.map(trackById).filter(Boolean);
        const favorites=onlineFavorites.map(trackById).filter(Boolean);
        const favoriteIds=new Set(favorites.map(track=>track.id));
        const historyIndex=new Map(history.map((track,index)=>[track.id,index]));
        const pool=new Map();
        const add=track=>{if(track?.id&&!pool.has(track.id))pool.set(track.id,track);};
        (homeShelves.quick?.items||[]).forEach(add);
        const shownSuggested=new Set((suggestState.items||[]).slice(0,8).map(track=>track.id));
        (suggestState.items||[]).slice(8).forEach(add);
        shownSuggested.forEach(id=>{if(!historyIndex.has(id)&&!favoriteIds.has(id))pool.delete(id);});
        const score=track=>{
            let value=0;
            value+=Math.min(trackPlays[track.id]||0,12)*3;
            if(historyIndex.has(track.id))value+=Math.max(0,24-historyIndex.get(track.id))*.9;
            if(favoriteIds.has(track.id))value+=7;
            const stat=artistStatFor({title:String(track.artist||'').split(/,|&/)[0].trim()});
            if(stat)value+=Math.min(stat.plays||0,25)*.8+((Date.now()-(stat.lastPlayedAt||0))<604800000?4:0);
            value+=Math.min(bucket.artists[artistKey(track.artist)]||0,10)*1.2;
            const language=languageFamily(track);
            if(language&&bucket.langs[language])value+=Math.min(bucket.langs[language],12)*.5;
            if(!historyIndex.has(track.id)&&!favoriteIds.has(track.id))value-=2;
            return value;
        };
        const ranked=[...pool.values()].map(track=>({track,value:score(track)})).sort((a,b)=>b.value-a.value);
        const perArtist=new Map(),prints=new Set(),out=[];
        for(const row of ranked){
            const artist=artistKey(row.track.artist),print=fingerprint(row.track);
            if(prints.has(print)||(perArtist.get(artist)||0)>=2)continue;
            prints.add(print);perArtist.set(artist,(perArtist.get(artist)||0)+1);out.push(row.track);
            if(out.length>=12)break;
        }
        return out;
    };
    const languageFamily = track => {
        const raw = [track?.language,track?.raw?.language,track?.raw?.more_info?.language,track?.raw?.songLanguage].filter(Boolean).join(' ').toLowerCase().trim();
        if (/\b(english|eng|en|en-us|en-gb|international)\b/.test(raw)) return 'english';
        if (/\b(hindi|hin|hi|bollywood)\b/.test(raw)) return 'hindi';
        if (/\b(punjabi|panjabi|pun|pa)\b/.test(raw)) return 'punjabi';
        if (/\b(spanish|español|spa)\b/.test(raw)) return 'spanish';
        if (/\b(korean|kor|k-pop)\b/.test(raw)) return 'korean';
        const title = String(track?.title || '');
        if (/[\u0A00-\u0A7F]/.test(title)) return 'punjabi';
        if (/[\u0900-\u097F]/.test(title)) return 'hindi';
        return 'unknown';
    };
    const getLanguagePreference = () => {
        const scores={english:0,hindi:0,punjabi:0,spanish:0,korean:0};
        const history=onlineHistory.map(trackById).filter(Boolean).slice(0,80);
        history.forEach((track,index)=>{
            const family=languageFamily(track); if (!Object.prototype.hasOwnProperty.call(scores,family)) return;
            const recency=Math.exp(-index/24);
            const repeats=Math.min(2.6,1+Math.log1p(Number(trackPlays[track.id]||0))*.38);
            scores[family]+=recency*repeats;
        });
        for (const bucket of Object.values(taste.parts||{})) {
            for (const [language,count] of Object.entries(bucket?.langs||{})) {
                const family=languageFamily({language});
                if (Object.prototype.hasOwnProperty.call(scores,family)) scores[family]+=Math.min(35,Number(count)||0)*.075;
            }
        }
        const ranked=Object.entries(scores).sort((a,b)=>b[1]-a[1]);
        const total=ranked.reduce((sum,row)=>sum+row[1],0);
        const [leader,runner]=ranked;
        return {language:total>0&&leader[1]>=Math.max(2.4,runner[1]*1.18)&&leader[1]/total>=.39?leader[0]:'balanced',scores,total};
    };
    const languageShelfOrder = () => {
        const preferred=getLanguagePreference().language;
        const orders={
            english:['online-shelf-english-playlists-wrap','online-shelf-english-hits-wrap','online-shelf-english-hit-albums-wrap','online-shelf-trending-wrap','online-shelf-latest-wrap','online-shelf-romantic-wrap','online-shelf-punjabi-wrap','online-shelf-hits-wrap','online-shelf-albums-wrap','online-shelf-radio-wrap','online-shelf-artists-wrap','online-shelf-for-you-artists-wrap','online-shelf-recent-artists-wrap','online-shelf-popular-artists-wrap','online-shelf-recent-wrap'],
            hindi:['online-shelf-romantic-wrap','online-shelf-hits-wrap','online-shelf-trending-wrap','online-shelf-latest-wrap','online-shelf-punjabi-wrap','online-shelf-english-playlists-wrap','online-shelf-english-hits-wrap','online-shelf-english-hit-albums-wrap','online-shelf-albums-wrap','online-shelf-radio-wrap','online-shelf-artists-wrap','online-shelf-for-you-artists-wrap','online-shelf-recent-artists-wrap','online-shelf-popular-artists-wrap','online-shelf-recent-wrap'],
            punjabi:['online-shelf-punjabi-wrap','online-shelf-romantic-wrap','online-shelf-hits-wrap','online-shelf-trending-wrap','online-shelf-latest-wrap','online-shelf-english-playlists-wrap','online-shelf-english-hits-wrap','online-shelf-english-hit-albums-wrap','online-shelf-albums-wrap','online-shelf-radio-wrap','online-shelf-artists-wrap','online-shelf-for-you-artists-wrap','online-shelf-recent-artists-wrap','online-shelf-popular-artists-wrap','online-shelf-recent-wrap'],
            balanced:['online-shelf-romantic-wrap','online-shelf-trending-wrap','online-shelf-latest-wrap','online-shelf-hits-wrap','online-shelf-english-hits-wrap','online-shelf-english-playlists-wrap','online-shelf-english-hit-albums-wrap','online-shelf-punjabi-wrap','online-shelf-albums-wrap','online-shelf-radio-wrap','online-shelf-artists-wrap','online-shelf-for-you-artists-wrap','online-shelf-recent-artists-wrap','online-shelf-popular-artists-wrap','online-shelf-recent-wrap']
        };
        return {preferred,ids:orders[preferred]||orders.balanced};
    };
    const arrangePersonalizedHomeShelves = () => {
        const home=document.getElementById('view-online-home'); if(!home)return;
        const footer=home.querySelector('.online-brand-footer');
        const profile=languageShelfOrder();
        const top=['online-shelf-quick-wrap','online-shelf-suggested-wrap','online-shelf-collections-wrap'];
        for(const id of [...top,...profile.ids]) {
            const section=document.getElementById(id);
            if(section&&section.parentElement===home)home.insertBefore(section,footer||null);
        }
        home.dataset.recommendationLanguage=profile.preferred;
    };
    const SUGGEST_TTL = 6*60*60*1000;
    const DAYPART_QUERIES = {
        balanced:{morning:['Hindi morning songs','soft Hindi acoustic songs'],afternoon:['Hindi hits','Punjabi hits'],evening:['Hindi romantic songs','Bollywood love songs'],night:['Hindi lofi songs','late night Hindi songs']},
        english:{morning:['English acoustic pop','soft English songs'],afternoon:['popular English hits','global pop hits'],evening:['romantic English songs','English love songs'],night:['English chill pop','late night English songs']},
        hindi:{morning:['Hindi morning songs','soft Hindi acoustic songs'],afternoon:['Hindi hits','Bollywood hits'],evening:['Hindi romantic songs','Bollywood love songs'],night:['Hindi lofi songs','late night Hindi songs']},
        punjabi:{morning:['soft Punjabi songs','Punjabi acoustic songs'],afternoon:['Punjabi hits','Punjabi pop hits'],evening:['Punjabi romantic songs','Punjabi love songs'],night:['Punjabi lofi songs','late night Punjabi songs']}
    };
    const suggestionSeeds = () => {
        const seeds=[],seen=new Set();
        for(const track of onlineHistory.map(trackById).filter(Boolean)){
            const key=artistKey(track.artist);
            if(!key||seen.has(key))continue;
            seen.add(key);seeds.push({track,key});
            if(seeds.length>=1)break;
        }
        for(const artist of topArtistSeeds(4)){
            if(seen.has(artist.key))continue;
            seen.add(artist.key);seeds.push({name:artist.name,key:artist.key});
            if(seeds.length>=2)break;
        }
        return seeds;
    };
    const suggestionSignature = seeds => `render-v2|${getLanguagePreference().language}|${daypart()}|${seeds.map(seed=>seed.track?seed.track.id:`a:${seed.key}`).join(',')}`;
    const buildSuggestions = async seeds => {
        const played=new Set(),prints=new Set();
        onlineHistory.slice(0,60).forEach(track=>{played.add(track.id);prints.add(fingerprint(track));});
        onlineFavorites.forEach(track=>{played.add(track.id);prints.add(fingerprint(track));});
        const preferred=getLanguagePreference().language;
        const querySet=DAYPART_QUERIES[preferred]||DAYPART_QUERIES.balanced;
        const queries=(querySet[daypart()]||DAYPART_QUERIES.balanced[daypart()]).slice(0,1);
        const lists=await Promise.all(seeds.map(async seed=>{
            try{
                if(seed.track && OnlineMusic.fetchSuggestions) return await OnlineMusic.fetchSuggestions(seed.track);
                const found=await OnlineMusic.searchSongsFast(`${seed.name} songs`);
                return found.filter(track=>{const key=artistKey(track.artist);return key&&(key.includes(seed.key)||seed.key.includes(key));});
            }catch(_){return [];}
        }));
        const merge=sources=>{
            const out=[],ids=new Set(),seenPrints=new Set(prints);
            for(let i=0;out.length<16&&sources.some(list=>i<list.length);i++){
                for(const list of sources){
                    const track=list[i];
                    if(!track?.id||ids.has(track.id)||played.has(track.id))continue;
                    const print=fingerprint(track);
                    if(seenPrints.has(print))continue;
                    ids.add(track.id);seenPrints.add(print);out.push(track);
                    if(out.length>=16)break;
                }
            }
            return out;
        };
        let items=merge(lists);
        if(items.length<8){
            const extra=await Promise.all(queries.map(async query=>{try{return await OnlineMusic.searchSongsFast(query);}catch(_){return [];}}));
            items=merge([items,...extra]);
        }
        return items;
    };
    const persistSuggest = () => {
        try{localStorage.setItem(KEYS.suggest,JSON.stringify({sig:suggestState.sig,savedAt:suggestState.savedAt,items:suggestState.items.map(serializeTrack)}));}catch(_){}
    };
    const restoreSuggest = () => {
        const stored=safeRead(KEYS.suggest,null);
        if(!stored||!Array.isArray(stored.items)||!String(stored.sig||'').startsWith('render-v2|'))return;
        suggestState={sig:String(stored.sig||''),savedAt:Number(stored.savedAt)||0,items:hydrate(stored.items),loading:''};
    };
    const updateSuggestNote = seeds => {
        const note=document.getElementById('online-suggest-note');if(!note)return;
        const first=seeds?.[0];
        note.textContent=first?.track?`Because you played ${first.track.title}`:first?.name?`Based on your ${first.name} listening`:`Picked for this ${daypart()}`;
    };
    let quickPicksPromise = null;
    const QUICK_PICKS_TTL = 30 * 60 * 1000;
    const refreshQuickPicks = async (force=false) => {
        if (State.playbackSourceMode !== 'online' || !navigator.onLine) return homeShelves.quick?.items || [];
        const cached = homeShelves.quick?.items || [];
        if (!force && homeShelves.quick && Date.now() - (homeShelves.quick?.savedAt || homeLastLoaded || 0) < QUICK_PICKS_TTL) return cached;
        if (quickPicksPromise) return quickPicksPromise;
        quickPicksPromise = (async () => {
            try {
                const items = dedupeCatalogueTracks(await OnlineMusic.fetchQuickPicks());
                homeShelves.quick = { kind: 'songs', items: items.slice(0, 40), savedAt: Date.now(), source: 'render' };
                cacheHomeShelves();
                if (State.playbackSourceMode === 'online') renderShelfItem(HOME_DEFS[0], []);
                return homeShelves.quick.items;
            } catch (error) {
                console.warn('[Mujic] Render Quick Picks unavailable; retaining cached/local picks.', error);
                homeShelves.quick = { kind: 'songs', items: cached.slice(0, 40), savedAt: Date.now(), source: homeShelves.quick?.source || 'render-miss' };
                cacheHomeShelves();
                return cached;
            } finally { quickPicksPromise = null; }
        })();
        return quickPicksPromise;
    };
    const refreshSuggestions = async (force=false) => {
        if(State.playbackSourceMode!=='online'||!navigator.onLine)return suggestState.items;
        const seeds=suggestionSeeds(),sig=suggestionSignature(seeds);
        updateSuggestNote(seeds);
        const fresh=sig===suggestState.sig&&Date.now()-suggestState.savedAt<SUGGEST_TTL;
        if(!force&&fresh)return suggestState.items;
        if(suggestState.loading===sig)return suggestState.items;
        suggestState.loading=sig;
        try{
            const items=await buildSuggestions(seeds);
            suggestState={sig,items,savedAt:Date.now(),loading:''};
            persistSuggest();
            if(items.length){
                homeShelves.suggested={kind:'songs',items};
                const def=HOME_DEFS.find(item=>item.key==='suggested');
                if(def&&State.playbackSourceMode==='online')renderShelfItem(def,items);
                renderShelfItem(HOME_DEFS[0],[]);
            }
        }catch(_){}
        suggestState.loading='';
        return suggestState.items;
    };
    const schedulePersonal = () => {
        clearTimeout(personalTimer);
        personalTimer=setTimeout(()=>{
            if(State.playbackSourceMode!=='online')return;
            renderHomePersonal();
            refreshSuggestions(false);
        },900);
    };
    const loadHomeArtistShelves = async () => {
        const apply=items=>{
            const list=(items||[]).slice();
            homeShelves.artists={kind:'artists',items:list};
            homeShelves.forYouArtists={kind:'artists',items:list};
            HOME_DEFS.filter(def=>def.key==='artists').forEach(def=>renderShelfItem(def,list));
        };
        try{const artists=await collectHomeArtists(items=>apply(items),12);apply(artists);}catch(_){}
    };
    const loadHomeShelves = async (force=false) => {
        if(homeLoadPromise)return homeLoadPromise;
        if(!navigator.onLine||State.playbackSourceMode!=='online')return;
        if(!force&&homeLastLoaded&&Date.now()-homeLastLoaded<HOME_TTL&&Object.keys(homeShelves).length>=4)return;
        homeLoadPromise=(async()=>{
            const loadingFallback=document.getElementById('online-home-fallback');if(loadingFallback)loadingFallback.hidden=true;
            const loadDef=async def=>{
                if(def.derived||['artists','forYouArtists'].includes(def.key))return;
                try{
                    if(def.key==='suggested')await refreshSuggestions(force);
                    else{
                        const lookup=def.queries||def.query;
                        const items=def.kind==='songs'?await collectTrackPages(lookup):await collectEntityPages(def.kind,lookup);
                        if(items.length)homeShelves[def.key]={kind:def.kind,items:def.kind==='songs'?dedupeCatalogueTracks(items):items};
                    }
                }catch(_){}
                if(State.playbackSourceMode==='online')renderShelfItem(def,homeShelves[def.key]?.items||[]);
            };
            for(const stage of [1,2,3]){
                if(State.playbackSourceMode!=='online'||!navigator.onLine)break;
                const tasks=HOME_DEFS.filter(def=>def.stage===stage).map(loadDef);
                if(stage===1){tasks.push(refreshQuickPicks(force));tasks.push(refreshSuggestions(force));}
                if(stage===2)tasks.push(loadHomeArtistShelves());
                await Promise.all(tasks);
                if(State.playbackSourceMode==='online'){renderShelfItem(HOME_DEFS[0],[]);renderShelfItem(HOME_DEFS.find(def=>def.key==='forYouArtists'),[]);}
                await new Promise(resolve=>setTimeout(resolve,40));
            }
            homeLastLoaded=Date.now();cacheHomeShelves();
            const visibleShelves=HOME_DEFS.some(def=>!def.derived&&(homeShelves[def.key]?.items||[]).length>0);
            const fallback=document.getElementById('online-home-fallback');
            if(fallback){fallback.hidden=visibleShelves;fallback.innerHTML=visibleShelves?'':`<div class="online-network-state"><span class="material-symbols-rounded">cloud_off</span><div class="empty-title">Music is temporarily unavailable</div><div class="online-network-actions"><button class="btn" data-action="retry-online-home">Try again</button><button class="btn" data-action="toggle-playback-mode">Local library</button></div></div>`;}
        })().finally(()=>{homeLoadPromise=null;});
        return homeLoadPromise;
    };
    const renderRadioCards=(stations,limit=31)=>{
        const list=(stations||[]).slice(0,limit);
        return list.map(station=>`<article class="online-radio-card" data-radio-id="${esc(station.id)}" style="--radio-accent:${esc(station.accent||'#6b69ba')}"><button type="button" class="online-radio-card-open" data-action="online-open-radio" data-id="${esc(station.id)}" aria-label="Open ${esc(station.name)} details"><img width="480" height="320" src="${esc(station.art||'./icons/icon-192.png')}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-radio-overlay"></span><span class="online-radio-copy"><span class="material-symbols-rounded online-radio-signal" aria-hidden="true">radio</span><strong>${esc(station.name)}</strong><small>${esc(station.description||'A fresh mix, made for you')}</small></span></button><button type="button" class="online-radio-play" data-action="online-play-radio" data-id="${esc(station.id)}" aria-label="Play ${esc(station.name)}" title="Play ${esc(station.name)}"><span class="material-symbols-rounded" aria-hidden="true">play_arrow</span></button></article>`).join('');
    };
    const renderRadioShelf=()=>{
        const wrap=document.getElementById('online-shelf-radio-wrap'),node=document.getElementById('online-home-radio');if(!wrap||!node)return;
        const catalog=discoveryCatalog||DISCOVERY_FALLBACK;const stations=catalog.stations||[];
        wrap.hidden=!stations.length;
        const signature=stations.slice(0,31).map(item=>item.id).join('|');
        if(node.dataset.signature===signature&&node.childElementCount)return;
        node.dataset.signature=signature;node.innerHTML=renderRadioCards(stations,31);
        UI.lazyLoadArtwork();
    };
    const renderHomePersonal = () => {
        updateGreeting();
        arrangePersonalizedHomeShelves();
        renderShelfItem(HOME_DEFS[0],[]);
        const suggestedDef=HOME_DEFS.find(def=>def.key==='suggested');
        if(suggestedDef)renderShelfItem(suggestedDef,homeShelves.suggested?.items||[]);
        updateSuggestNote(suggestionSeeds());
        const recent=onlineHistory.map(trackById).filter(Boolean).slice(0,18);
        const recentWrap=document.getElementById('online-shelf-recent-wrap');if(recentWrap)recentWrap.hidden=!recent.length;
        const recentNode=document.getElementById('online-home-recent');if(recentNode)recentNode.innerHTML=renderTrackCards(recent,'online-history');
        const artistDef=HOME_DEFS.find(def=>def.key==='artists');
        if(artistDef)renderShelfItem(artistDef,homeShelves.artists?.items||artistCatalogue);
        const rail=HOME_DEFS.find(def=>def.key==='forYouArtists');
        if(rail)renderShelfItem(rail,[]);
        const userWrap=document.getElementById('online-shelf-collections-wrap');if(userWrap)userWrap.hidden=false;
        const userNode=document.getElementById('online-home-playlists');if(userNode)userNode.innerHTML=renderUserPlaylistCards(playlists.slice(0,30));
    };
    const renderHome = () => {
        if(State.playbackSourceMode!=='online')return;
        if(!discoveryCatalog)loadDiscoveryCatalog();
        renderRadioShelf();
        const status=document.getElementById('online-home-connection');if(status)status.hidden=Boolean(navigator.onLine);
        if(!Object.keys(homeShelves).length)restoreHomeShelves();
        const fallback=document.getElementById('online-home-fallback');if(fallback&&Object.values(homeShelves).some(shelf=>shelf?.items?.length))fallback.hidden=true;
        if(!Object.keys(homeShelves).length&&navigator.onLine){
            HOME_DEFS.filter(def=>!def.derived&&def.kind!=='wall'&&def.kind!=='artists'&&def.stage<3).forEach(def=>{const node=document.getElementById(def.node);if(node)node.innerHTML='<div class="online-skeleton-list"><span></span><span></span><span></span></div>';});
        }
        HOME_DEFS.filter(def=>!def.derived).forEach(def=>renderShelfItem(def,homeShelves[def.key]?.items||[]));
        renderHomePersonal();
        renderSearchHistory();
        if(!navigator.onLine){renderConnectivityState();return;}
        if(Date.now()-homeLastLoaded>HOME_TTL||!Object.keys(homeShelves).length)loadHomeShelves(false);
        else { refreshSuggestions(false); refreshQuickPicks(false); }
    };
    const renderRemotePlaylistCards = list => renderEntityGrid(list,'playlists');
    const loadPublicPlaylists = async (query='Hindi romantic',append=false) => {
        const node=document.getElementById('online-public-playlists');if(!node)return;
        if(!navigator.onLine){node.innerHTML='<div class="online-empty-inline">Connect to browse playlists.</div>';return;}
        const q=String(query||publicPlaylistQuery||'Hindi romantic').trim();if(!q)return;
        if(!append){publicPlaylistQuery=q;publicPlaylistPage=0;publicPlaylistResults=[];node.innerHTML='<div class="online-skeleton-grid"><span></span><span></span><span></span><span></span></div>';}
        try{
            let hasMore=false;let added=0;const maxPages=append?3:6;const goal=append?publicPlaylistResults.length+24:24;
            for(let turn=0;turn<maxPages;turn++){
                const page=append?publicPlaylistPage+1+turn:turn;
                const result=await OnlineMusic.searchEntities('playlists',q,{page,limit:30});
                const merged=mergeUnique(publicPlaylistResults,result.items||[],'playlists');
                publicPlaylistResults=merged.items;added=merged.added;publicPlaylistPage=page;
                hasMore=Boolean(result.hasMore);
                if(publicPlaylistResults.length>=goal||!result.items?.length||!added||!hasMore)break;
            }
            const body=renderRemotePlaylistCards(publicPlaylistResults);
            node.innerHTML=`<div class="online-entity-grid-wrap">${body}</div>${hasMore&&added?'<div class="online-load-more-wrap"><button class="btn" data-action="online-more-public-playlists">Load more</button></div>':''}`;
            try{localStorage.setItem(KEYS.publicPlaylists,JSON.stringify({query:q,savedAt:Date.now(),items:publicPlaylistResults.map(safeEntity)}));}catch(_){}
            UI.lazyLoadArtwork();
        }catch(_){
            const cached=safeRead(KEYS.publicPlaylists,null);
            if(cached?.items?.length){publicPlaylistResults=cached.items;node.innerHTML=renderRemotePlaylistCards(publicPlaylistResults);}
            else node.innerHTML='<div class="online-empty-inline">Playlists are temporarily unavailable.</div>';
        }
    };
    const renderPlaylists = () => {
        const c=document.getElementById('online-playlists-content');if(!c)return;
        if(!activePlaylistId){
            c.innerHTML=playlists.length?`<div class="online-user-playlist-grid">${renderUserPlaylistCards(playlists)}</div>`:'';
            const discover=document.querySelector('#view-online-playlists .online-discover-section');if(discover)discover.hidden=false;
            if(!publicPlaylistResults.length)loadPublicPlaylists(publicPlaylistQuery,false);
            return;
        }
        const playlist=playlists.find(p=>p.id===activePlaylistId);if(!playlist){activePlaylistId=null;renderPlaylists();return;}
        playlist.tracks=dedupePlaylistTracks(playlist.tracks||[]);
        const tracks=dedupeCatalogueTracks(playlist.tracks.map(trackById).filter(Boolean));
        c.innerHTML=`<div class="online-collection-header"><button class="text-action" data-action="online-back-playlists"><span class="material-symbols-rounded">arrow_back</span> Playlists</button><div class="online-collection-heading"><h2>${esc(playlist.name)}</h2><span>${tracks.length} songs</span></div><div class="online-action-row"><button class="btn btn-primary" data-action="online-playlist-play" data-id="${esc(playlist.id)}">Play</button><button class="btn" data-action="online-share-to-offline" data-id="${esc(playlist.id)}">Copy to library</button><button class="icon-btn" data-action="online-rename-playlist" data-id="${esc(playlist.id)}" aria-label="Rename"><span class="material-symbols-rounded">edit</span></button><button class="icon-btn" data-action="online-delete-playlist" data-id="${esc(playlist.id)}" aria-label="Delete"><span class="material-symbols-rounded">delete</span></button></div></div>${renderTrackRows(tracks,`online-playlist:${playlist.id}`,'')}`;
        UI.lazyLoadArtwork();
    };
    const renderHistory = () => {
        const c=document.getElementById('online-history-content');if(!c)return;
        c.innerHTML=renderTrackRows(onlineHistory.map(trackById).filter(Boolean),'online-history','No listening history yet.');
        UI.lazyLoadArtwork();
    };
    const renderQueue = () => {
        Player.syncNowPlaying?.();saveQueueSnapshot('online');const c=document.getElementById('online-queue-content');if(!c)return;
        const ids=State.playbackOrder||[];const tracks=ids.map(trackById).filter(Boolean);const current=Player.getCurrentTrack();
        c.innerHTML=`${current?`<div class="online-current-track"><img src="${esc(current.artworkUrl||'./icons/icon-192.png')}" alt=""><div><strong>${esc(current.title)}</strong><span>${esc(current.artist)}</span></div></div>`:''}${renderTrackRows(tracks,'online-queue','')}`;
        UI.lazyLoadArtwork();
    };
    const renderLiked = () => {
        const c=document.getElementById('online-liked-content');if(!c)return;
        c.innerHTML=renderTrackRows(onlineFavorites.map(trackById).filter(Boolean),'online-liked','No liked songs yet.');
        UI.lazyLoadArtwork();
    };
    const setLibraryTab = tab => {
        libraryTab=['playlists','liked','history','queue'].includes(tab)?tab:'playlists';
        document.querySelectorAll('.online-library-tab').forEach(button=>{
            const active=button.dataset.tab===libraryTab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
        });
        document.querySelectorAll('.online-library-panel').forEach(panel=>{panel.hidden=panel.id!==`online-library-${libraryTab}-panel`;});
        if(libraryTab==='playlists'){renderPlaylists();loadPublicPlaylists(publicPlaylistQuery,false);}
        if(libraryTab==='liked')renderLiked();
        if(libraryTab==='history')renderHistory();
        if(libraryTab==='queue')renderQueue();
    };
    const openLikedFromHome = () => {
        setLibraryTab('liked');
        UI.switchView('online-playlists');
    };
    const openLibraryTab = tab => {setLibraryTab(tab);if(State.playbackSourceMode==='online'&&document.getElementById('view-online-playlists')?.classList.contains('active'))return;UI.switchView('online-playlists');};
    const isFavorite = id => {const track=trackById(id);return onlineFavorites.some(item=>item.id===id||(track&&sameSong(item,track)));};
    const syncFavoriteUI = (track, liked) => {
        const icon=document.getElementById('ctx-fav-icon');
        if(icon&&State.actionTargetId===track.id){
            icon.innerText=liked?'favorite':'favorite_border';icon.style.color=liked?'var(--accent-color)':'inherit';
            const label=document.getElementById('ctx-fav-text');if(label)label.innerText=liked?'Remove Favorite':'Favorite';
        }
        document.querySelectorAll('.track-row[data-id]').forEach(row=>{
            if(row.dataset.id!==track.id)return;
            row.querySelector('.online-row-heart')?.remove();
            if(liked){const anchor=row.querySelector('.online-row-playing-state')||row.querySelector('[data-action="track-options"]');if(anchor)anchor.insertAdjacentHTML('beforebegin','<span class="material-symbols-rounded online-row-heart">favorite</span>');}
        });
    };
    const toggleFavorite = id => {
        const track=trackById(id||State.currentTrackId);if(!track||!OnlineMusic.isOnlineTrack(track))return false;
        const index=onlineFavorites.findIndex(item=>item.id===track.id);const equivalent=onlineFavorites.findIndex(item=>sameSong(item,track));
        if(index<0&&equivalent>=0){UI.showToast('This recording is already in Liked Songs.','info');return false;}
        const liked=index<0;
        if(liked)onlineFavorites.unshift(serializeTrack(track));else onlineFavorites.splice(index,1);
        onlineFavorites=onlineFavorites.slice(0,500);persist();
        const button=document.getElementById('fav-btn');if(button&&State.currentTrackId===track.id)button.innerHTML=`<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${liked?1:0}; color:${liked?'var(--accent-color)':'inherit'}">favorite</span>`;
        syncFavoriteUI(track,liked);if(libraryTab==='liked')renderLiked();renderHomePersonal();UI.showToast(liked?'Added to Liked Songs':'Removed from Liked Songs',liked?'favorite':'favorite_border');return liked;
    };
    const openPlaylist = id => {activePlaylistId=id||null;renderPlaylists();UI.lazyLoadArtwork();};
    const clearHistory = () => {onlineHistory=[];persist();renderHistory();renderHome();UI.showToast('History cleared.','delete');};
    const clearQueue = () => {
        const current=Player.getCurrentTrack();if(current&&OnlineMusic.isOnlineTrack(current)){State.queue=[current.id];State.playbackOrder=[current.id];State.queueIndex=0;}else{State.queue=[];State.playbackOrder=[];State.queueIndex=-1;}
        saveQueueSnapshot('online');UI.renderQueue();renderQueue();renderHome();UI.showToast('Queue cleared.','delete');
    };
    const rememberArtistTracks = (id, tracks, total, complete, pageMeta={}) => {
        const compact=dedupeCatalogueTracks(tracks||[]).slice(0,60);
        const entry={savedAt:Date.now(),total:Number(total)||compact.length,complete:Boolean(complete),
            lastPage:Math.max(0,Number(pageMeta.page)||0),pageSize:Math.max(1,Number(pageMeta.pageSize)||compact.length||10),
            hasMore:Boolean(pageMeta.hasMore),tracks:compact.map(serializeTrack)};
        artistTrackCache.set(String(id),entry);
        try{
            const stored=safeRead(KEYS.artistCache,{});stored[String(id)]=entry;
            const keys=Object.keys(stored).sort((a,b)=>(stored[b]?.savedAt||0)-(stored[a]?.savedAt||0)).slice(0,24);
            const trimmed={};keys.forEach(key=>trimmed[key]=stored[key]);localStorage.setItem(KEYS.artistCache,JSON.stringify(trimmed));
        }catch(_){}
    };
    const readArtistTracks = id => {
        const key=String(id);
        let entry=artistTrackCache.get(key);
        if(!entry){const all=safeRead(KEYS.artistCache,{});entry=all?.[key];if(entry)artistTrackCache.set(key,entry);}
        if(!entry||Date.now()-Number(entry.savedAt||0)>12*60*60*1000||!Array.isArray(entry.tracks))return null;
        const tracks=hydrate(entry.tracks);
        return tracks.length?{...entry,tracks}:null;
    };
    const appendArtistTracks = (current, incoming) => dedupeCatalogueTracks([...(current||[]),...(incoming||[])]);
    const ARTIST_INITIAL_TRACKS = 12;
    const loadInitialArtistSongs = async (id, data, token, fallbackTracks=[]) => {
        const isCurrent=()=>activeRemoteEntity?.requestId===token&&State.playbackSourceMode==='online';
        const sourceId=String(data.sourceId||id);
        try{
            const cached=readArtistTracks(sourceId);
            if(cached?.tracks?.length){
                const cachedTracks=dedupeCatalogueTracks(cached.tracks);
                data.tracks=cachedTracks.slice(0,ARTIST_INITIAL_TRACKS);
                data.total=Math.max(Number(data.total)||0,Number(cached.total)||0,cachedTracks.length);
                data.songPage=Math.max(0,Number(cached.lastPage)||0);data.songPageSize=Math.max(1,Number(cached.pageSize)||cachedTracks.length||10);data.songPageSizeEstimated=!Number(cached.pageSize);
                data.loadingTracks=false;data.artistLoadError=false;data.failedSongPages=[];
                data.hasMoreTracks=cachedTracks.length>data.tracks.length||!cached.complete||Boolean(cached.hasMore);
                data.cachedTracksAvailable=cachedTracks.length;
                if(isCurrent())renderRemoteDetail();
                return;
            }
            const first=await OnlineMusic.fetchArtistSongs(sourceId,0,data.title);
            if(!isCurrent())return;
            const firstRows=dedupeCatalogueTracks(Array.isArray(first.tracks)?first.tracks:[]);
            if(firstRows.length){
                data.tracks=firstRows.slice(0,ARTIST_INITIAL_TRACKS);
                data.total=Math.max(Number(data.total)||0,Number(first.total)||0,data.tracks.length);
                data.songPage=0;data.songPageSize=Math.max(1,Number(first.pageSize)||data.tracks.length||10);
                data.songPageSizeEstimated=!first.hasTotal&&!Number(first.pageSize);
                data.failedSongPages=[];data.artistLoadError=false;data.loadingTracks=false;
                data.hasMoreTracks=Boolean(first.hasMore)||data.tracks.length<data.total||data.tracks.length>=data.songPageSize;
                data.cachedTracksAvailable=data.tracks.length;
                rememberArtistTracks(sourceId,firstRows,data.total,!data.hasMoreTracks,{page:0,pageSize:data.songPageSize,hasMore:data.hasMoreTracks});
            }else{
                data.tracks=dedupeCatalogueTracks(fallbackTracks||[]).slice(0,ARTIST_INITIAL_TRACKS);
                data.total=Math.max(Number(data.total)||0,Number(data.totalSongs)||0,data.tracks.length);
                data.songPage=-1;data.songPageSize=10;data.songPageSizeEstimated=true;
                data.failedSongPages=[0];data.hasMoreTracks=true;data.loadingTracks=false;data.artistLoadError=true;
            }
            if(isCurrent())renderRemoteDetail();
        }catch(error){
            if(!isCurrent())return;
            data.loadingTracks=false;data.artistLoadError=true;data.hasMoreTracks=true;
            data.failedSongPages=Array.isArray(data.failedSongPages)?data.failedSongPages:[];
            if(!data.failedSongPages.includes(0))data.failedSongPages=[0,...data.failedSongPages].sort((a,b)=>a-b);
            data.songPage=-1;data.songPageSize=10;data.songPageSizeEstimated=true;
            if(!data.tracks?.length)data.tracks=dedupeCatalogueTracks(fallbackTracks||[]).slice(0,ARTIST_INITIAL_TRACKS);
            data.total=Math.max(Number(data.total)||0,Number(data.totalSongs)||0,data.tracks.length);
            if(isCurrent()){UI.showToast('Artist tracks could not load yet. Tap Load more to retry.','info');renderRemoteDetail();}
        }
    };
    const openCurrentArtist = async (preferredId='', preferredName='') => {
        const track=Player.getCurrentTrack();
        if(!track?.artist&&!preferredName)return false;
        if(State.playbackSourceMode!=='online'){
            const artistName=String(preferredName||track.artist).split(',')[0].trim();
            return UI.openContextView('artist',artistName);
        }
        const raw=track.raw||{};
        const candidates=[...(raw.artists?.primary||[]),...(raw.artists?.all||[]),...(raw.artists?.featured||[]),...(raw.artistMap?.primary_artists||[]),...(raw.more_info?.artistMap?.primary_artists||[])];
        const wanted=String(preferredName||track.artist||'').split(',')[0].trim().toLowerCase();
        let artist=candidates.find(item=>String(item?.id||item?.artistId||'')===String(preferredId)&&preferredId) || candidates.find(item=>String(item?.name||'').trim().toLowerCase()===wanted&&item?.id) || candidates.find(item=>item?.id);
        let id=String(preferredId||artist?.id||artist?.artistId||'').trim();
        if(!id){
            try{
                const result=await OnlineMusic.searchEntities('artists',wanted,{page:0,limit:8});
                const items=Array.isArray(result?.items)?result.items:[];
                const found=items.find(item=>String(item.title||item.name||'').trim().toLowerCase()===wanted)||items[0];
                id=String(found?.sourceId||String(found?.id||'').replace(/^artists:/,'')).trim();
            }catch(_){return false;}
        }
        if(!id){UI.showToast('Artist page is not available for this track.','info');return false;}
        return openRemoteEntity('artists',id);
    };

    const getDiscoveryCategory=id=>(discoveryCatalog||DISCOVERY_FALLBACK).categories.find(item=>String(item.id)===String(id));
    const getRadioStation=id=>(discoveryCatalog||DISCOVERY_FALLBACK).stations.find(item=>String(item.id)===String(id));
    const storeDiscoveryResult=entity=>{
        if(entity?.kind!=='category'||!entity?.data)return;
        const data=entity.data;
        discoveryResultCache[entity.id]={savedAt:Date.now(),tracks:(data.tracks||[]).slice(0,48).map(serializeTrack),playlists:(data.playlists||[]).slice(0,18).map(safeEntity),albums:(data.albums||[]).slice(0,18).map(safeEntity),songOffset:data.songOffset||0,playlistOffset:data.playlistOffset||0,albumOffset:data.albumOffset||0};
        discoveryResultCache=saveBoundedCache(DISCOVERY_RESULT_KEY,discoveryResultCache,10);
    };
    const loadCachedCategory=id=>{
        const row=discoveryResultCache?.[id];if(!row)return null;
        return {tracks:(row.tracks||[]).map(restoreTrack).filter(Boolean),playlists:row.playlists||[],albums:row.albums||[],songOffset:Number(row.songOffset)||0,playlistOffset:Number(row.playlistOffset)||0,albumOffset:Number(row.albumOffset)||0,savedAt:Number(row.savedAt)||0};
    };
    const setDiscoveryRoute=(kind,id,data,returnView)=>{
        const previous=document.querySelector('.view.active')?.id||'view-online-home';
        const parent=previous==='view-online-detail'?activeRemoteEntity:null;
        const resolvedReturn=returnView||(parent?'online-detail':previous.replace(/^view-/,'')||'online-home');
        const requestId=++remoteRequestSequence;
        activeRemoteEntity={kind,id:String(id||kind),data,requestId,returnView:resolvedReturn,parent};
        UI.switchView('online-detail');
        return requestId;
    };
    const interleaveTrackBatches=batches=>{
        const rows=(Array.isArray(batches)?batches:[]).map(batch=>Array.isArray(batch)?batch:[]);
        const out=[];const max=rows.reduce((n,row)=>Math.max(n,row.length),0);
        for(let index=0;index<max;index++)for(const row of rows)if(row[index])out.push(row[index]);
        return dedupeCatalogueTracks(out).slice(0,60);
    };
    const fetchDiscoverySongs=async(queries,page=0)=>{
        const terms=(Array.isArray(queries)?queries:[queries]).map(value=>String(value||'').trim()).filter(Boolean);
        if(!navigator.onLine||!terms.length)return [];
        const batches=await Promise.all(terms.map(query=>OnlineMusic.search(query,{page,limit:30,background:true}).catch(()=>[])));
        return interleaveTrackBatches(batches).slice(0,48);
    };
    const fetchCategoryBatch=async(entity,requestId,first=false)=>{
        const category=getDiscoveryCategory(entity?.id);if(!category||!entity?.data)return;
        const data=entity.data;
        const songStart=Number(data.songOffset)||0,playlistStart=Number(data.playlistOffset)||0,albumStart=Number(data.albumOffset)||0;
        const songQueries=(category.songs||[]).slice(songStart,songStart+(first?2:2));
        const playlistQueries=(category.playlists||[]).slice(playlistStart,playlistStart+1);
        const albumQueries=(category.albums||[]).slice(albumStart,albumStart+1);
        if(!songQueries.length&&!playlistQueries.length&&!albumQueries.length){data.hasMore=false;renderRemoteDetail();return;}
        data.loadingDiscovery=true;data.artistLoadError=false;renderRemoteDetail();
        const [tracks,playlistsResult,albumsResult]=await Promise.all([
            fetchDiscoverySongs(songQueries,0),
            collectEntityPages('playlists',playlistQueries),
            collectEntityPages('albums',albumQueries)
        ]);
        if(!activeRemoteEntity||activeRemoteEntity.requestId!==requestId||activeRemoteEntity.kind!=='category')return;
        data.tracks=dedupeCatalogueTracks([...(data.tracks||[]),...tracks]);
        data.playlists=mergeUnique(data.playlists||[],playlistsResult,'playlists').items;
        data.albums=mergeUnique(data.albums||[],albumsResult,'albums').items;
        data.songOffset=songStart+songQueries.length;data.playlistOffset=playlistStart+playlistQueries.length;data.albumOffset=albumStart+albumQueries.length;
        data.hasMore=data.songOffset<(category.songs||[]).length||data.playlistOffset<(category.playlists||[]).length||data.albumOffset<(category.albums||[]).length;
        data.loadingDiscovery=false;data.savedAt=Date.now();storeDiscoveryResult(entity);renderRemoteDetail();
    };
    const openCategory=async id=>{
        const catalog=await loadDiscoveryCatalog();const category=catalog.categories.find(item=>String(item.id)===String(id));if(!category)return;
        if(State.playbackSourceMode!=='online'){const enabled=await OnlineMusic.setMode('online');if(!enabled)return;}
        const current=document.querySelector('.view.active')?.id||'view-online-search';
        const returnView=current==='view-online-detail'?(activeRemoteEntity?.returnView||'online-search'):current.replace(/^view-/,'');
        const cached=loadCachedCategory(category.id);
        const data={id:category.id,title:category.label,description:category.description,image:category.art,theme:category.theme,tracks:cached?.tracks||[],playlists:cached?.playlists||[],albums:cached?.albums||[],songOffset:cached?.songOffset||0,playlistOffset:cached?.playlistOffset||0,albumOffset:cached?.albumOffset||0,hasMore:true,loadingDiscovery:!cached?.tracks?.length};
        const requestId=setDiscoveryRoute('category',category.id,data,returnView);
        renderRemoteDetail();
        if(!navigator.onLine){if(!data.tracks.length)UI.showToast('Connect to load this category.','info');return;}
        if(cached&&Date.now()-cached.savedAt<6*60*60*1000){data.hasMore=data.songOffset<(category.songs||[]).length||data.playlistOffset<(category.playlists||[]).length||data.albumOffset<(category.albums||[]).length;return;}
        await fetchCategoryBatch(activeRemoteEntity,requestId,!cached);
    };
    const loadMoreCategory=async()=>{
        const entity=activeRemoteEntity;if(entity?.kind!=='category'||entity.data?.loadingDiscovery)return;
        const requestId=entity.requestId;await fetchCategoryBatch(entity,requestId,false);
    };
    const playCategory=()=>{
        const entity=activeRemoteEntity;if(entity?.kind!=='category')return;
        const tracks=dedupeCatalogueTracks(entity.data?.tracks||[]);if(!tracks.length){UI.showToast('This category has no playable tracks loaded yet.','info');return;}
        activeRadioSession=null;setSearchContext(tracks);Player.playContext(tracks,0);saveQueueSnapshot('online');
    };
    const fetchRadioTracks=async(station,page=0)=>{
        const cached=cachedRadioTracks(station,page);if(cached.length)return cached;
        const seedTerms=(Array.isArray(station.seedQueries)&&station.seedQueries.length?station.seedQueries:station.queries||[station.name]).map(value=>String(value||'').trim()).filter(Boolean);
        const batches=[];
        for(const query of seedTerms.slice(0,3)){
            const rows=await fetchDiscoverySongs([query],page);
            if(rows.length)batches.push(rows);
        }
        let tracks=interleaveTrackBatches(batches).slice(0,48);
        if(tracks.length<8){
            const used=new Set(seedTerms);
            for(const query of (station.queries||[]).map(value=>String(value||'').trim()).filter(value=>value&&!used.has(value)).slice(0,2)){
                const rows=await fetchDiscoverySongs([query],page);
                if(rows.length)batches.push(rows);
                tracks=interleaveTrackBatches(batches).slice(0,48);
                if(tracks.length>=18)break;
            }
        }
        if(tracks.length)saveRadioTracks(station,page,tracks);
        return tracks;
    };
    const openRadioDirectory=async()=>{
        const catalog=await loadDiscoveryCatalog();const current=document.querySelector('.view.active')?.id||'view-online-home';
        const returnView=current==='view-online-detail'?(activeRemoteEntity?.returnView||'online-home'):current.replace(/^view-/,'');
        setDiscoveryRoute('radio-directory','all-stations',{title:'Radio',description:'Choose a station. Every mix is generated from catalogue searches and shuffled to avoid recent repeats.',stations:catalog.stations||[]},returnView);
        renderRemoteDetail();
    };
    const openRadioStation=async id=>{
        const catalog=await loadDiscoveryCatalog();const station=catalog.stations.find(item=>String(item.id)===String(id));if(!station)return;
        if(State.playbackSourceMode!=='online'){const enabled=await OnlineMusic.setMode('online');if(!enabled)return;}
        const current=document.querySelector('.view.active')?.id||'view-online-home';const returnView=current==='view-online-detail'?(activeRemoteEntity?.returnView||'online-home'):current.replace(/^view-/,'');
        const cached=cachedRadioTracks(station,0);
        const data={id:station.id,title:station.name,description:station.description,image:station.art,accent:station.accent,station,tracks:cached,loadingRadio:!cached.length};
        const requestId=setDiscoveryRoute('radio',station.id,data,returnView);renderRemoteDetail();
        if(!cached.length&&navigator.onLine){const tracks=await fetchRadioTracks(station,0);if(activeRemoteEntity?.requestId!==requestId)return;data.tracks=tracks;data.loadingRadio=false;renderRemoteDetail();}
    };
    const startRadio=async(stationOrId,artistName='')=>{
        const catalog=await loadDiscoveryCatalog();let station=typeof stationOrId==='object'?stationOrId:catalog.stations.find(item=>String(item.id)===String(stationOrId));
        if(!station){UI.showToast('This radio station is unavailable.','info');return false;}
        if(State.playbackSourceMode!=='online'){const enabled=await OnlineMusic.setMode('online');if(!enabled)return false;}
        if(!navigator.onLine){UI.showToast('Connect to start radio.','info');return false;}
        const id=String(station.id), title=String(station.name||artistName||'Radio');
        UI.showToast(`Tuning in to ${title}…`,'info');
        let tracks=await fetchRadioTracks(station,0);
        if(tracks.length<8){for(const query of (station.queries||[]).slice(0,2)){const extra=await fetchDiscoverySongs([query],0);tracks=dedupeCatalogueTracks([...tracks,...extra]).slice(0,60);if(tracks.length>=18)break;}}
        if(!tracks.length){UI.showToast('Could not find tracks for this radio yet. Try again in a moment.','error');return false;}
        const history=getRadioHistory(id),recent=new Set(history.slice(-72));
        let fresh=tracks.filter(track=>!radioTrackKeys(track).some(key=>recent.has(key)));
        if(fresh.length<8){const shortHistory=new Set(history.slice(-20));fresh=tracks.filter(track=>!radioTrackKeys(track).some(key=>shortHistory.has(key)));}
        if(!fresh.length)fresh=tracks;
        const ordered=shuffleTracks(fresh).slice(0,48);
        activeRadioSession={id,title,station:{...station,queries:[...(station.queries||[])]},page:1,trackIds:new Set(ordered.map(track=>track.id)),catalogTracks:tracks,artistRadio:Boolean(station.artistId)};
        shelfContexts.set(`radio:${id}`,ordered);setSearchContext(ordered);Player.playContext(ordered,0);saveQueueSnapshot('online');
        UI.showToast(`${title} is playing`, 'check_circle');return true;
    };
    const startArtistRadio=async(id,name)=>{
        const artistName=String(name||'Artist').trim();const safeId=String(id||`artist-${titleKey(artistName).replace(/\s+/g,'-')}`);
        const station={id:`artist-${safeId}`,name:`${artistName} Radio`,description:`A shuffled mix inspired by ${artistName} and related catalogue searches.`,art:'',accent:'#9266d3',artistId:safeId,queries:[artistName,`${artistName} popular songs`,`${artistName} hits`]};
        return startRadio(station,artistName);
    };
    const extendRadioQueue=async currentTrack=>{
        const session=activeRadioSession;if(!session||State.playbackSourceMode!=='online'||!navigator.onLine)return [];
        const queued=new Set([...(State.queue||[]),...(State.playbackOrder||[])]);
        for(let attempt=0;attempt<3;attempt++){
            const page=session.page++;
            let batch=await fetchRadioTracks(session.station,page);
            if(!batch.length&&attempt===0)batch=await fetchDiscoverySongs((session.station.queries||[]).map(q=>`${q} playlist`),page);
            const history=new Set(getRadioHistory(session.id).slice(-72));
            const fresh=dedupeCatalogueTracks(batch).filter(track=>!queued.has(track.id)&&!radioTrackKeys(track).some(key=>history.has(key)));
            if(!fresh.length)continue;
            const append=shuffleTracks(fresh).slice(0,30);
            const ids=append.map(track=>track.id);State.queue=[...(State.queue||[]),...ids];State.playbackOrder=[...(State.playbackOrder||[]),...ids];
            append.forEach(track=>session.trackIds.add(track.id));session.catalogTracks=dedupeCatalogueTracks([...(session.catalogTracks||[]),...append]);
            shelfContexts.set(`radio:${session.id}`,session.catalogTracks);saveQueueSnapshot('online');UI.renderQueue();return append;
        }
        return [];
    };
    const getPlaybackLabel=track=>{
        const trackId=String(track?.id||'');
        if(activeRadioSession&&trackId&&activeRadioSession.trackIds.has(trackId))return activeRadioSession.title;
        const entity=activeRemoteEntity;
        if(entity?.kind==='category'&&(entity.data?.tracks||[]).some(item=>String(item.id)===trackId))return `${entity.data.title} Mix`;
        if(track?.source!=='machhar-online')return State.currentContextType==='playlist'?'From Playlist':'From Your Library';
        if(State.currentContextType==='playlist')return 'From Playlist';
        return 'Streaming';
    };
    const openRemoteEntity = async (kind,id) => {
        if(!['playlists','albums','artists'].includes(kind)||!id)return;
        const previousEntity=activeRemoteEntity;
        const currentView=document.querySelector('.view.active')?.id||'view-online-home';
        const parent=currentView==='view-online-detail'?previousEntity:null;
        const returnView=parent?'online-detail':(currentView==='view-online-search'?'online-search':currentView==='view-online-playlists'?'online-playlists':currentView==='view-online-artists'?'online-artists':'online-home');
        const requestId=++remoteRequestSequence;
        activeRemoteEntity={kind,id:String(id),data:null,requestId,returnView,parent};
        UI.switchView('online-detail');
        const node=document.getElementById('online-remote-detail');if(node)node.innerHTML='<div class="online-skeleton-list"><span></span><span></span><span></span></div>';
        if(kind==='artists'){
            const sourceId=String(id).replace(/^artists:/,'');
            const cachedArtist=artistCatalogue.find(item=>String(item.sourceId||String(item.id||'').replace(/^artists:/,''))===sourceId);
            const current=Player.getCurrentTrack();
            const rawArtists=[...(current?.raw?.artists?.primary||[]),...(current?.raw?.artists?.all||[]),...(current?.raw?.artists?.featured||[]),...(current?.raw?.artistMap?.primary_artists||[])];
            const rawArtist=rawArtists.find(item=>String(item.id||item.artistId||'')===sourceId);
            const title=cachedArtist?.title||rawArtist?.name|| (current?.artist||'').split(',')[0] || 'Artist';
            const image=cachedArtist?.image||OnlineMusic.getArtistImage?.(rawArtist||{})||OnlineMusic.resolveArtistArtwork?.(rawArtist||{},sourceId,title)||'';
            activeRemoteEntity.data={id:`artists:${sourceId}`,sourceId,title,image,description:cachedArtist?.description||'',tracks:[],albums:[],artists:[],total:0,totalSongs:0,totalAlbums:0,loadingTracks:true,hasMoreTracks:false,failedSongPages:[],songPage:-1,songPageSize:10,albumPage:-1,albumPageSize:6};
            renderRemoteDetail();
        }
        try{
            let data;
            if(kind==='playlists')data=await OnlineMusic.fetchPublicPlaylist(id,{page:0,limit:50});
            else if(kind==='albums')data=await OnlineMusic.fetchAlbumDetails(id);
            else data=await OnlineMusic.fetchArtistDetails(id);
            if(State.playbackSourceMode!=='online'||!activeRemoteEntity||activeRemoteEntity.requestId!==requestId)return;
            if(kind==='artists'){
                const fallbackTracks=data.tracks||[];
                const catalogueId=String(data.sourceId||id);
                data={...data,sourceId:catalogueId,tracks:fallbackTracks.slice(0,ARTIST_INITIAL_TRACKS),total:Math.max(Number(data.totalSongs)||0,fallbackTracks.length),totalAlbums:Math.max(Number(data.totalAlbums)||0,data.albums?.length||0),loadingTracks:true,hasMoreTracks:false,failedSongPages:[],songPage:-1,songPageSize:10,albumPage:-1,albumPageSize:Math.max(1,data.albums?.length||6)};
                activeRemoteEntity.data=data;renderRemoteDetail();
                const tracksTask=loadInitialArtistSongs(catalogueId,data,requestId,fallbackTracks);
                artistLoadPromises.set(catalogueId,tracksTask);
                tracksTask.finally(()=>{if(artistLoadPromises.get(catalogueId)===tracksTask)artistLoadPromises.delete(catalogueId);}).catch(()=>{});
            }else{
                activeRemoteEntity.data=data;renderRemoteDetail();
            }
        }catch(_){if(node)node.innerHTML='<div class="online-network-state"><div class="empty-title">Couldn’t load this collection</div><button class="btn" data-action="online-detail-back">Back</button></div>';
        }
    };
    const openReference = async reference => {
        const value=String(reference||'').trim();
        if(!value){UI.showToast('Paste a share link or enter a song ID.','info');return false;}
        if(State.playbackSourceMode!=='online'){const enabled=await OnlineMusic.setMode('online');if(!enabled)return false;}
        try{
            if(/^https?:\/\//i.test(value)){
                let url;try{url=new URL(value);}catch(_){throw new Error('That share link is not valid.');}
                const path=url.pathname.toLowerCase();
                if(/\/artist(?:s)?\//.test(path)){await openRemoteEntity('artists',value);return true;}
                if(/\/album(?:s)?\//.test(path)){await openRemoteEntity('albums',value);return true;}
                if(/\/playlist(?:s)?\//.test(path)||/\/featured\//.test(path)){await openRemoteEntity('playlists',value);return true;}
            }
            const tracks=await OnlineMusic.fetchSongsByIdsOrLink(value);
            if(!tracks.length)throw new Error('No playable songs were found for that link or ID.');
            activeRemoteEntity=null;searchQuery='';searchPage=0;searchType='songs';entityResults=[];allSearchResults=null;
            setSearchContext(dedupeCatalogueTracks(tracks));
            const input=document.getElementById('online-search-input');if(input)input.value='';
            UI.switchView('online-search');setSearchTypeUI();
            const target=document.getElementById('online-search-results');
            if(target)target.innerHTML=`<div class="online-reference-heading"><div class="online-mini-label">Opened from link</div><h2>${esc(tracks.length===1?tracks[0].title:`${tracks.length} songs`)}</h2><p>Tap a song to play it. Liked songs and playlists stay separate from your local library.</p></div>${renderTrackRows(searchResults,'online-search','No playable songs were returned.')}`;
            UI.lazyLoadArtwork();
            return true;
        }catch(error){UI.showToast(error?.message||'Could not open that music link. Check it and try again.','info');return false;}
    };
    const artistFact = (label,value) => value !== undefined && value !== null && String(value).trim() !== ''
        ? `<div class="online-artist-fact"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : '';
    const safeArtistLink = value => {
        const raw=String(value||'').trim();if(!raw)return '';
        try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch(_){return '';}
    };
    const artistLanguages = value => (Array.isArray(value)?value:[]).map(item=>typeof item==='string'?item:(item?.name||item?.language||item?.value||item?.title||'')).map(value=>String(value||'').trim()).filter(Boolean);
    const artistCount = value => {
        if(value===undefined||value===null||value==='')return '';
        const numeric=Number(value);
        if(Number.isFinite(numeric)&&numeric>0)return new Intl.NumberFormat(undefined,{notation:numeric>=1000?'compact':'standard',maximumFractionDigits:1}).format(numeric);
        return String(value);
    };
    const renderArtistProfile = e => {
        const raw=e.raw||{};const facts=[];
        const fans=raw.fanCount||e.fanCount||e.followerCount||raw.followerCount;
        const fanText=artistCount(fans);
        if(fanText)facts.push(artistFact('Fans',fanText));
        if(e.dominantLanguage)facts.push(artistFact('Main language',e.dominantLanguage));
        if(e.dominantType)facts.push(artistFact('Artist type',e.dominantType));
        if(e.dob)facts.push(artistFact('Born',e.dob));
        if(e.totalSongs)facts.push(artistFact('Songs',artistCount(e.totalSongs)));
        if(e.totalAlbums)facts.push(artistFact('Albums',artistCount(e.totalAlbums)));
        if(e.isVerified)facts.unshift('<span class="online-verified-artist"><span class="material-symbols-rounded">verified</span> Verified artist</span>');
        if(e.isRadioPresent)facts.push(artistFact('Artist radio','Available'));
        const langs=artistLanguages(e.availableLanguages||raw.availableLanguages);
        const languageMarkup=langs.length?`<div class="online-artist-language-row"><span>Available in</span><div>${langs.slice(0,10).map(lang=>`<span>${esc(lang)}</span>`).join('')}${langs.length>10?`<span>+${langs.length-10}</span>`:''}</div></div>`:'';
        const links=[['Artist page',raw.url],['Wikipedia',raw.wiki],['Facebook',raw.fb],['X / Twitter',raw.twitter]].map(([label,value])=>({label,url:safeArtistLink(value)})).filter(item=>item.url);
        const linksMarkup=links.length?`<div class="online-artist-links">${links.map(item=>`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.label)}<span class="material-symbols-rounded">north_east</span></a>`).join('')}</div>`:'';
        const bioRows=(Array.isArray(e.bioRows)?e.bioRows:[]).filter(row=>String(row?.text||row?.title||'').trim());
        const biography=bioRows.length?`<details class="online-artist-biography"><summary>Biography details</summary><div class="online-artist-biography-content">${bioRows.map(row=>`<section>${row.title?`<h3>${esc(row.title)}</h3>`:''}${row.text?`<p>${esc(row.text)}</p>`:''}</section>`).join('')}</div></details>`:'';
        if(!facts.length&&!languageMarkup&&!linksMarkup&&!biography)return '';
        return `<section class="online-artist-profile-data" aria-label="Artist information">${facts.length?`<div class="online-artist-facts">${facts.join('')}</div>`:''}${languageMarkup}${linksMarkup}${biography}</section>`;
    };
    const renderDiscoveryDetail=()=>{
        const node=document.getElementById('online-remote-detail');if(!node||!activeRemoteEntity?.data)return;
        const entity=activeRemoteEntity,data=entity.data;
        if(entity.kind==='radio-directory'){
            node.innerHTML=`<section class="online-radio-directory"><div class="online-discovery-eyebrow">MACHHAR RADIO</div><h1>${esc(data.title||'Radio')}</h1><p>${esc(data.description||'Choose a station and let the music run.')}</p><div class="online-radio-grid">${renderRadioCards(data.stations||[],31)}</div></section>`;
            UI.lazyLoadArtwork();return;
        }
        const context=entity.kind==='category'?`category:${entity.id}`:`radio:${entity.id}`;
        const tracks=dedupeCatalogueTracks(data.tracks||[]);shelfContexts.set(context,tracks);
        const playButton=entity.kind==='category'?`<button class="btn btn-primary" data-action="online-play-category" data-id="${esc(entity.id)}"><span class="material-symbols-rounded">play_arrow</span>Play collection</button>`:`<button class="btn btn-primary" data-action="online-play-radio" data-id="${esc(entity.id)}"><span class="material-symbols-rounded">play_arrow</span>Play radio</button>`;
        const hero=`<section class="online-discovery-hero" style="--discovery-accent:${esc(data.accent||'#8062c9')}"><img src="${esc(data.image||'./icons/icon-192.png')}" alt="" loading="eager" decoding="async" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><div class="online-discovery-shade"></div><div class="online-discovery-hero-copy"><span class="online-discovery-eyebrow">${entity.kind==='category'?'BROWSE CATEGORY':'MACHHAR RADIO'}</span><h1>${esc(data.title||'Music')}</h1><p>${esc(data.description||'A collection picked for this moment.')}</p><div class="online-discovery-actions">${playButton}${entity.kind==='radio'?'<span class="online-radio-live-pill"><i></i> RADIO MIX</span>':''}</div></div></section>`;
        if(entity.kind==='radio'){
            const waiting=data.loadingRadio&&!tracks.length;
            node.innerHTML=`${hero}<section class="online-discovery-section"><div class="online-shelf-heading"><h2>Up Next</h2><span class="online-section-note">${tracks.length?`${tracks.length} tracks queued`:waiting?'Finding tracks…':'No tracks loaded'}</span></div>${waiting?'<div class="online-skeleton-list"><span></span><span></span><span></span></div>':renderTrackRows(tracks.slice(0,30),context,'This station has no playable tracks yet.')}<div class="online-load-more-wrap"><button class="btn" data-action="online-play-radio" data-id="${esc(entity.id)}">Shuffle and play radio</button></div></section>`;
            UI.lazyLoadArtwork();return;
        }
        const playlistSection=(data.playlists||[]).length?`<section class="online-discovery-section"><div class="online-shelf-heading"><h2>Playlists</h2><span class="online-section-note">Curated for ${esc(data.title)}</span></div><div class="online-card-rail">${renderEntityRail(data.playlists,'playlists')}</div></section>`:'';
        const albumSection=(data.albums||[]).length?`<section class="online-discovery-section"><div class="online-shelf-heading"><h2>Albums</h2><span class="online-section-note">From the catalogue</span></div><div class="online-card-rail">${renderEntityRail(data.albums,'albums')}</div></section>`:'';
        const songsSection=`<section class="online-discovery-section"><div class="online-shelf-heading"><h2>Popular tracks</h2><span class="online-section-note">${tracks.length?`${tracks.length} songs`:data.loadingDiscovery?'Loading…':'Catalogue picks'}</span></div>${data.loadingDiscovery&&!tracks.length?'<div class="online-skeleton-list"><span></span><span></span><span></span></div>':renderTrackRows(tracks.slice(0,30),context,'No tracks have loaded yet.')}<div class="online-load-more-wrap">${data.hasMore?'<button class="btn" data-action="online-load-category-more">Load more music</button>':''}</div></section>`;
        node.innerHTML=`${hero}${playlistSection}${songsSection}${albumSection}`;
        UI.lazyLoadArtwork();
    };
    const renderRemoteDetail = () => {
        if(activeRemoteEntity&&['category','radio','radio-directory'].includes(activeRemoteEntity.kind)){renderDiscoveryDetail();return;}
        const node=document.getElementById('online-remote-detail');if(!node||!activeRemoteEntity?.data)return;
        const e=activeRemoteEntity.data;const tracks=e.tracks||[];const kind=activeRemoteEntity.kind;
        shelfContexts.set(`detail:${kind}:${activeRemoteEntity.id}`,tracks);
        const showMore=(kind==='playlists'&&Number(e.total)>tracks.length)||(kind==='artists'&&e.hasMoreTracks);
        const more=showMore?'<div class="online-load-more-wrap"><button class="btn" data-action="online-load-remote-more">Load more</button></div>':'';
        const artistHeading=kind==='artists'?`<div class="online-artist-detail-heading"><h3>Songs</h3><span class="online-artist-progress">${e.loadingTracks?`${tracks.length.toLocaleString()}${e.total?` / ${Number(e.total).toLocaleString()}`:''} loading`:tracks.length.toLocaleString()+' tracks'}</span></div>`:`<div class="online-collection-heading"><h3>${tracks.length?`${tracks.length} songs`: 'Songs'}</h3></div>`;
        const similar=kind==='artists'&&e.artists?.length?`<section class="online-detail-albums online-detail-similar"><div class="online-shelf-heading"><h2>Similar Artists</h2><div class="online-rail-controls"><button class="icon-btn online-shelf-more" data-action="online-scroll-rail" data-target="online-detail-similar-rail" data-direction="left" aria-label="Scroll similar artists left"><span class="material-symbols-rounded">arrow_back</span></button><button class="icon-btn online-shelf-more" data-action="online-scroll-rail" data-target="online-detail-similar-rail" data-direction="right" aria-label="Scroll similar artists right"><span class="material-symbols-rounded">arrow_forward</span></button></div></div><div id="online-detail-similar-rail" class="online-card-rail online-artist-rail">${renderEntityRail(e.artists,'artists')}</div></section>`:'';
        const albums=kind==='artists'&&e.albums?.length?`<section class="online-detail-albums online-artist-albums"><div class="online-shelf-heading"><h2>Albums</h2>${e.totalAlbums>e.albums.length?`<button class="text-action" data-action="online-load-artist-albums">See all</button>`:''}</div><div class="online-card-rail">${renderEntityRail(e.albums,'albums')}</div></section>`:'';
        const loadingNote=kind==='artists'&&e.loadingTracks&&tracks.length===0?'<div class="online-empty-inline">Loading top songs…</div>':'';
        const errorNote=kind==='artists'&&e.artistLoadError?'<div class="online-empty-inline">Some tracks may be missing. Try again when connected.</div>':'';
        const artistProfile=kind==='artists'?renderArtistProfile(e):'';
        const singles=kind==='artists'&&e.singles?.length?`<section class="online-artist-singles"><div class="online-shelf-heading"><h2>Singles &amp; featured tracks</h2><span class="online-section-note">${e.singles.length.toLocaleString()} tracks</span></div>${renderTrackRows(e.singles,`online-artist-singles:${activeRemoteEntity.id}`,'No singles listed.')}</section>`:'';
        const hero=`<div class="online-detail-hero ${kind==='artists'?'online-artist-detail-hero':''}"><img src="${esc(e.image||'./icons/icon-192.png')}" alt="${esc(e.title||'')}" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><div class="online-detail-copy"><div class="online-mini-label">${kind==='playlists'?'Playlist':kind==='albums'?'Album':'Artist'}</div><h2>${esc(e.title||'Collection')}</h2>${kind==='artists'&&e.description?`<div class="online-entity-subtitle online-artist-bio" id="online-artist-bio">${esc(e.description)}</div>${e.description.length>100?'<button class="online-bio-more" data-action="online-toggle-artist-bio" aria-expanded="false">Read more</button>':''}`:`<div class="online-entity-subtitle">${esc(kind==='artists'?(e.description||e.raw?.dominantLanguage||''):(e.artist||e.description||''))}</div>`}<div class="online-action-row"><button class="btn btn-primary" data-action="online-play-remote-entity">Play</button>${kind==='artists'?`<button class="btn" data-action="online-start-artist-radio" data-id="${esc(e.sourceId||e.id)}" data-name="${esc(e.title)}"><span class="material-symbols-rounded">radio</span> Artist Radio</button>`:''}${kind==='playlists'?`<button class="btn" data-action="online-save-remote-playlist">Save playlist</button>`:''}</div></div></div>`;
        const trackSection=`${artistHeading}${loadingNote}${renderTrackRows(tracks,`online-remote:${kind}:${activeRemoteEntity.id}`,kind==='artists'&&e.hasMoreTracks?'No songs loaded yet. Use Load more to retry.':'No tracks in this collection.')}${errorNote}${more}`;
        node.innerHTML=kind==='artists'?`${hero}${artistProfile}${trackSection}${albums}${singles}${similar}`:`${hero}${similar}${albums}${trackSection}`;
        UI.lazyLoadArtwork();
    };
    const loadMoreRemote = async () => {
        if(!activeRemoteEntity?.data||!navigator.onLine)return;
        const current=activeRemoteEntity.data;const {kind,id}=activeRemoteEntity;const sourceId=String(current.sourceId||id);
        try{
            let extra=[];
            if(kind==='playlists'){
                const page=Number(current.page||0)+1;
                const next=await OnlineMusic.fetchPublicPlaylist(id,{page,limit:30});extra=next.tracks||[];current.page=page;
                current.total=Math.max(Number(current.total)||0,Number(next.total)||0);
            }else if(kind==='albums'){
                const detail=await OnlineMusic.fetchAlbumDetails(id);extra=(detail.tracks||[]).slice(current.tracks.length,current.tracks.length+20);
            }else{
                const cached=readArtistTracks(sourceId);
                const cachedTracks=cached?.tracks||[];
                if(cachedTracks.length>(current.tracks||[]).length){
                    extra=cachedTracks.slice(current.tracks.length,Math.min(cachedTracks.length,current.tracks.length+ARTIST_INITIAL_TRACKS));
                    current.tracks=appendArtistTracks(current.tracks||[],extra);
                    current.total=Math.max(Number(current.total)||0,Number(cached.total)||0,current.tracks.length);
                    current.cachedTracksAvailable=cachedTracks.length;
                    current.hasMoreTracks=current.tracks.length<cachedTracks.length||!cached.complete;
                    current.artistLoadError=false;current.failedSongPages=[];
                    renderRemoteDetail();return;
                }
                const failedPages=Array.isArray(current.failedSongPages)?current.failedSongPages:[];
                const page=failedPages.includes(0)?0:Math.max(0,Number(current.songPage??-1)+1);
                const response=await OnlineMusic.fetchArtistSongs(sourceId,page,current.title);
                current.apiHasMore=Boolean(response.hasMore);
                extra=dedupeCatalogueTracks(response.tracks||[]);
                current.total=Math.max(Number(current.total)||0,Number(response.total)||0,current.tracks?.length||0);
                current.songPageSize=Math.max(1,Number(response.pageSize)||extra.length||Number(current.songPageSize)||10);
                current.songPageSizeEstimated=!response.hasTotal&&!Number(response.pageSize);
                if(!extra.length){
                    if(page>0&&!response.hasTotal&&!response.hasMore){
                        current.failedSongPages=failedPages.filter(value=>value!==page);current.hasMoreTracks=false;current.artistLoadError=false;
                        rememberArtistTracks(sourceId,current.tracks||[],current.total||current.tracks?.length||0,true);
                        renderRemoteDetail();UI.showToast('You have reached the end of this artist’s catalogue.','info');return;
                    }
                    current.failedSongPages=[...new Set([...failedPages,page])].sort((a,b)=>a-b);current.hasMoreTracks=true;current.artistLoadError=true;
                    renderRemoteDetail();UI.showToast('This page could not be loaded. Tap Load more to retry.','info');return;
                }
                current.songPage=page;current.failedSongPages=failedPages.filter(value=>value!==page);
                current.artistLoadError=false;
            }
            const merged=kind==='artists'?appendArtistTracks(current.tracks||[],extra):mergeUnique(current.tracks||[],extra,'songs');
            current.tracks=merged;current.total=Math.max(Number(current.total)||0,current.tracks.length);
            if(kind==='artists'){
                current.hasMoreTracks=current.failedSongPages?.length>0||Boolean(current.apiHasMore)||current.tracks.length<current.total;
                current.cachedTracksAvailable=current.tracks.length;
                rememberArtistTracks(sourceId,current.tracks,current.total,!current.hasMoreTracks,{page:current.songPage,pageSize:current.songPageSize,hasMore:current.hasMoreTracks});
            }
            current.loadingTracks=false;renderRemoteDetail();
        }catch(_){if(kind==='artists'){current.failedSongPages=[...new Set([...(current.failedSongPages||[]),Math.max(0,Number(current.songPage??-1)+1)])];current.hasMoreTracks=true;current.artistLoadError=true;renderRemoteDetail();}UI.showToast('More tracks could not be loaded yet.','info');}
    };
    const loadMoreArtistAlbums = async () => {
        const current=activeRemoteEntity?.data;if(!current||activeRemoteEntity.kind!=='artists'||!navigator.onLine)return;
        const id=String(current.sourceId||activeRemoteEntity.id);const page=Number(current.albumPage??-1)+1;
        try{
            const response=await OnlineMusic.fetchArtistAlbums(id,page);const incoming=response.items||[];
            const seen=new Set((current.albums||[]).map(item=>item.id));for(const album of incoming)if(album?.id&&!seen.has(album.id)){seen.add(album.id);current.albums.push(album);}
            current.albumPage=page;current.totalAlbums=Math.max(Number(current.totalAlbums)||0,Number(response.total)||0,current.albums.length);
            current.albums=current.albums.slice(0,24);artistAlbumCache.set(String(id),{savedAt:Date.now(),items:current.albums.slice()});
            renderRemoteDetail();
        }catch(_){UI.showToast('Albums could not be loaded.','info');}
    };
    const playRemoteEntity = async () => {
        const entity=activeRemoteEntity;const data=entity?.data;if(!data){UI.showToast('This collection is still loading.','info');return;}
        if(entity.kind==='artists'&&data.loadingTracks){
            UI.showToast('Loading the artist catalogue…','info');
            const pending=artistLoadPromises.get(String(data.sourceId||entity.id));if(pending)await pending;
        }
        if(activeRemoteEntity!==entity)return;
        const tracks=dedupeCatalogueTracks(data.tracks||[]);
        if(!tracks.length){UI.showToast('No playable songs in this collection.','info');return;}
        setSearchContext(tracks);Player.playContext(tracks,0);saveQueueSnapshot('online');
    };
    const saveRemotePlaylist = async () => {
        const data=activeRemoteEntity?.data;if(!data||activeRemoteEntity.kind!=='playlists')return;
        const existing=playlists.find(p=>p.remoteSourceId===String(data.sourceId));if(existing){UI.showToast('Playlist is already saved.','info');return;}
        const item={id:`online-pl-${Utils.id()}`,name:data.title,remoteSourceId:String(data.sourceId),createdAt:Date.now(),tracks:dedupePlaylistTracks(data.tracks||[]).map(serializeTrack)};
        playlists.unshift(item);persist();renderHome();renderPlaylists();UI.showToast('Playlist saved.','check_circle');
    };
    const saveQueueSnapshot = mode => {
        if (!['offline','online'].includes(mode)) return;
        const isOnline=mode==='online';
        const isLocalId=id => !OnlineMusic.isOnlineId(String(id)) && State.library.some(track=>track.id===id);
        const allIds=[...new Set([...(State.queue||[]),...(State.playbackOrder||[])])];
        if (isOnline) {
            const trackRecords=allIds.map(trackById).filter(track=>track && OnlineMusic.isOnlineTrack(track)).map(serializeTrack);
            const known=new Set(trackRecords.map(track=>track.id));
            const keep=arr=>(Array.isArray(arr)?arr:[]).filter(id=>known.has(id));
            const currentId=OnlineMusic.isOnlineId(State.currentTrackId)?State.currentTrackId:null;
            const audioElement=typeof AudioAdapter!=='undefined'?AudioAdapter.audio:null;
            const audioTime=Number(audioElement?.currentTime);
            const position=currentId&&currentId===Player.getCurrentTrack()?.id&&audioElement&&String(audioElement.dataset?.mujicTrackId||'')===String(currentId)&&Number.isFinite(audioTime)&&audioElement.readyState>0?Math.max(0,audioTime):Math.max(0,Number(State.currentTime)||0);
            const audioDuration=Number(audioElement?.duration);
            const duration=Number.isFinite(audioDuration)&&audioDuration>0?audioDuration:Math.max(0,Number(State.duration)||0);
            queueSnapshots.online={queue:keep(State.queue),playbackOrder:keep(State.playbackOrder),queueIndex:Number(State.queueIndex),currentTrackId:currentId,position,duration,wasPlaying:Boolean(State.isPlaying),tracks:trackRecords,savedAt:Date.now()};
        } else {
            const keep=arr=>(Array.isArray(arr)?arr:[]).filter(isLocalId);
            const currentId=isLocalId(State.currentTrackId)?State.currentTrackId:null;
            const audioElement=typeof AudioAdapter!=='undefined'?AudioAdapter.audio:null;
            const audioTime=Number(audioElement?.currentTime);
            const position=currentId&&currentId===Player.getCurrentTrack()?.id&&audioElement&&String(audioElement.dataset?.mujicTrackId||'')===String(currentId)&&Number.isFinite(audioTime)&&audioElement.readyState>0?Math.max(0,audioTime):Math.max(0,Number(State.currentTime)||0);
            const audioDuration=Number(audioElement?.duration);
            const duration=Number.isFinite(audioDuration)&&audioDuration>0?audioDuration:Math.max(0,Number(State.duration)||0);
            queueSnapshots.offline={queue:keep(State.queue),playbackOrder:keep(State.playbackOrder),queueIndex:Number(State.queueIndex),currentTrackId:currentId,position,duration,wasPlaying:Boolean(State.isPlaying),savedAt:Date.now()};
        }
        try { localStorage.setItem(KEYS.queues,JSON.stringify(queueSnapshots)); } catch (_) {}
    };
    const restoreQueueSnapshot = mode => {
        const snapshot=queueSnapshots[mode];
        if (!snapshot) {
            if (mode==='online') { State.queue=[]; State.playbackOrder=[]; State.queueIndex=-1; State.currentTrackId=null; document.getElementById('mini-player')?.classList.remove('visible'); UI.updatePlayPause(); UI.renderQueue(); }
            return;
        }
        let allowed;
        if (mode==='online') {
            const tracks=hydrate(snapshot.tracks||[]); allowed=new Set(tracks.map(track=>track.id));
        } else allowed=new Set(State.library.map(track=>track.id));
        const keep=arr=>(Array.isArray(arr)?arr:[]).filter(id=>allowed.has(id));
        State.queue=keep(snapshot.queue); State.playbackOrder=keep(snapshot.playbackOrder);
        if (!State.playbackOrder.length && State.queue.length) State.playbackOrder=[...State.queue];
        const snapshotCurrent=String(snapshot.currentTrackId||'');
        const currentIndex=snapshotCurrent?State.playbackOrder.indexOf(snapshotCurrent):-1;
        const savedIndex=Number(snapshot.queueIndex);
        State.queueIndex=currentIndex>=0?currentIndex:(State.playbackOrder.length && Number.isInteger(savedIndex) && savedIndex>=0 ? Math.min(savedIndex,State.playbackOrder.length-1) : -1);
        State.currentTrackId=State.queueIndex>=0 ? (State.playbackOrder[State.queueIndex] || null) : null;
        const resumePosition=Math.max(0,Number(snapshot.position)||0);
        State.currentTime=resumePosition;State.resumePosition=resumePosition;State.duration=Math.max(0,Number(snapshot.duration)||0);State.isPlaying=false;
        State.restoredPlaybackResume=State.currentTrackId?{trackId:State.currentTrackId,position:resumePosition,duration:Math.max(0,Number(snapshot.duration)||0),mode}:null;
        State.transitionFadePending=false;
        const current=Player.getCurrentTrack();
        if (current) { UI.showMiniPlayer(); UI.updatePlayerMeta(current).catch(()=>{}); }
        else if (mode==='online') document.getElementById('mini-player')?.classList.remove('visible');
        UI.updatePlayPause(); UI.renderQueue();
    };
    const beforeModeChange = (next, previous) => { if (previous) saveQueueSnapshot(previous); };
    const updateWorkspaceUI = () => {
        const linkedToggle=document.getElementById('link-workspaces-toggle');if(linkedToggle)linkedToggle.checked=linked;
        const linkStatus=document.getElementById('link-workspaces-status');if(linkStatus)linkStatus.textContent=linked?'Playlist sharing is enabled.':'Playlist sharing is disabled.';
        const shareBtn=document.getElementById('share-offline-playlist-online');if(shareBtn)shareBtn.hidden=!(linked&&State.playbackSourceMode==='offline'&&State.currentContextType==='playlist'&&State.currentPlaylistId);
        const offlineLink=document.getElementById('home-linked-online');if(offlineLink)offlineLink.hidden=true;
        if(State.playbackSourceMode==='online'){
            const active=document.querySelector('.view.active')?.id;
            if(active==='view-online-home')renderHome();
            if(active==='view-online-search'){if(document.getElementById('online-search-input')?.value?.trim())performSearch(document.getElementById('online-search-input').value);else renderSearchBlank();}
            if(active==='view-online-playlists')setLibraryTab(libraryTab);
            if(active==='view-online-history')renderHistory();
            if(active==='view-online-queue')renderQueue();
            if(active==='view-online-detail')renderRemoteDetail();
        }
    };
    const onModeChange = (mode, previous) => {
        restoreQueueSnapshot(mode);updateWorkspaceUI();
        if(mode==='online'){UI.switchView('online-home');renderHome();navigator.storage?.persist?.().catch(()=>{});renderSettings();}
        else{
            activePlaylistId=null;activeRemoteEntity=null;
            const active=document.querySelector('.view.active')?.id||'';
            if(active.startsWith('view-online-')||active==='view-context-detail')UI.switchView('home');
            else UI.switchView(active.replace('view-','')||'home');
            UI.renderHome();UI.renderLibrary();UI.renderPlaylists();
        }
    };
    const refreshActiveView = () => {
        if(State.playbackSourceMode!=='online')return;
        const active=document.querySelector('.view.active')?.id;
        if(active==='view-online-search')performSearch(document.getElementById('online-search-input')?.value||'');
        else if(active==='view-online-home'){homeLastLoaded=0;renderHome();}
        else if(active==='view-online-playlists'){publicPlaylistResults=[];setLibraryTab(libraryTab);}
        else if(active==='view-online-history')renderHistory();
        else if(active==='view-online-queue')renderQueue();
        else if(active==='view-online-detail'&&activeRemoteEntity){if(['category','radio','radio-directory'].includes(activeRemoteEntity.kind))renderRemoteDetail();else openRemoteEntity(activeRemoteEntity.kind,activeRemoteEntity.id);}
    };
    const renderActiveView = vid => {
        if(vid==='online-home')renderHome();
        if(vid==='online-search'){
            const input=document.getElementById('online-search-input');setSearchTypeUI();
            if(input?.value?.trim())performSearch(input.value);else renderSearchBlank();
        }
        if(vid==='online-playlists')setLibraryTab(libraryTab);
        if(vid==='online-history')renderHistory();
        if(vid==='online-queue')renderQueue();
        if(vid==='online-detail'&&activeRemoteEntity?.data)renderRemoteDetail();
        if(vid==='online-home')renderRadioShelf();
        if(vid==='online-artists')renderArtistExplorer();
    };
    const recordPlay = track => {
        if(!track || !OnlineMusic.isOnlineTrack(track))return;
        if(activeRadioSession){if(activeRadioSession.trackIds.has(String(track.id)))rememberRadioTrack(activeRadioSession.id,track);else activeRadioSession=null;}
        const now=Date.now(),rawArtists=track.raw?.artists?.primary||track.raw?.artists?.all||track.raw?.more_info?.artistMap?.primary_artists||[];
        const artistNames=Array.isArray(rawArtists)?rawArtists.map(item=>({name:String(item?.name||item||'').trim(),id:String(item?.id||''),image:OnlineMusic.resolveArtistArtwork?.(track.raw,item?.id,item?.name)||''})).filter(item=>item.name):[];
        if(!artistNames.length)artistNames.push(...String(track.artist||'').split(/\s*,\s*|\s+&\s+/).map(name=>({name:name.trim(),id:'',image:''})).filter(item=>item.name&&item.name.toLowerCase()!=='unknown artist'));
        for(const item of artistNames){const key=titleKey(item.name);if(!key)continue;const prev=artistStats[key]||{name:item.name,plays:0,lastPlayedAt:0,id:item.id||'',image:item.image||''};prev.name=item.name;prev.plays=(Number(prev.plays)||0)+1;prev.lastPlayedAt=now;if(item.id)prev.id=item.id;if(item.image)prev.image=item.image;artistStats[key]=prev;if(item.id){artistStats[`id:${item.id}`]={...prev};if(!artistCatalogue.some(artist=>String(artist.sourceId||'')===String(item.id)||titleKey(artist.title)===key)){artistCatalogue.push({id:`artists:${item.id}`,sourceId:String(item.id),type:'artists',title:item.name,image:item.image||'',description:''});}}}
        if(artistCatalogue.length)saveArtistCatalogue();
        onlineHistory=[serializeTrack(track),...onlineHistory.filter(t=>!sameSong(t,track))].slice(0,100);
        if(window.OnlineCache) OnlineCache.rememberTrack(track);
        recordTaste(track);
        persist(); saveQueueSnapshot('online');
        schedulePersonal();
        if(document.getElementById('view-online-history')?.classList.contains('active')||libraryTab==='history'&&document.getElementById('view-online-playlists')?.classList.contains('active')) renderHistory();
        if(libraryTab==='liked'&&document.getElementById('view-online-playlists')?.classList.contains('active'))renderLiked();
    };
    const getPlaybackContext = (context, id) => {
        let tracks=[];
        if(context==='online-search') tracks=searchResults;
        else if(String(context||'').startsWith('home:')) tracks=shelfContexts.get(context)||[];
        else if(String(context||'').startsWith('online-remote:')) tracks=shelfContexts.get(`detail:${context.split(':')[1]}:${context.split(':').slice(2).join(':')}`)||[];
        else if(String(context||'').startsWith('online-playlist:')) tracks=(playlists.find(p=>p.id===context.split(':').slice(1).join(':'))?.tracks||[]).map(trackById).filter(Boolean);
        else if(context==='online-playlist') tracks=(playlists.find(p=>p.id===activePlaylistId)?.tracks||[]).map(trackById).filter(Boolean);
        else if(context==='online-history') tracks=onlineHistory.map(trackById).filter(Boolean);
        else if(context==='online-liked') tracks=onlineFavorites.map(trackById).filter(Boolean);
        else if(context==='online-queue') tracks=(State.playbackOrder||[]).map(trackById).filter(Boolean);
        else if(activePlaylistId) tracks=(playlists.find(p=>p.id===activePlaylistId)?.tracks||[]).map(trackById).filter(Boolean);
        else if(searchResults.some(track=>track.id===id)) tracks=searchResults;
        else if(onlineHistory.some(track=>track.id===id)) tracks=onlineHistory.map(trackById).filter(Boolean);
        else tracks=searchResults.length?searchResults:onlineHistory.map(trackById).filter(Boolean);
        const selectedIndex=tracks.findIndex(t=>t.id===id);
        if(selectedIndex>0) tracks=[tracks[selectedIndex],...tracks.slice(selectedIndex+1),...tracks.slice(0,selectedIndex)];
        return tracks;
    };
    const playSearchResult = id => {
        const selected=trackById(id);if(!selected||!OnlineMusic.isOnlineTrack(selected)){UI.showToast('This search result is no longer available. Search again.','info');return false;}
        OnlineMusic.preferPrimaryMedia?.(selected);
        Player.playContext([selected],0);saveQueueSnapshot('online');return true;
    };
    const playPlaylist = id => {
        const p=playlists.find(item=>item.id===id); if(!p)return;
        p.tracks=dedupePlaylistTracks(p.tracks||[]);persist();
        const tracks=dedupeCatalogueTracks(dedupePlaylistTracks(p.tracks.map(trackById).filter(Boolean)));
        if(!tracks.length){UI.showToast('This playlist has no playable tracks yet.','info');return;}
        activePlaylistId=id; setSearchContext(tracks); Player.playContext(tracks,0); saveQueueSnapshot('online');
    };
    const createPlaylist = async (name, trackId = null) => {
        let label=String(name||'').trim();
        if(!label) label=await Dialog.show({type:'prompt',title:'New playlist',confirmText:'Create',defaultText:'My Online Mix'});
        label=String(label||'').trim(); if(!label)return null;
        const playlist={id:`online-pl-${Utils.id()}`,name:label,createdAt:Date.now(),tracks:[]};
        if(trackId){const track=trackById(trackId);if(track)playlist.tracks=dedupePlaylistTracks([serializeTrack(track)]);}
        playlists.unshift(playlist); persist(); renderPlaylists(); renderHome();
        UI.showToast(trackId?'Created playlist and added track.':'Playlist created.','playlist_add_check');
        return playlist;
    };
    const addTrackToPlaylist = (trackId, playlistId) => {
        const p=playlists.find(item=>item.id===playlistId), t=trackById(trackId); if(!p||!t)return false;
        p.tracks=dedupePlaylistTracks(p.tracks||[]);
        if(p.tracks.some(item=>sameSong(item,t))){persist();renderPlaylists();renderHome();UI.showToast(`Already in ${p.name}.`,'info');return false;}
        p.tracks.push(serializeTrack(t));p.tracks=dedupePlaylistTracks(p.tracks);
        persist(); renderPlaylists(); renderHome(); UI.showToast(`Added to ${p.name}.`,'playlist_add_check'); return true;
    };
    const openPlaylistPicker = trackId => {
        pendingTrackId=trackId;
        const c=document.getElementById('online-playlist-picker-list'); if(!c)return;
        c.innerHTML=`<button class="sheet-option" data-action="online-create-and-add"><span class="material-symbols-rounded">add</span> Create new playlist</button>` + playlists.map(p=>`<button class="sheet-option" data-action="online-add-to-playlist" data-playlist-id="${esc(p.id)}"><span class="material-symbols-rounded">queue_music</span>${esc(p.name)}<span class="sheet-option-right">${p.tracks.length}</span></button>`).join('');
        UI.showSheet('online-playlist-picker-sheet');
    };
    const shareOfflinePlaylistToOnline = async playlistId => {
        if(!linked){UI.showToast('Enable Linked workspaces in Settings first.','info');return;}
        if(State.playbackSourceMode!=='online') {
            const ok=await OnlineMusic.setMode('online'); if(!ok)return;
        }
        const playlist=State.playlists.find(p=>p.id===playlistId); if(!playlist){UI.showToast('Offline playlist not found.','error');return;}
        const offlineTracks=playlist.tracks.map(id=>State.library.find(t=>t.id===id)).filter(Boolean);
        if(!offlineTracks.length){UI.showToast('This Offline playlist contains no available local tracks.','info');return;}
        UI.showToast(`Matching ${offlineTracks.length} tracks in the streaming catalogue…`,'hourglass_empty');
        const matched=[];
        for(const local of offlineTracks.slice(0,80)){
            if(State.playbackSourceMode!=='online') break;
            try{
                const results=await OnlineMusic.search(`${local.title} ${local.artist||''}`,{background:true,limit:20});
                const title=titleKey(local.title),artist=artistKey(local.artist);
                const exact=results.find(t=>titleKey(t.title)===title && artistKey(t.artist)===artist) || results.find(t=>titleKey(t.title)===title);
                if(exact && !matched.some(t=>sameSong(t,exact))) matched.push(exact);
            }catch(_){ }
        }
        if(!matched.length){UI.showToast('No matching tracks were found in the streaming catalogue.','info');return;}
        const name=`${playlist.name} · Streaming`;
        const existing=playlists.find(p=>p.name.toLowerCase()===name.toLowerCase());
        const out=existing||{id:`online-pl-${Utils.id()}`,name,createdAt:Date.now(),tracks:[]};
        out.tracks=dedupePlaylistTracks(out.tracks||[]); matched.forEach(t=>{if(!out.tracks.some(previous=>sameSong(previous,t)))out.tracks.push(serializeTrack(t));});out.tracks=dedupePlaylistTracks(out.tracks);
        if(!existing)playlists.unshift(out); persist(); renderPlaylists(); renderHome();
        UI.showToast(`Copied ${matched.length} matches to the streaming library${matched.length<offlineTracks.length?`; ${offlineTracks.length-matched.length} unmatched`:''}.`,'check_circle');
    };
    const copyOnlinePlaylistToOffline = async playlistId => {
        if(!linked){UI.showToast('Enable Linked workspaces in Settings first.','info');return;}
        const onlinePlaylist=playlists.find(p=>p.id===playlistId); if(!onlinePlaylist)return;
        const tracks=onlinePlaylist.tracks.map(trackById).filter(Boolean), matched=[];
        for(const remote of tracks){
            const tKey=titleKey(remote.title), aKey=artistKey(remote.artist);
            const exact=State.library.find(local=>titleKey(local.title)===tKey && artistKey(local.artist)===aKey)
                || State.library.find(local=>titleKey(local.title)===tKey && tKey);
            if(exact && !matched.includes(exact.id))matched.push(exact.id);
        }
        const skipped=tracks.length-matched.length;
        if(!matched.length){UI.showToast('No matching audio files exist in your Offline library. Downloads must be added to the device library first.','info');return;}
        const name=`${onlinePlaylist.name} · Local`;
        const p={id:Utils.id(),name,tracks:matched,createdAt:Date.now(),order:State.playlists.length};
        State.playlists.unshift(p); await StorageAdapter.savePlaylist(p); UI.renderPlaylists(); UI.renderHome();
        UI.showToast(`Created Offline playlist with ${matched.length} local tracks${skipped?`; ${skipped} not in library`:''}.`,'check_circle');
    };
    const renamePlaylist = async id => {
        const p=playlists.find(item=>item.id===id);if(!p)return;
        const name=await Dialog.show({type:'prompt',title:'Rename playlist',confirmText:'Save',defaultText:p.name});
        if(name?.trim()){p.name=name.trim();persist();renderPlaylists();renderHome();}
    };
    const deletePlaylist = async id => {
        const p=playlists.find(item=>item.id===id);if(!p)return;
        const ok=await Dialog.show({type:'confirm',title:'Delete playlist?',message:`Delete “${p.name}”? Your local playlists are not affected.`,confirmText:'Delete',destructive:true});
        if(!ok)return;playlists=playlists.filter(item=>item.id!==id);if(activePlaylistId===id)activePlaylistId=null;persist();renderPlaylists();renderHome();
    };
    const setLinked = enabled => {
        linked=Boolean(enabled);try{localStorage.setItem(KEYS.linked,linked?'yes':'no');}catch(_){}
        updateWorkspaceUI(); renderHome(); UI.showToast(linked?'Workspaces linked. Playlist-copy actions are enabled.':'Workspaces separated. No playlists were changed.',linked?'check_circle':'info');
    };
    const init = () => {
        if(initialized)return;
        initialized=true;
        onlineHistory=dedupePlaylistTracks(hydrate(safeRead(KEYS.history,[]))).slice(0,100);
        onlineFavorites=dedupePlaylistTracks(hydrate(safeRead(KEYS.favorites,[]))).slice(0,500);
        artistStats=safeRead(KEYS.artistStats,{});if(!artistStats||typeof artistStats!=='object'||Array.isArray(artistStats))artistStats={};
        taste=safeRead(KEYS.taste,{parts:{}});if(!taste||typeof taste!=='object'||Array.isArray(taste))taste={parts:{}};
        trackPlays=safeRead(KEYS.trackPlays,{});if(!trackPlays||typeof trackPlays!=='object'||Array.isArray(trackPlays))trackPlays={};
        clearInterval(greetingTimer);greetingTimer=setInterval(updateGreeting,60000);
        if(navigator.serviceWorker?.ready)navigator.serviceWorker.ready.then(registration=>registration.active?.postMessage({type:'SET_CACHING',enabled:cachingEnabled()})).catch(()=>{});
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')updateGreeting();});
        if(!document.body.dataset.onlineCardKeys){
            document.body.dataset.onlineCardKeys='1';
            document.addEventListener('keydown',event=>{
                if(event.key!=='Enter'&&event.key!==' ')return;
                const target=event.target;
                if(target?.matches?.('.online-media-card[role="button"],.online-compact-row[role="button"]')){event.preventDefault();target.click();}
            });
        }
        restoreArtistCatalogue();
        if(window.OnlineRecommendations)OnlineRecommendations.seedHistory(onlineHistory.map(trackById).filter(Boolean));
        searchHistory=safeRead(KEYS.searches,[]).filter(x=>typeof x==='string').slice(0,30);
        playlists=safeRead(KEYS.playlists,[]).map(p=>({...p,tracks:dedupePlaylistTracks(hydrate(p.tracks))})).filter(p=>p.id&&p.name);
        persist();
        queueSnapshots=safeRead(KEYS.queues,{offline:null,online:null});if(!queueSnapshots||typeof queueSnapshots!=='object')queueSnapshots={offline:null,online:null};
        linked=localStorage.getItem(KEYS.linked)==='yes';restoreHomeShelves();restoreSuggest();updateGreeting();
        const input=document.getElementById('online-search-input');
        if(input&&input.dataset.bound!=='1'){
            input.dataset.bound='1';let timer;
            input.addEventListener('input',()=>{clearTimeout(timer);const clear=document.querySelector('.online-search-clear');if(clear)clear.hidden=!input.value.trim();const suggestions=document.getElementById('online-search-suggestions');if(suggestions)suggestions.hidden=input.value.trim().length>=2;if(input.value.trim().length<2){renderSearchBlank();return;}const tabs=document.querySelector('.online-search-tabs');if(tabs)tabs.hidden=false;timer=setTimeout(()=>performSearch(input.value),360);});
            input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);performSearch(input.value);}});
        }
        initBackToTop();restoreQueueSnapshot(State.playbackSourceMode==='online'?'online':'offline');updateWorkspaceUI();renderSearchHistory();setSearchTypeUI();renderSearchBlank();setLibraryTab('playlists');
    };
    const getNavViewValue = () => {
        let item=activeRemoteEntity;
        while(item?.parent)item=item.parent;
        const view=item?.returnView&&item.returnView!=='online-detail'?item.returnView:'online-home';
        return view==='online-artists'?'online-home':view;
    };
    const backFromDetail = () => {
        const current=activeRemoteEntity;
        if(current?.parent){activeRemoteEntity=current.parent;UI.switchView('online-detail');renderRemoteDetail();}
        else{activeRemoteEntity=null;UI.switchView(current?.returnView||'online-home');}
    };
    const formatMinutes = seconds => `${Math.round((Number(seconds)||0)/60)} min`;
    const formatBytes = bytes => bytes>=1073741824?`${(bytes/1073741824).toFixed(1)} GB`:bytes>=1048576?`${(bytes/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(bytes/1024))} KB`;
    const recentDayKeys = count => Array.from({length:count},(_,index)=>{const date=new Date();date.setDate(date.getDate()-index);return dayKey(date);});
    const sumDays = keys => keys.reduce((total,key)=>{const day=taste.days?.[key];if(day){total.plays+=day.plays||0;total.seconds+=day.seconds||0;}return total;},{plays:0,seconds:0});
    const getListeningStats = () => ({today:sumDays(recentDayKeys(1)),week:sumDays(recentDayKeys(7)),month:sumDays(recentDayKeys(30)),all:{plays:taste.total?.plays||0,seconds:taste.total?.seconds||0}});
    const topRows = (title, rows) => `<div class="settings-top-list-title">${esc(title)}</div>${rows.length?rows.map((row,index)=>`<div class="settings-top-row"><span class="settings-top-rank">${index+1}</span><span class="settings-top-song">${esc(row.name)}</span><span class="settings-top-count">${row.count} plays</span></div>`).join(''):'<div class="settings-top-row"><span class="settings-top-rank">—</span><span class="settings-top-song">Play some music to build your listening history.</span><span class="settings-top-count"></span></div>'}`;
    const renderSettingsStats = () => {
        const grid=document.getElementById('online-settings-stats-grid');if(!grid)return;
        const stats=getListeningStats();
        const card=(label,value)=>`<div class="settings-stat-card"><span class="stat-kicker">${label}</span><strong>${value.plays}</strong><span>${formatMinutes(value.seconds)}</span></div>`;
        grid.innerHTML=card('Today',stats.today)+card('This week',stats.week)+card('This month',stats.month)+card('All time',stats.all);
        const songs=Object.entries(trackPlays).sort((a,b)=>b[1]-a[1]).map(([id,count])=>({track:trackById(id),count})).filter(row=>row.track).slice(0,5).map(row=>({name:`${row.track.title} · ${row.track.artist||''}`,count:row.count}));
        const artists=Object.entries(artistStats).filter(([key,value])=>!key.startsWith('id:')&&value?.name&&value.plays>0).sort((a,b)=>b[1].plays-a[1].plays).slice(0,5).map(([,value])=>({name:value.name,count:value.plays}));
        const songNode=document.getElementById('online-settings-stats-top');if(songNode)songNode.innerHTML=topRows('Most played songs',songs);
        const artistNode=document.getElementById('online-settings-stats-artists');if(artistNode)artistNode.innerHTML=topRows('Top artists',artists);
        const summary=document.getElementById('online-library-summary');
        if(summary)summary.textContent=`${onlineFavorites.length} liked · ${playlists.length} playlists · ${onlineHistory.length} recently played`;
    };
    const CACHE_NAMES = ['mujic-api-v2','mujic-art-v2','mujic-media-images-v4','mujic-media-chunks-v4'];
    const cachingEnabled = () => localStorage.getItem(KEYS.caching)!=='0';
    const postToWorker = message => {
        try{navigator.serviceWorker?.controller?.postMessage(message);}catch(_){}
    };
    const getCacheInfo = async () => {
        if(!('caches' in window))return null;
        let entries=0,usage=0,quota=0;
        for(const name of CACHE_NAMES){
            if(!(await caches.has(name)))continue;
            entries+=(await (await caches.open(name)).keys()).length;
        }
        try{const estimate=await navigator.storage.estimate();usage=estimate.usage||0;quota=estimate.quota||0;}catch(_){}
        return {entries,usage,quota};
    };
    const renderSettingsCache = async () => {
        const toggle=document.getElementById('online-cache-toggle');if(toggle)toggle.checked=cachingEnabled();
        const label=document.getElementById('online-cache-usage');if(!label)return;
        const info=await getCacheInfo();
        label.textContent=info?`${info.entries.toLocaleString()} items cached${info.quota?` · ${formatBytes(info.usage)} of ${formatBytes(info.quota)} used`:''}`:'Offline caching is not available in this browser.';
    };
    const setCaching = enabled => {
        localStorage.setItem(KEYS.caching,enabled?'1':'0');
        postToWorker({type:'SET_CACHING',enabled});
        UI.showToast(enabled?'Streaming data will be cached for faster, offline-friendly use.':'Streaming data caching turned off.','info');
    };
    const clearAllCaches = async () => {
        OnlineMusic.clearCache();
        if('caches' in window)await Promise.all(CACHE_NAMES.map(name=>caches.delete(name).catch(()=>false)));
        postToWorker({type:'CLEAR_ONLINE_MEDIA_CACHE'});
        await renderSettingsCache();
    };
    const resetTaste = async () => {
        const confirmed=await Dialog.show({type:'confirm',title:'Reset listening profile',message:'Quick Picks and Suggested for You will start fresh. Liked songs, playlists and history are kept.',confirmText:'Reset'});
        if(!confirmed)return;
        taste={parts:{}};trackPlays={};suggestState={sig:'',items:[],savedAt:0,loading:''};
        artistStats={};
        persistTaste();persist();
        try{localStorage.removeItem(KEYS.suggest);}catch(_){}
        renderSettingsStats();renderHomePersonal();refreshSuggestions(true);refreshQuickPicks(true);
        UI.showToast('Listening profile reset.','check_circle');
    };
    const exportStreamingLibrary = () => {
        const payload={app:'Mujic',type:'mujic-streaming-library',version:1,exportedAt:new Date().toISOString(),favorites:onlineFavorites.map(serializeTrack),history:onlineHistory.map(serializeTrack),playlists:playlists.map(playlist=>({...playlist,tracks:(playlist.tracks||[]).map(serializeTrack)})),trackPlays,taste};
        const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
        const link=document.createElement('a');
        link.href=url;link.download=`mujic-streaming-library-${dayKey()}.json`;
        document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        UI.showToast('Streaming library exported.','check_circle');
    };
    const importStreamingLibrary = data => {
        const known=new Set(onlineFavorites.map(track=>track.id));
        hydrate((data.favorites||[]).slice(0,2000)).forEach(track=>{if(!known.has(track.id)){onlineFavorites.push(track);known.add(track.id);}});
        const seen=new Set(onlineHistory.map(track=>track.id));
        hydrate((data.history||[]).slice(0,200)).forEach(track=>{if(!seen.has(track.id)){onlineHistory.push(track);seen.add(track.id);}});
        const names=new Set(playlists.map(playlist=>playlist.id));
        (Array.isArray(data.playlists)?data.playlists.slice(0,200):[]).forEach(entry=>{
            const name=String(entry?.name||'').trim().slice(0,80);
            if(!name||names.has(entry.id))return;
            playlists.push({id:String(entry.id||`online-pl-${Utils.id()}`),name,createdAt:Number(entry.createdAt)||Date.now(),tracks:hydrate((entry.tracks||[]).slice(0,1000))});
        });
        if(data.trackPlays&&typeof data.trackPlays==='object')Object.entries(data.trackPlays).slice(0,400).forEach(([id,count])=>{if(Number.isFinite(Number(count)))trackPlays[id]=Math.max(trackPlays[id]||0,Number(count));});
        persist();persistTaste();
        renderPlaylists();renderLiked();renderHistory();renderHomePersonal();renderSettingsStats();
        UI.showToast('Streaming library imported.','check_circle');
    };
    const renderSettings = () => {
        if(State.playbackSourceMode!=='online')return;
        renderSettingsStats();
        renderSettingsCache();
    };
    const scrollerOf = () => {
        const main=document.getElementById('main-content');
        if(main&&main.scrollHeight>main.clientHeight+4&&getComputedStyle(main).overflowY!=='visible')return main;
        return document.scrollingElement||document.documentElement;
    };
    const scrollToTop = () => {
        const behavior=document.body.classList.contains('reduced-motion')?'auto':'smooth';
        scrollerOf().scrollTo({top:0,behavior});
        window.scrollTo({top:0,behavior});
    };
    const jumpTo = id => {
        const el=document.getElementById(id);if(!el||el.hidden)return;
        el.scrollIntoView({behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth',block:'start'});
    };
    const handleNavRetap = view => {
        const active=document.querySelector('.view.active')?.id||'';
        if(active==='view-online-detail'&&State.playbackSourceMode==='online'&&getNavViewValue()===view){backFromDetail();return true;}
        if(active===`view-${view}`){scrollToTop();return true;}
        return false;
    };
    const initBackToTop = () => {
        const button=document.getElementById('online-back-top');if(!button||button.dataset.bound==='1')return;
        button.dataset.bound='1';
        let frame=0;
        const check=()=>{
            frame=0;
            const active=document.querySelector('.view.active');
            const online=State.playbackSourceMode==='online'&&active?.classList.contains('online-workspace-view');
            const top=Math.max(scrollerOf().scrollTop||0,window.scrollY||0);
            button.classList.toggle('visible',Boolean(online&&top>700));
        };
        document.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(check);},{passive:true,capture:true});
        button.addEventListener('click',scrollToTop);
    };
    const getPlaylists = () => playlists.slice();
    const getPendingTrackId = () => pendingTrackId;
    const backToPlaylists = () => { activePlaylistId=null; renderPlaylists(); };
    const getOnlineHistory = () => onlineHistory.map(trackById).filter(Boolean);
    const getSearchResults = () => searchResults.slice();
    window.OnlineWorkspace={init,performSearch,loadMore,renderSearchBlank,renderHome,renderPlaylists,renderHistory,renderQueue,renderLiked,renderConnectivityState,updateWorkspaceUI,onModeChange,beforeModeChange,refreshActiveView,renderActiveView,recordPlay,getPlaybackContext,shiftHomeArtistWall,playSearchResult,playPlaylist,showAllArtists:()=>UI.switchView('online-artists'),sortArtists,createPlaylist,addTrackToPlaylist,openPlaylistPicker,getPendingTrackId,openPlaylist,backToPlaylists,clearHistory,clearQueue,shareOfflinePlaylistToOnline,copyOnlinePlaylistToOffline,renamePlaylist,deletePlaylist,setLinked,getPlaylists,getOnlineHistory,getSearchResults,rememberSearch,removeSearchHistory,saveQueueSnapshot,setSearchType,openRemoteEntity,openCurrentArtist,openReference,loadMoreRemote,loadMoreArtistAlbums,playRemoteEntity,getNavView:getNavViewValue,saveRemotePlaylist,loadPublicPlaylists,setLibraryTab,openLibraryTab,toggleFavorite,isFavorite,openCategory,openRadioDirectory,openRadioStation,startRadio,startArtistRadio,extendRadioQueue,playCategory,loadMoreCategory,isRadioActive:()=>Boolean(activeRadioSession&&State.playbackSourceMode==='online'),getPlaybackLabel,filterSearchType:(type)=>{searchType=type;setSearchTypeUI();},playTrackFromShelf:(id,context)=>{const list=shelfContexts.get(context)||[];const ix=list.findIndex(t=>t.id===id);if(ix>=0){const ordered=[...list.slice(ix),...list.slice(0,ix)];setSearchContext(list);Player.playContext(ordered,0);}else{const t=trackById(id);if(t)Player.playContext([t],0);}},clearSearch:()=>{searchQuery='';searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;visibleSearchCount=8;searchHasMore=false;const input=document.getElementById('online-search-input');if(input)input.value='';const clear=document.querySelector('.online-search-clear');if(clear)clear.hidden=true;renderSearchBlank();},backFromDetail,openLikedFromHome,renderSettings,renderSettingsStats,renderSettingsCache,setCaching,clearAllCaches,resetTaste,exportStreamingLibrary,importStreamingLibrary,getListeningStats,updateGreeting,jumpTo,handleNavRetap,scrollToTop,schedulePersonal,renderHomePersonal,getLanguagePreference};
})();
