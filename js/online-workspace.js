/* Dedicated online workspace: separate search history, listening history, queues and playlists.
 * It shares the visual language of Mujic but never mixes cloud IDs into the offline library.
 */
(() => {
    const KEYS = { history:'mujic-online-history-v1', searches:'mujic-online-searches-v1', playlists:'mujic-online-playlists-v1', favorites:'mujic-online-favorites-v1', linked:'mujic-workspaces-linked-v1', queues:'mujic-workspace-queues-v1', shelves:'mujic-online-shelves-v8', publicPlaylists:'mujic-online-public-playlists-v1', artistCache:'mujic-online-artist-cache-v6', artistCatalogue:'mujic-online-artist-catalogue-v4', artistStats:'mujic-online-artist-stats-v1' };
    let onlineHistory = [], searchHistory = [], playlists = [], onlineFavorites = [], searchQuery = '', searchPage = 0, searchType = 'all';
    let searchResults = [], entityResults = [], allSearchResults = null, activePlaylistId = null, pendingTrackId = null, requestSequence = 0;
    let libraryTab = 'playlists', remoteRequestSequence = 0, artistAlbumsPage = 0, artistAlbumsHasMore = false;
    let linked = false, queueSnapshots = {offline:null, online:null};
    let artistCatalogue = [], artistCataloguePromise = null, artistSortMode = 'recommended', artistStats = {}, homeArtistWallOffset = 0; 
    const shelfContexts = new Map();
    let homeShelves = {}, homeLoadPromise = null, homeLastLoaded = 0, publicPlaylistQuery = 'Hindi romantic', publicPlaylistPage = 0, publicPlaylistResults = [], activeRemoteEntity = null, remotePage = 0;
    const artistTrackCache = new Map(), artistAlbumCache = new Map(), artistLoadPromises = new Map();
    const safeRead = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback; } catch (_) { return fallback; } };
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
        // Older Online likes/playlists sometimes saved the namespaced ID but omitted onlineTrackId.
        // Recover that ID before hydrating so existing liked songs remain visible after upgrades.
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
    const saveHistory = () => persist();
    const rememberSearch = q => {
        const value = String(q||'').trim(); if (!value) return;
        searchHistory = [value, ...searchHistory.filter(x => String(x).toLowerCase() !== value.toLowerCase())].slice(0,30); persist(); renderSearchHistory();
    };
    const renderSearchHistory = () => {
        const el = document.getElementById('online-recent-searches'); if (!el) return;
        el.innerHTML = searchHistory.slice(0,8).map(q => `<button type="button" class="online-chip" data-action="online-search-query" data-query="${esc(q)}">${esc(q)}</button>`).join('');
    };
    const renderTrackRows = (tracks, context, emptyText='Nothing here yet.') => {
        const list = (Array.isArray(tracks) ? tracks : []).filter(Boolean);
        if (!list.length) return `<div class="online-empty-inline">${esc(emptyText)}</div>`;
        return `<div class="track-list">${list.map(t => UI.buildTrackRow(t, context)).join('')}</div>`;
    };
    // Keep Online search results private to this workspace; State.searchResults belongs to Offline search.
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
        const chips = recent.map(q=>`<button type="button" class="online-chip" data-action="online-search-query" data-query="${esc(q)}">${esc(q)}</button>`).join('');
        c.innerHTML = `<div class="online-search-start">${chips ? `<div class="online-mini-label">Recently Searched</div><div class="online-chip-list">${chips}</div>` : ''}<div class="online-mini-label">Browse Categories</div><div class="online-category-grid"><button class="online-category-card category-bollywood" data-action="online-search-query" data-query="Hindi hits"><strong>Bollywood</strong></button><button class="online-category-card category-punjabi" data-action="online-search-query" data-query="Punjabi love songs"><strong>Punjabi</strong></button><button class="online-category-card category-tamil" data-action="online-search-query" data-query="Tamil hits"><strong>Tamil</strong></button><button class="online-category-card category-telugu" data-action="online-search-query" data-query="Telugu romantic songs"><strong>Telugu</strong></button><button class="online-category-card category-lofi" data-action="online-search-query" data-query="Lo-fi chill"><strong>Lo-fi</strong></button><button class="online-category-card category-indie" data-action="online-search-query" data-query="Indian indie songs"><strong>Indie</strong></button></div></div>`;
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
        const data=allSearchResults||{topQuery:[],albums:[],artists:[],playlists:[]};
        const uniq=list=>{
            const seen=new Set();return (Array.isArray(list)?list:[]).filter(item=>item?.id&&!seen.has(item.id)&&seen.add(item.id));
        };
        const tracks=searchResults.slice(0,24);
        const renderShelf=(kind,label,items)=>{
            const list=uniq(items).slice(0,10);if(!list.length)return '';
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
        if(hasMore)html+=`<div class="online-load-more-wrap"><button class="btn" data-action="online-load-more">Load more songs</button></div>`;
        target.innerHTML=html;
        if(window.OnlineCache)OnlineCache.warmTracks(searchResults.slice(0,50));
        UI.lazyLoadArtwork();
    };
    const paintSearchResults = (q, total = 0, hasMore = false) => {
        const target=document.getElementById('online-search-results');if(!target)return;
        if(searchType==='all'){renderAllSearchResults(q,hasMore);return;}
        const list=searchType==='songs'?searchResults:entityResults;
        const count=String(list.length.toLocaleString());
        let body='';
        if(searchType==='songs') body=renderTrackRows(list,'online-search',`No results for “${q}”.`);
        else body=renderEntityGrid(list,searchType,'Search to discover more.');
        const more=hasMore?'<div class="online-load-more-wrap"><button class="btn" data-action="online-load-more">Load more</button></div>':'';
        target.innerHTML=`<div class="online-results-toolbar"><strong>${esc(count)} ${searchTypeLabels[searchType].toLowerCase()}</strong></div>${body}${more}`;
        if(searchType==='songs') { setSearchContext(searchResults); if(window.OnlineCache)OnlineCache.warmTracks(searchResults.slice(0,50)); }
        UI.lazyLoadArtwork();
    };
    const performSearch = async (query, append = false) => {
        const input=document.getElementById('online-search-input');
        const target=document.getElementById('online-search-results');if(!target)return [];
        const q=String(query ?? input?.value ?? '').trim();
        if(!q){searchQuery='';searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;renderSearchBlank();return [];}
        if(State.playbackSourceMode!=='online')return [];
        if(!navigator.onLine){renderConnectivityState();return [];}
        if(!append){searchQuery=q;searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;const requestId=++requestSequence;target.dataset.requestId=String(requestId);target.innerHTML='<div class="online-skeleton-list"><span></span><span></span><span></span><span></span><span></span></div>';rememberSearch(q);}
        else if(q!==searchQuery)return [];
        const requestId=Number(target.dataset.requestId||requestSequence);
        const initialPage=append?searchPage+1:0;
        const targetCount=append?0:24;
        const maxPages=append?1:8;
        let page=initialPage,lastHasMore=false,total=0,newForLastPage=0;
        try{
            if(!append&&searchType==='all'){
                try{allSearchResults=await OnlineMusic.globalSearch(q);}catch(_){
                    const [artists,albums,playlists]=await Promise.all(['artists','albums','playlists'].map(kind=>OnlineMusic.searchEntities(kind,q,{page:0,limit:20}).catch(()=>({items:[]}))));
                    allSearchResults={topQuery:[],artists:artists.items||[],albums:albums.items||[],playlists:playlists.items||[]};
                }
                if(requestId!==Number(target.dataset.requestId||requestId)||State.playbackSourceMode!=='online')return [];
            }
            for(let turn=0;turn<maxPages;turn++,page++){
                if(requestId!==Number(target.dataset.requestId||requestId)||State.playbackSourceMode!=='online')return [];
                let found=[],hasMore=false,reportedTotal=0;
                if(searchType==='songs'||searchType==='all'){
                    found=await OnlineMusic.search(q,{page,limit:40});
                    if(searchType==='all'&&turn===0&&Array.isArray(allSearchResults?.songs))found=[...allSearchResults.songs,...found];
                    const meta=found.searchMeta||OnlineMusic.getSearchMeta();hasMore=Boolean(meta.hasMore);reportedTotal=Number(meta.total)||0;
                    const merged=mergeUnique(append||turn>0?searchResults:[],found,'songs');searchResults=merged.items;newForLastPage=merged.added;
                    if(searchType==='all')searchResults=dedupeCatalogueTracks(searchResults);
                    setSearchContext(searchResults);
                }else{
                    const result=await OnlineMusic.searchEntities(searchType,q,{page,limit:30});
                    found=result.items||[];hasMore=Boolean(result.hasMore);reportedTotal=Number(result.total)||0;
                    const merged=mergeUnique(append||turn>0?entityResults:[],found,searchType);entityResults=merged.items;newForLastPage=merged.added;
                }
                total=Math.max(total,reportedTotal);lastHasMore=hasMore;searchPage=page;
                if(requestId!==Number(target.dataset.requestId||requestId)||State.playbackSourceMode!=='online')return [];
                const currentList=searchType==='songs'||searchType==='all'?searchResults:entityResults;
                if(append||currentList.length>=targetCount||!hasMore||!found.length||newForLastPage===0)break;
                if(turn===maxPages-1)lastHasMore=true;
            }
            if(requestId!==Number(target.dataset.requestId||requestId)||State.playbackSourceMode!=='online')return [];
            paintSearchResults(q,total,lastHasMore&&newForLastPage>0&&searchPage<100);
            return searchType==='songs'||searchType==='all'?searchResults:entityResults;
        }catch(error){
            if(State.playbackSourceMode!=='online'||requestId!==Number(target.dataset.requestId||requestId))return [];
            target.innerHTML=`<div class="online-network-state"><span class="material-symbols-rounded">${navigator.onLine?'cloud_off':'wifi_off'}</span><div class="empty-title">${navigator.onLine?'Search unavailable':'No connection'}</div><div class="online-network-actions"><button class="btn" data-action="retry-online-search">Retry</button><button class="btn" data-action="toggle-playback-mode">Offline library</button></div></div>`;
            return [];
        }
    };
    const loadMore = () => performSearch(searchQuery || document.getElementById('online-search-input')?.value || '', true);
    const HOME_TTL = 12 * 60 * 60 * 1000;
    const HOME_DEFS = [
        {key:'romantic',kind:'playlists',query:'Hindi romantic playlists',node:'online-shelf-romantic'},
        {key:'trending',kind:'songs',query:'trending Hindi songs',node:'online-shelf-trending'},
        {key:'quick',kind:'songs',query:'',node:'online-shelf-quick'},
        {key:'englishHits',kind:'songs',query:'English hits',node:'online-shelf-english-hits'},
        {key:'suggested',kind:'songs',query:'Arijit Singh romantic songs',node:'online-shelf-suggested'},
        {key:'hits',kind:'songs',query:'Hindi hits',node:'online-shelf-hits'},
        {key:'punjabi',kind:'playlists',query:'Punjabi love songs',node:'online-shelf-punjabi'},
        {key:'albums',kind:'albums',query:'Arijit Singh',node:'online-shelf-albums'},
        {key:'forYouArtists',kind:'artists',query:'',node:'online-shelf-for-you-artists'}
    ];
    const safeEntity = item => ({id:String(item.id||''),sourceId:String(item.sourceId||''),type:String(item.type||''),title:String(item.title||''),artist:String(item.artist||''),image:String(item.image||''),description:String(item.description||''),year:String(item.year||''),language:String(item.language||''),songCount:Number(item.songCount||0),playCount:Number(item.playCount||0)});
    const cacheHomeShelves = () => { try { localStorage.setItem(KEYS.shelves,JSON.stringify({savedAt:Date.now(),shelves:Object.fromEntries(Object.entries(homeShelves).map(([key,val])=>[key,{kind:val.kind,items:(val.items||[]).map(item=>val.kind==='songs'?serializeTrack(item):safeEntity(item))}]))})); } catch (_) {} };
    const restoreHomeShelves = () => {
        const stored=safeRead(KEYS.shelves,null);if(!stored?.shelves)return false;
        homeShelves={};
        for(const [key,value] of Object.entries(stored.shelves)){
            const restored=(value.items||[]).map(item=>value.kind==='songs'?restoreTrack(item):item).filter(Boolean);homeShelves[key]={kind:value.kind,items:value.kind==='songs'?dedupeCatalogueTracks(restored):restored};
        }
        homeLastLoaded=Number(stored.savedAt)||0;return true;
    };
    const renderTrackCards = (tracks, context, emptyText='') => {
        const items=(tracks||[]).filter(Boolean).slice(0,40);if(!items.length)return emptyText?`<div class="online-empty-inline">${esc(emptyText)}</div>`:'';
        shelfContexts.set(context,items);
        return `${items.map(t=>`<div class="online-media-card-shell"><button class="online-media-card" data-action="online-play-track" data-id="${esc(t.id)}" data-context="${esc(context)}"><span class="online-media-art"><img loading="lazy" decoding="async" src="${esc(t.artworkUrl||'')||'./icons/icon-192.png'}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-card-play material-symbols-rounded">play_arrow</span></span><span class="online-media-title">${esc(t.title)}</span><span class="online-media-subtitle">${esc(t.artist||'')}</span></button><div class="online-media-actions"><button type="button" class="online-media-action" data-action="online-open-track-playlist" data-id="${esc(t.id)}" aria-label="Add ${esc(t.title)} to a playlist" title="Add to playlist"><span class="material-symbols-rounded">playlist_add</span></button><button type="button" class="online-media-action" data-action="online-download-track" data-id="${esc(t.id)}" aria-label="Download ${esc(t.title)}" title="Download highest-quality AAC"><span class="material-symbols-rounded">download</span></button><button type="button" class="online-media-action online-media-more" data-action="track-options" data-id="${esc(t.id)}" aria-label="More actions for ${esc(t.title)}" title="More actions"><span class="material-symbols-rounded">more_horiz</span></button></div></div>`).join('')}`;
    };
    const renderEntityGrid = (items, kind, emptyText='') => {
        if(!items?.length)return emptyText?`<div class="online-empty-inline">${esc(emptyText)}</div>`:'';
        if(kind==='artists')return `<div class="online-entity-grid online-artist-grid">${items.map(item=>{
            const title=item.title||item.name||'Artist';
            const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
            const image=item.image&&!OnlineMusic.isGenericArtistArtwork?.(item.image)?item.image:'';
            const id=item.sourceId||String(item.id||'').split(':').slice(1).join(':');
            return `<button class="online-entity-card is-artist" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}"><span class="online-entity-art online-artist-grid-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials||'♪')}</span>${image?`<img loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-entity-art').classList.add('has-no-art')">`:''}</span><span class="online-entity-title">${esc(title)}</span></button>`;
        }).join('')}</div>`;
        return `<div class="online-entity-grid">${items.map(item=>`<button class="online-entity-card" data-action="online-open-entity" data-type="${esc(kind)}" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}"><span class="online-entity-art"><img loading="lazy" decoding="async" src="${esc(item.image||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"></span><span class="online-entity-title">${esc(item.title||item.name||'Untitled')}</span><span class="online-entity-subtitle">${esc(item.artist||item.description||((item.songCount||item.total)?`${item.songCount||item.total} songs`:''))}</span></button>`).join('')}</div>`;
    };
    const renderEntityRail = (items, kind) => {
        const list=(items||[]).filter(Boolean).slice(0,40);if(!list.length)return '';
        if(kind==='artists')return `${list.map(item=>{const title=item.title||'Artist';const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();const image=item.image&&!OnlineMusic.isGenericArtistArtwork?.(item.image)?item.image:'';return `<button class="online-artist-card" data-action="online-open-entity" data-type="artists" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}" aria-label="Open artist ${esc(title)}"><span class="online-artist-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials||'♪')}</span>${image?`<img loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.closest('.online-artist-orb').classList.add('has-no-art');this.remove()">`:''}</span><span class="online-artist-name">${esc(title)}</span></button>`;}).join('')}`;
        return `${list.map(item=>`<button class="online-media-card" data-action="online-open-entity" data-type="${esc(kind)}" data-id="${esc(item.sourceId||String(item.id||'').split(':').slice(1).join(':'))}"><span class="online-media-art"><img loading="lazy" decoding="async" src="${esc(item.image||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"></span><span class="online-media-title">${esc(item.title||'Untitled')}</span><span class="online-media-subtitle">${esc(item.description||((item.songCount||item.total)?`${item.songCount||item.total} songs`:''))}</span></button>`).join('')}`;
    };
    const renderUserPlaylistCards = list => {
        const items=(list||[]).filter(Boolean);
        const likedCard=`<article class="online-user-playlist-card"><button class="online-media-card" data-action="online-open-liked-from-home"><span class="online-media-art online-liked-home-art"><span class="material-symbols-rounded">favorite</span></span><span class="online-media-title">Liked Songs</span><span class="online-media-subtitle">${onlineFavorites.length} tracks</span></button></article>`;
        const cards=items.map(playlist=>{
            const cover=playlist.tracks?.[0]||null;
            return `<article class="online-user-playlist-card"><button class="online-media-card" data-action="online-open-playlist" data-id="${esc(playlist.id)}"><span class="online-media-art"><img loading="lazy" decoding="async" src="${esc(cover?.artworkUrl||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><span class="online-card-play material-symbols-rounded">play_arrow</span></span><span class="online-media-title">${esc(playlist.name)}</span><span class="online-media-subtitle">${Number(playlist.tracks?.length)||0} songs</span></button></article>`;
        }).join('');
        return likedCard+cards;
    };
    const renderShelfItem = (definition, items) => {
        const wrap=document.getElementById(definition.key==='artists'?'online-shelf-artists-wrap':`${definition.node}-wrap`);const node=document.getElementById(definition.node);if(!node)return;
        let list=(items||[]).filter(Boolean);
        if(definition.key==='artists')list=rankArtistItems(list,'recommended').slice(0,12);
        if(definition.key==='forYouArtists')list=rankArtistItems(list,'recommended').slice(0,12);
        if(wrap)wrap.hidden=!list.length;
        if(definition.kind==='songs')node.innerHTML=renderTrackCards(list,`home:${definition.key}`);
        else node.innerHTML=renderEntityRail(list,definition.kind);
        UI.lazyLoadArtwork();
    };
    const collectTrackPages = async query => {
        if(!navigator.onLine||State.playbackSourceMode!=='online')return [];
        try {
            const batch=await OnlineMusic.search(query,{page:0,limit:16,background:true});
            return dedupeCatalogueTracks(batch).slice(0,12);
        } catch (_) { return []; }
    };
    const collectEntityPages = async (kind,query) => {
        if(!navigator.onLine||State.playbackSourceMode!=='online')return [];
        try {
            const result=await OnlineMusic.searchEntities(kind,query,{page:0,limit:12});
            return (result.items||[]).slice(0,12);
        } catch (_) { return []; }
    };
    const HOME_ARTIST_QUERIES = [
        'Arijit Singh','Shreya Ghoshal','Sonu Nigam','Neha Kakkar','Kumar Sanu','Udit Narayan','Sunidhi Chauhan','Shaan','Alka Yagnik','KK',
        'Atif Aslam','Jubin Nautiyal','Armaan Malik','Pritam','Badshah','Diljit Dosanjh','Sidhu Moose Wala','AP Dhillon','Karan Aujla','Guru Randhawa',
        'Yo Yo Honey Singh','A R Rahman','Lata Mangeshkar','Kishore Kumar','Mohammed Rafi','Asha Bhosle','B Praak','Shankar Mahadevan','Mohit Chauhan','Mika Singh',
        'Rahat Fateh Ali Khan','Kailash Kher','Sukhwinder Singh','Taylor Swift','The Weeknd','Billie Eilish','Ed Sheeran','Justin Bieber','Dua Lipa','Adele'
    ];
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
            const queryAllowance=Math.max(0,targetCount-selected.length+4);
            const queues=HOME_ARTIST_QUERIES.filter(q=>!cachedNames.has(titleKey(q))).slice(0,queryAllowance);
            for(let offset=0;offset<queues.length;offset+=5){
                if(!navigator.onLine||State.playbackSourceMode!=='online'||selected.length>=targetCount)break;
                const batch=queues.slice(offset,offset+Math.min(5,targetCount-selected.length));
                const results=await Promise.all(batch.map(async query=>{
                    let items=[];try{const page=await OnlineMusic.searchEntities('artists',query,{page:0,limit:10});items=page.items||[];}catch(_){}
                    if(!findArtistMatch(items,query)&&targetCount>=24){try{const global=await OnlineMusic.globalSearch(query);items=[...items,...(global.artists||[])];}catch(_) {}}
                    return {query,items};
                }));
                for(const result of results)accept(findArtistMatch(result.items,result.query),result.query);
                artistCatalogue=selected.slice();onProgress?.(rankArtistItems(artistCatalogue).slice(0,targetCount));
            }
            // Only the full-directory view may broaden discovery. Home stays light and responsive.
            if(selected.length<targetCount&&targetCount>=24&&navigator.onLine&&State.playbackSourceMode==='online'){
                for(const query of ['international pop artists','popular Indian artists']){
                    if(selected.length>=targetCount)break;
                    try{
                        const page=await OnlineMusic.searchEntities('artists',query,{page:0,limit:30});
                        for(const item of page.items||[]){
                            const title=String(item.title||'');if(!item?.sourceId||!title||isNonArtistRawType(item)||/\b(?:playlist|mix|collection|compilation|singer rights|various artists|official audio|song collection|album collection|official video)\b/i.test(title))continue;
                            const name=titleKey(title),id=String(item.sourceId);if(seenIds.has(id)||seenNames.has(name)||name.length<2)continue;
                            seenIds.add(id);seenNames.add(name);selected.push({...item,image:hasRealArtistImage(item)?item.image:''});
                            if(selected.length>=targetCount)break;
                        }
                    }catch(_){}
                    artistCatalogue=selected.slice();onProgress?.(rankArtistItems(artistCatalogue).slice(0,targetCount));
                }
            }
            // Recover a few featured portraits from profile metadata only; leave remaining portraits lazy/fallback.
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
    const renderArtistMosaic = (items,nodeId='online-artists-feature-mosaic',offset=0) => {
        const node=document.getElementById(nodeId);if(!node)return;
        // ListenFree-style artist wall: cropped edge portraits, one featured portrait, and a 2×2 cluster.
        const source=uniqueArtistItems(items);
        const start=source.length?((Number(offset)||0)%source.length):0;
        const rotated=start?[...source.slice(start),...source.slice(0,start)]:source;
        const list=rotated.slice(0,7);
        const card=(item,index)=>{
            const title=String(item?.title||'Artist'),id=String(item?.sourceId||item?.id||'').replace(/^(?:saavn|machhar):/,''),image=hasRealArtistImage(item)?item.image:'';
            const initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'♪';
            const placement=index===0?'artist-edge-left':index===1?'is-featured':index===6?'artist-edge-right':`mosaic-${index-1}`;
            return `<button class="online-artist-mosaic-card ${placement}" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}" aria-label="Open ${esc(title)}"><span class="online-artist-mosaic-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials)}</span>${image?`<img loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-artist-mosaic-orb').classList.add('has-no-art')">`:''}</span><span class="online-artist-mosaic-name">${esc(title)}</span></button>`;
        };
        node.innerHTML=list.length?list.map(card).join(''):'<div class="online-empty-inline">Artists will appear as the catalogue loads.</div>';
    };
    const renderArtistDirectory = () => {
        const node=document.getElementById('online-artists-directory');if(!node)return;
        const list=rankArtistItems(artistCatalogue,artistSortMode);
        const total=document.getElementById('online-artists-total');if(total)total.textContent=`${list.length} artists`;
        document.querySelectorAll('.online-artist-sort [data-sort]').forEach(button=>button.classList.toggle('active',button.dataset.sort===artistSortMode));
        node.innerHTML=list.length?`<div class="online-artist-directory-grid">${list.map(item=>{const title=item.title||'Artist',id=String(item.sourceId||item.id||'').replace(/^(?:saavn|machhar):/,''),image=hasRealArtistImage(item)?item.image:'',initials=title.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'♪',st=artistStatFor(item);return `<button class="online-artist-directory-card" data-action="online-open-entity" data-type="artists" data-id="${esc(id)}"><span class="online-artist-directory-orb"><span class="online-artist-placeholder" aria-hidden="true">${esc(initials)}</span>${image?`<img loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(title)}" onerror="this.onerror=null;this.remove();this.closest('.online-artist-directory-orb').classList.add('has-no-art')">`:''}</span><span class="online-artist-directory-name">${esc(title)}</span><span class="online-artist-directory-meta">${st?.plays?`${st.plays} plays`:st?.lastPlayedAt?'Played recently':'Artist'}</span></button>`;}).join('')}</div>`:'<div class="online-empty-inline">No artists have loaded yet. Check your connection and retry Home.</div>';
        renderArtistMosaic(list,'online-artists-feature-mosaic');UI.lazyLoadArtwork();
    };
    const renderArtistExplorer = async () => {
        if(artistCatalogue.length)renderArtistDirectory();
        try{await collectHomeArtists(items=>{artistCatalogue=items.slice();renderArtistDirectory();},40);}catch(_){}
        renderArtistDirectory();
    };
    const sortArtists = mode => {artistSortMode=['recommended','recent','popular','alpha'].includes(mode)?mode:'recommended';renderArtistDirectory();};
    const shiftHomeArtistWall = direction => {const source=homeShelves.artists?.items||artistCatalogue;if(!source.length)return;homeArtistWallOffset=(homeArtistWallOffset+(direction==='left'?-1:1)+source.length)%source.length;renderArtistMosaic(source,'online-home-artists-mosaic',homeArtistWallOffset);UI.lazyLoadArtwork();};
    const collectSuggestedTracks = async () => {
        const recent=onlineHistory.map(trackById).find(Boolean) || (OnlineMusic.isOnlineTrack(Player.getCurrentTrack())?Player.getCurrentTrack():null);
        if(recent&&window.OnlineRecommendations?.getCandidates){
            try{
                const candidates=await OnlineRecommendations.getCandidates(recent,12);
                const filtered=dedupeCatalogueTracks(candidates).filter(track=>!OnlineRecommendations.isSameRecording(track,recent));
                if(filtered.length>=4)return filtered.slice(0,12);
            }catch(_){}
        }
        try{
            const first=await OnlineMusic.search('Arijit Singh romantic songs',{page:0,limit:40,background:true});
            const deduped=dedupeCatalogueTracks(first);
            if(deduped.length>=4)return deduped.slice(0,12);
        }catch(_){}
        try{return dedupeCatalogueTracks(await OnlineMusic.fetchTrending()).slice(0,12);}catch(_){return [];}
    };
    const loadHomeShelves = async (force=false) => {
        if(homeLoadPromise)return homeLoadPromise;
        if(!navigator.onLine||State.playbackSourceMode!=='online')return;
        if(!force&&homeLastLoaded&&Date.now()-homeLastLoaded<HOME_TTL&&Object.keys(homeShelves).length>=4)return;
        homeLoadPromise=(async()=>{
            const loadingFallback=document.getElementById('online-home-fallback');if(loadingFallback)loadingFallback.hidden=true;
            await Promise.all(HOME_DEFS.filter(def=>!['artists','forYouArtists','quick'].includes(def.key)).map(async def=>{
                try{const items=def.key==='suggested'?await collectSuggestedTracks():(def.kind==='songs'?await collectTrackPages(def.query):await collectEntityPages(def.kind,def.query));if(items.length)homeShelves[def.key]={kind:def.kind,items:def.kind==='songs'?dedupeCatalogueTracks(items):items};renderShelfItem(def,homeShelves[def.key]?.items||[]);}catch(_){renderShelfItem(def,homeShelves[def.key]?.items||[]);}
            }));
            const quickPicks=dedupeCatalogueTracks([...(onlineHistory.map(trackById).filter(Boolean).slice(0,5)),...(homeShelves.suggested?.items||[]),...(homeShelves.trending?.items||[])]).slice(0,10);
            if(quickPicks.length){homeShelves.quick={kind:'songs',items:quickPicks};const quickDef=HOME_DEFS.find(def=>def.key==='quick');if(quickDef)renderShelfItem(quickDef,quickPicks);}
            try{const artists=await collectHomeArtists(items=>{homeShelves.forYouArtists={kind:'artists',items:items.slice()};const shelf=HOME_DEFS.find(def=>def.key==='forYouArtists');if(shelf)renderShelfItem(shelf,items);},8);homeShelves.artists={kind:'artists',items:artists.slice()};homeShelves.forYouArtists={kind:'artists',items:artists.slice()};}catch(_){}
            HOME_DEFS.filter(def=>def.key==='forYouArtists').forEach(def=>renderShelfItem(def,homeShelves.forYouArtists?.items||[]));
            homeLastLoaded=Date.now();cacheHomeShelves();
            const visibleShelves=HOME_DEFS.some(def=>(homeShelves[def.key]?.items||[]).length>0);
            const fallback=document.getElementById('online-home-fallback');
            if(fallback){fallback.hidden=visibleShelves;fallback.innerHTML=visibleShelves?'':`<div class="online-network-state"><span class="material-symbols-rounded">cloud_off</span><div class="empty-title">Music is temporarily unavailable</div><div class="online-network-actions"><button class="btn" data-action="retry-online-home">Try again</button><button class="btn" data-action="toggle-playback-mode">Local library</button></div></div>`;}
        })().finally(()=>{homeLoadPromise=null;});
        return homeLoadPromise;
    };
    const renderHome = () => {
        if(State.playbackSourceMode!=='online')return;
        const status=document.getElementById('online-home-connection');if(status)status.hidden=Boolean(navigator.onLine);
        if(!Object.keys(homeShelves).length)restoreHomeShelves();
        const fallback=document.getElementById('online-home-fallback');if(fallback && Object.values(homeShelves).some(s=>s?.items?.length))fallback.hidden=true;
        if(!Object.keys(homeShelves).length&&navigator.onLine){HOME_DEFS.forEach(def=>{const n=document.getElementById(def.node);if(n)n.innerHTML='<div class="online-skeleton-list"><span></span><span></span><span></span></div>';});}
        HOME_DEFS.forEach(def=>renderShelfItem(def,homeShelves[def.key]?.items||[]));
        const recent=onlineHistory.map(trackById).filter(Boolean).slice(0,18);
        const recentWrap=document.getElementById('online-shelf-recent-wrap');if(recentWrap)recentWrap.hidden=!recent.length;
        const recentNode=document.getElementById('online-home-recent');if(recentNode)recentNode.innerHTML=renderTrackCards(recent,'online-history');
        // Keep Home to one artist scroller; rank the same cached catalogue by listening activity.
        const playedArtists=artistCatalogue.filter(item=>(artistStatFor(item)?.plays||0)>0);
        const combinedArtists=rankArtistItems([...(playedArtists.length?playedArtists:[]),...(homeShelves.forYouArtists?.items||artistCatalogue)],'recommended').slice(0,12);
        const artistShelf=HOME_DEFS.find(def=>def.key==='forYouArtists');
        if(artistShelf&&combinedArtists.length){homeShelves.forYouArtists={kind:'artists',items:combinedArtists};renderShelfItem(artistShelf,combinedArtists);}
        ['online-shelf-artists-wrap','online-shelf-recent-artists-wrap','online-shelf-popular-artists-wrap'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=true;});
        const userWrap=document.getElementById('online-shelf-collections-wrap');if(userWrap){userWrap.hidden=false;userWrap.style.display='block';}
        const userNode=document.getElementById('online-home-playlists');if(userNode)userNode.innerHTML=renderUserPlaylistCards(playlists.slice(0,30));
        const homeView=document.getElementById('view-online-home');
        let brandFooter=homeView?.querySelector('.online-brand-footer');
        if(homeView&&!brandFooter){brandFooter=document.createElement('footer');brandFooter.className='online-brand-footer';brandFooter.setAttribute('aria-label','Mujic watermark');brandFooter.innerHTML='<div class="online-brand-wordmark" aria-hidden="true">Mujic</div>';}
        if(brandFooter&&homeView){
            if(!brandFooter.querySelector('.online-brand-wordmark'))brandFooter.innerHTML='<div class="online-brand-wordmark" aria-hidden="true">Mujic</div>';
            const wordmark=brandFooter.querySelector('.online-brand-wordmark');
            if(wordmark.textContent.trim()!=='Mujic')wordmark.textContent='Mujic';
            // Force a visible brand footer from JS as well as CSS. Older theme rules previously
            // made the wordmark nearly black on a black Home background.
            brandFooter.hidden=false;brandFooter.removeAttribute('hidden');
            Object.assign(brandFooter.style,{display:'block',visibility:'visible',contentVisibility:'visible',opacity:'1',position:'relative',minHeight:'clamp(130px,16vw,230px)',overflow:'visible'});
            Object.assign(wordmark.style,{display:'block',visibility:'visible',opacity:'1',width:'max-content',maxWidth:'100%',fontSize:'clamp(82px,16vw,224px)',fontWeight:'850',letterSpacing:'-.09em',lineHeight:'.88',whiteSpace:'nowrap',color:'rgba(255,255,255,.28)',WebkitTextFillColor:'rgba(255,255,255,.28)',pointerEvents:'none'});
            wordmark.style.setProperty('color','rgba(255,255,255,.28)','important');
            wordmark.style.setProperty('-webkit-text-fill-color','rgba(255,255,255,.28)','important');
            if(brandFooter!==homeView.lastElementChild)homeView.appendChild(brandFooter);
        }
        renderSearchHistory();
        if(!navigator.onLine){renderConnectivityState();return;}
        if(Date.now()-homeLastLoaded>HOME_TTL||!Object.keys(homeShelves).length)loadHomeShelves(false);
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
    const renderPlaylistCards = list => renderUserPlaylistCards(list);
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
        saveQueueSnapshot('online');const c=document.getElementById('online-queue-content');if(!c)return;
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
    const openLibraryTab = tab => {setLibraryTab(tab);if(State.playbackSourceMode==='online'&&document.getElementById('view-online-playlists')?.classList.contains('active'))return;UI.switchView('online-playlists');};
    const isFavorite = id => {const track=trackById(id);return onlineFavorites.some(item=>item.id===id||(track&&sameSong(item,track)));};
    const toggleFavorite = id => {
        const track=trackById(id||State.currentTrackId);if(!track||!OnlineMusic.isOnlineTrack(track))return false;
        const index=onlineFavorites.findIndex(item=>item.id===track.id);const equivalent=onlineFavorites.findIndex(item=>sameSong(item,track));
        if(index<0&&equivalent>=0){UI.showToast('This recording is already in Liked Songs.','info');return false;}
        const liked=index<0;
        if(liked)onlineFavorites.unshift(serializeTrack(track));else onlineFavorites.splice(index,1);
        onlineFavorites=onlineFavorites.slice(0,500);persist();
        const button=document.getElementById('fav-btn');if(button&&State.currentTrackId===track.id)button.innerHTML=`<span class="material-symbols-rounded" style="font-variation-settings: 'FILL' ${liked?1:0}; color:${liked?'var(--accent-color)':'inherit'}">favorite</span>`;
        if(libraryTab==='liked')renderLiked();renderHome();UI.showToast(liked?'Added to Liked Songs':'Removed from Liked Songs',liked?'favorite':'favorite_border');return liked;
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
                // If the stored cache is partial, show what is ready now and defer network loading until requested.
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
                // Profile previews can display immediately, but empty endpoint responses stay retryable.
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
    const loadArtistAlbums = async (id, data, token) => {
        const isCurrent=()=>activeRemoteEntity?.requestId===token&&State.playbackSourceMode==='online';
        try{
            const first=await OnlineMusic.fetchArtistAlbums(id,0);
            if(!isCurrent())return;
            const cached=artistAlbumCache.get(String(id));
            let items=first.items||[];
            if(cached&&Date.now()-cached.savedAt<12*60*60*1000&&cached.items?.length>=items.length)items=cached.items.slice(0,12);
            data.albums=items.slice(0,12);data.totalAlbums=Math.max(Number(first.total)||0,Number(data.totalAlbums)||0,data.albums.length);
            data.albumPageSize=Math.max(Number(first.pageSize)||0,first.items?.length||data.albums.length||1);data.albumPage=0;
            artistAlbumsPage=0;artistAlbumsHasMore=data.totalAlbums>data.albums.length;
            artistAlbumCache.set(String(id),{savedAt:Date.now(),items:data.albums.slice()});
            if(isCurrent())renderRemoteDetail();
        }catch(_){/* Use topAlbums from the already-loaded profile as a fallback. */}
    };
    const openRemoteEntity = async (kind,id) => {
        if(!['playlists','albums','artists'].includes(kind)||!id)return;
        const previousEntity=activeRemoteEntity;
        const currentView=document.querySelector('.view.active')?.id||'view-online-home';
        const parent=currentView==='view-online-detail'?previousEntity:null;
        const returnView=parent?'online-detail':(currentView==='view-online-search'?'online-search':currentView==='view-online-playlists'?'online-playlists':currentView==='view-online-artists'?'online-artists':'online-home');
        const requestId=++remoteRequestSequence;
        activeRemoteEntity={kind,id:String(id),data:null,requestId,returnView,parent};remotePage=0;artistAlbumsPage=0;artistAlbumsHasMore=false;
        UI.switchView('online-detail');
        const node=document.getElementById('online-remote-detail');if(node)node.innerHTML='<div class="online-skeleton-list"><span></span><span></span><span></span></div>';
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
                // Always use the dedicated paginated artist-songs endpoint; topSongs is only a short preview.
                const tracksTask=loadInitialArtistSongs(catalogueId,data,requestId,fallbackTracks);
                artistLoadPromises.set(catalogueId,tracksTask);
                tracksTask.finally(()=>{if(artistLoadPromises.get(catalogueId)===tracksTask)artistLoadPromises.delete(catalogueId);}).catch(()=>{});
                // Profile topAlbums are enough for the initial view; extra albums load only on explicit request.
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
    const renderRemoteDetail = () => {
        const node=document.getElementById('online-remote-detail');if(!node||!activeRemoteEntity?.data)return;
        const e=activeRemoteEntity.data;const tracks=e.tracks||[];const kind=activeRemoteEntity.kind;
        shelfContexts.set(`detail:${kind}:${activeRemoteEntity.id}`,tracks);
        const showMore=(kind==='playlists'&&Number(e.total)>tracks.length)||(kind==='artists'&&e.hasMoreTracks);
        const more=showMore?'<div class="online-load-more-wrap"><button class="btn" data-action="online-load-remote-more">Load more</button></div>':'';
        const artistHeading=kind==='artists'?`<div class="online-artist-detail-heading"><h3>Songs</h3><span class="online-artist-progress">${e.loadingTracks?`${tracks.length.toLocaleString()}${e.total?` / ${Number(e.total).toLocaleString()}`:''} loading`:tracks.length.toLocaleString()+' tracks'}</span></div>`:`<div class="online-collection-heading"><h3>${tracks.length?`${tracks.length} songs`: 'Songs'}</h3></div>`;
        const similar=kind==='artists'&&e.artists?.length?`<section class="online-detail-albums online-detail-similar"><div class="online-shelf-heading"><h2>Similar Artists</h2><div class="online-rail-controls"><button class="icon-btn online-shelf-more" data-action="online-scroll-rail" data-target="online-detail-similar-rail" data-direction="left" aria-label="Scroll similar artists left"><span class="material-symbols-rounded">arrow_back</span></button><button class="icon-btn online-shelf-more" data-action="online-scroll-rail" data-target="online-detail-similar-rail" data-direction="right" aria-label="Scroll similar artists right"><span class="material-symbols-rounded">arrow_forward</span></button></div></div><div id="online-detail-similar-rail" class="online-card-rail online-artist-rail">${renderEntityRail(e.artists,'artists')}</div></section>`:'';
        const albums=kind==='artists'&&e.albums?.length?`<section class="online-detail-albums"><div class="online-shelf-heading"><h2>Albums</h2>${e.totalAlbums>e.albums.length?`<button class="text-action" data-action="online-load-artist-albums">More</button>`:''}</div><div class="online-card-rail">${renderEntityRail(e.albums,'albums')}</div></section>`:'';
        const loadingNote=kind==='artists'&&e.loadingTracks&&tracks.length===0?'<div class="online-empty-inline">Loading tracks…</div>':'';
        const errorNote=kind==='artists'&&e.artistLoadError?'<div class="online-empty-inline">Some tracks may be missing. Try again when connected.</div>':'';
        node.innerHTML=`<div class="online-detail-hero ${kind==='artists'?'online-artist-detail-hero':''}"><img src="${esc(e.image||'./icons/icon-192.png')}" alt="" onerror="this.onerror=null;this.src='./icons/icon-192.png'"><div class="online-detail-copy"><div class="online-mini-label">${kind==='playlists'?'Playlist':kind==='albums'?'Album':'Artist'}</div><h2>${esc(e.title||'Collection')}</h2><div class="online-entity-subtitle">${esc(kind==='artists'?(e.description||e.raw?.dominantLanguage||''):(e.artist||e.description||''))}</div><div class="online-action-row"><button class="btn btn-primary" data-action="online-play-remote-entity">Play</button>${kind==='playlists'?`<button class="btn" data-action="online-save-remote-playlist">Save playlist</button>`:''}</div></div></div>${similar}${albums}${artistHeading}${loadingNote}${renderTrackRows(tracks,`online-remote:${kind}:${activeRemoteEntity.id}`,kind==='artists'&&e.hasMoreTracks?'No songs loaded yet. Use Load more to retry.':'No tracks in this collection.')}${errorNote}${more}`;
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
            current.albums=current.albums.slice(0,24);artistAlbumsPage=page;artistAlbumCache.set(String(id),{savedAt:Date.now(),items:current.albums.slice()});
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
        if(mode==='online'){UI.switchView('online-home');renderHome();}
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
        else if(active==='view-online-detail'&&activeRemoteEntity)openRemoteEntity(activeRemoteEntity.kind,activeRemoteEntity.id);
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
        if(vid==='online-artists')renderArtistExplorer();
    };
    const recordPlay = track => {
        if(!track || !OnlineMusic.isOnlineTrack(track))return;
        const now=Date.now(),rawArtists=track.raw?.artists?.primary||track.raw?.artists?.all||track.raw?.more_info?.artistMap?.primary_artists||[];
        const artistNames=Array.isArray(rawArtists)?rawArtists.map(item=>({name:String(item?.name||item||'').trim(),id:String(item?.id||''),image:OnlineMusic.resolveArtistArtwork?.(track.raw,item?.id,item?.name)||''})).filter(item=>item.name):[];
        if(!artistNames.length)artistNames.push(...String(track.artist||'').split(/\s*,\s*|\s+&\s+/).map(name=>({name:name.trim(),id:'',image:''})).filter(item=>item.name&&item.name.toLowerCase()!=='unknown artist'));
        for(const item of artistNames){const key=titleKey(item.name);if(!key)continue;const prev=artistStats[key]||{name:item.name,plays:0,lastPlayedAt:0,id:item.id||'',image:item.image||''};prev.name=item.name;prev.plays=(Number(prev.plays)||0)+1;prev.lastPlayedAt=now;if(item.id)prev.id=item.id;if(item.image)prev.image=item.image;artistStats[key]=prev;if(item.id){artistStats[`id:${item.id}`]={...prev};if(!artistCatalogue.some(artist=>String(artist.sourceId||'')===String(item.id)||titleKey(artist.title)===key)){artistCatalogue.push({id:`artists:${item.id}`,sourceId:String(item.id),type:'artists',title:item.name,image:item.image||'',description:''});}}}
        if(artistCatalogue.length)saveArtistCatalogue();
        onlineHistory=[serializeTrack(track),...onlineHistory.filter(t=>!sameSong(t,track))].slice(0,100);
        if(window.OnlineCache) OnlineCache.rememberTrack(track);
        persist(); saveQueueSnapshot('online');
        if(document.getElementById('view-online-home')?.classList.contains('active')) renderHome();
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
        // Start on the tapped result, then continue forward through the catalogue/list in its
        // natural order. Earlier rows wrap to the end instead of jumping ahead of the next hit.
        if(selectedIndex>0) tracks=[tracks[selectedIndex],...tracks.slice(selectedIndex+1),...tracks.slice(0,selectedIndex)];
        return tracks;
    };
    const playSearchResult = id => {
        const selected=trackById(id);if(!selected||!OnlineMusic.isOnlineTrack(selected)){UI.showToast('This search result is no longer available. Search again.','info');return false;}
        // Search results are candidates for the user's choice, not a queue. Let the recommendation engine fill Up Next from the selected song's API suggestions.
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
        onlineHistory=dedupePlaylistTracks(hydrate(safeRead(KEYS.history,[]))).slice(0,100);
        onlineFavorites=dedupePlaylistTracks(hydrate(safeRead(KEYS.favorites,[]))).slice(0,500);
        artistStats=safeRead(KEYS.artistStats,{});if(!artistStats||typeof artistStats!=='object'||Array.isArray(artistStats))artistStats={};
        restoreArtistCatalogue();
        if(window.OnlineRecommendations)OnlineRecommendations.seedHistory(onlineHistory.map(trackById).filter(Boolean));
        searchHistory=safeRead(KEYS.searches,[]).filter(x=>typeof x==='string').slice(0,30);
        playlists=safeRead(KEYS.playlists,[]).map(p=>({...p,tracks:dedupePlaylistTracks(hydrate(p.tracks))})).filter(p=>p.id&&p.name);
        // Repair playlists already saved by older builds, including duplicates under different catalogue IDs.
        persist();
        queueSnapshots=safeRead(KEYS.queues,{offline:null,online:null});if(!queueSnapshots||typeof queueSnapshots!=='object')queueSnapshots={offline:null,online:null};
        linked=localStorage.getItem(KEYS.linked)==='yes';restoreHomeShelves();
        const input=document.getElementById('online-search-input');
        if(input&&input.dataset.bound!=='1'){
            input.dataset.bound='1';let timer;
            input.addEventListener('input',()=>{clearTimeout(timer);const clear=document.querySelector('.online-search-clear');if(clear)clear.hidden=!input.value.trim();timer=setTimeout(()=>performSearch(input.value),300);});
            input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();clearTimeout(timer);performSearch(input.value);}});
        }
        restoreQueueSnapshot(State.playbackSourceMode==='online'?'online':'offline');updateWorkspaceUI();renderSearchHistory();setSearchTypeUI();renderSearchBlank();setLibraryTab('playlists');
    };
    const getPlaylists = () => playlists.slice();
    const getPendingTrackId = () => pendingTrackId;
    const backToPlaylists = () => { activePlaylistId=null; renderPlaylists(); };
    const getOnlineHistory = () => onlineHistory.map(trackById).filter(Boolean);
    const getSearchResults = () => searchResults.slice();
    window.OnlineWorkspace={init,performSearch,loadMore,renderSearchBlank,renderHome,renderPlaylists,renderHistory,renderQueue,renderLiked,renderConnectivityState,updateWorkspaceUI,onModeChange,beforeModeChange,refreshActiveView,renderActiveView,recordPlay,getPlaybackContext,shiftHomeArtistWall,playSearchResult,playPlaylist,showAllArtists:()=>UI.switchView('online-artists'),sortArtists,createPlaylist,addTrackToPlaylist,openPlaylistPicker,getPendingTrackId,openPlaylist,backToPlaylists,clearHistory,clearQueue,shareOfflinePlaylistToOnline,copyOnlinePlaylistToOffline,renamePlaylist,deletePlaylist,setLinked,getPlaylists,getOnlineHistory,getSearchResults,rememberSearch,saveQueueSnapshot,setSearchType,openRemoteEntity,openReference,loadMoreRemote,loadMoreArtistAlbums,playRemoteEntity,getNavView:()=>{let item=activeRemoteEntity;while(item?.parent)item=item.parent;const view=item?.returnView&&item.returnView!=='online-detail'?item.returnView:'online-home';return view==='online-artists'?'online-home':view;},saveRemotePlaylist,loadPublicPlaylists,setLibraryTab,openLibraryTab,toggleFavorite,isFavorite,filterSearchType:(type)=>{searchType=type;setSearchTypeUI();},getSearchType:()=>searchType,playTrackFromShelf:(id,context)=>{const list=shelfContexts.get(context)||[];const ix=list.findIndex(t=>t.id===id);if(ix>=0){const ordered=[...list.slice(ix),...list.slice(0,ix)];setSearchContext(list);Player.playContext(ordered,0);}else{const t=trackById(id);if(t)Player.playContext([t],0);}},clearSearch:()=>{searchQuery='';searchPage=0;searchResults=[];entityResults=[];allSearchResults=null;const input=document.getElementById('online-search-input');if(input)input.value='';const clear=document.querySelector('.online-search-clear');if(clear)clear.hidden=true;renderSearchBlank();},backFromDetail:()=>{const current=activeRemoteEntity;if(current?.parent){activeRemoteEntity=current.parent;UI.switchView('online-detail');renderRemoteDetail();}else{activeRemoteEntity=null;UI.switchView(current?.returnView||'online-home');}}};
})();
