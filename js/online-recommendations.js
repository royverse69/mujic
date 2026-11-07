/* Copyright mujic@royverse69 */
(() => {
    const playedIds = new Set();
    const playedFingerprints = [];
    const priming = new Map();
    const MAX_HISTORY = 120;
    const VARIANT_RE = /\b(remix(?:ed)?|rework|refix|mashup|bootleg|flip|edit|slowed|reverb|sped\s?up|speed\s?up|nightcore|8d|bass\s?boosted|instrumental|karaoke|cover|acoustic|live|concert|demo|radio\s?edit|extended|club\s?mix|dance\s?mix|remaster(?:ed)?|anniversary\s?edition|alternate\s?version|version|reprise|lo.?fi|lofi)\b/i;
    const text = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const cleanTitle = value => text(value)
        .replace(/\([^)]*(?:remix|version|edit|live|cover|acoustic|remaster|slowed|reverb|sped|nightcore|karaoke|instrumental|lo.?fi|mix|mashup)[^)]*\)/g,' ')
        .replace(/\s*[\[(](?:from\b|song from\b|official\b|original motion picture soundtrack\b|full song\b|lyrical? video\b|audio only\b)[^\])]*[\])]/g,' ')
        .replace(/\[[^\]]*(?:remix|version|edit|live|cover|acoustic|remaster|slowed|reverb|sped|nightcore|karaoke|instrumental|lo.?fi|mix|mashup)[^\]]*\]/g,' ')
        .replace(/\b(?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|visualiser|hd|4k|full\s+song)\b/g,' ')
        .replace(/\b(?:slowed\s*(?:\+|and|&)\s*reverb|sped\s*up|speed\s*up|bass\s*boosted|radio\s*edit|club\s*mix|dance\s*mix|lo[ -]?fi)\b/g,' ')
        .replace(/\b(remix(?:ed)?|rework|refix|mashup|bootleg|flip|edit|slowed|reverb|nightcore|8d|instrumental|karaoke|cover|acoustic|live|concert|demo|extended|remaster(?:ed)?|anniversary|edition|alternate|version|reprise)\b/g,' ')
        .replace(/\b(?:feat(?:uring)?|ft)\.?\s+.+$/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    const cleanArtist = value => text(value).split(/,| feat\.? | ft\.? | featuring /)[0].replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    const artistSet = value => [...new Set(text(value).split(/,|\s*&\s*|\s*\+\s*|\s+feat(?:uring)?\.?\s+|\s+ft\.?\s+/).map(name=>name.replace(/[^a-z0-9]+/g,' ').trim()).filter(name=>name.length>1))];
    const fingerprint = track => ({
        id:String(track?.id||''), onlineId:`${track?.provider||'saavn'}:${track?.onlineTrackId||track?.raw?.id||''}`,
        isrc:text(track?.isrc||track?.raw?.isrc||''), title:cleanTitle(track?.title), artist:cleanArtist(track?.artist||track?.artists||''),
        artists:artistSet(track?.artist||track?.artists||''), original:text(track?.title||''),
        variant:VARIANT_RE.test(`${track?.title||''} ${track?.version||''} ${track?.subtitle||''}`)
    });
    const similarity = (a,b) => {
        if(!a||!b)return 0; if(a===b)return 1;
        const A=new Set(a.split(' ')),B=new Set(b.split(' ')); const both=[...A].filter(x=>B.has(x)).length;
        return new Set([...A,...B]).size ? both/new Set([...A,...B]).size : 0;
    };
    const isSameRecording = (candidate,reference) => {
        if(!candidate||!reference)return false;
        const a=fingerprint(candidate),b=fingerprint(reference);
        if((a.id&&a.id===b.id)||(a.onlineId&&a.onlineId===b.onlineId)||(a.isrc&&a.isrc===b.isrc))return true;
        if(!a.title||!b.title)return false;
        const sharedArtist=a.artists?.some(name=>b.artists?.includes(name));
        if(a.title===b.title){
            if(a.variant||b.variant||a.original!==b.original)return true;
            if(sharedArtist || (a.artist && b.artist && a.artist===b.artist))return true;
            if(!a.artist || !b.artist)return true;
            return false;
        }
        const score=similarity(a.title,b.title);
        if(sharedArtist&&score>=0.58)return true;
        if(a.artist&&a.artist===b.artist&&score>=0.72)return true;
        if((a.variant||b.variant)&&score>=0.62)return true;
        return false;
    };
    const remember = track => {
        if(!track)return;
        const fp=fingerprint(track);
        if(fp.id && playedIds.has(fp.id)) return;
        if(fp.id)playedIds.add(fp.id); if(fp.onlineId)playedIds.add(fp.onlineId);
        playedFingerprints.unshift(fp); if(playedFingerprints.length>MAX_HISTORY)playedFingerprints.length=MAX_HISTORY;
    };
    const wasPlayedOrEquivalent = candidate => {
        if(!candidate?.id)return false;
        const fp=fingerprint(candidate);
        if(playedIds.has(fp.id)||playedIds.has(fp.onlineId))return true;
        return playedFingerprints.some(previous=>{
            const sep=String(previous.onlineId||'').indexOf(':');
            const reference={id:previous.id,provider:sep>=0?previous.onlineId.slice(0,sep):'saavn',onlineTrackId:sep>=0?previous.onlineId.slice(sep+1):previous.onlineId,isrc:previous.isrc,title:previous.original,artist:previous.artist};
            return isSameRecording(candidate,reference);
        });
    };
    const seedHistory = tracks => {
        playedIds.clear(); playedFingerprints.length=0;
        [...(Array.isArray(tracks)?tracks:[])].slice(0,MAX_HISTORY).reverse().forEach(remember);
    };
    const isBlocked = (candidate,currentTrack,excludeIds=new Set()) => {
        const id=String(candidate?.id||''); if(!id||excludeIds.has(id)||playedIds.has(id))return true;
        if(currentTrack&&isSameRecording(candidate,currentTrack))return true;
        for(const queuedId of excludeIds){
            const queued=Player.getTrackById(queuedId)||OnlineMusic.getTrack(queuedId);
            if(queued&&isSameRecording(candidate,queued))return true;
        }
        for(const fp of playedFingerprints) if(isSameRecording(candidate,{id:fp.id,onlineTrackId:fp.onlineId,title:fp.original,artist:fp.artist,provider:candidate.provider}))return true;
        return false;
    };
    const filterPlaybackContext = (tracks,selectedId) => {
        const list=Array.isArray(tracks)?tracks:[];
        const selected=list.find(track=>track?.id===selectedId)||OnlineMusic.getTrack(selectedId);
        if(!selected)return list;
        const accepted=[],seenIds=new Set();
        for(const track of [selected,...list.filter(t=>t?.id!==selectedId)]) {
            if(!track?.id||seenIds.has(track.id))continue;
            if(track.id!==selected.id&&isSameRecording(track,selected))continue;
            if(accepted.some(item=>isSameRecording(track,item)))continue;
            seenIds.add(track.id);accepted.push(track);
        }
        return accepted;
    };
    const candidatesFrom = payload => {
        if(Array.isArray(payload))return payload;
        if(Array.isArray(payload?.data?.results))return payload.data.results;
        if(Array.isArray(payload?.data?.songs?.results))return payload.data.songs.results;
        if(Array.isArray(payload?.data?.queue))return payload.data.queue;
        if(Array.isArray(payload?.queue))return payload.queue;
        if(Array.isArray(payload?.songs))return payload.songs;
        if(Array.isArray(payload?.data))return payload.data;
        if(Array.isArray(payload?.results))return payload.results;
        return [];
    };
    const currentQueueIds = () => new Set([...(State.playbackOrder||[]),...(State.queue||[])].map(String));
    /* ---------------------------------------------------------------------------------------------
       Suggestion engine
       1. Taste profile  : weighted artists / languages / genres / era from favourites + recent history.
       2. Candidate pool : provider "related" list, topped up with artist + taste + language searches
                           only when related results are thin. The pool is cached per seed track.
       3. Scoring        : related rank, shared artists, taste affinity, language/genre/era fit, session
                           continuity, duration sanity, variant penalty and a tiny stable tie-break.
       4. Diversity      : greedy MMR-style re-rank so one artist/album cannot flood the queue.
       --------------------------------------------------------------------------------------------- */
    const POOL_TTL = 180000, POOL_MAX = 24, TASTE_TTL = 60000;
    const poolCache = new Map();
    const tasteCache = { at:0, key:'', value:null };
    const norm = value => text(value).replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    const yearOf = value => { const y=parseInt(String(value||'').match(/\d{4}/)?.[0],10); return Number.isFinite(y)?y:0; };
    const genresOf = value => String(value||'').split(/[,/|]/).map(norm).filter(Boolean);
    const lookupTrack = id => { try{return Player.getTrackById?.(id)||OnlineMusic.getTrack?.(id)||null;}catch(_){return null;} };
    const stableNoise = key => { let h=2166136261; for(let i=0;i<key.length;i++){h^=key.charCodeAt(i);h=Math.imul(h,16777619);} return ((h>>>0)%1000)/1000; };
    const peak = map => { let max=0; map.forEach(v=>{if(v>max)max=v;}); return max||1; };
    const affinity = (map,keys) => { if(!map.size)return 0; const max=peak(map); return keys.reduce((best,key)=>Math.max(best,(map.get(key)||0)/max),0); };

    const buildTaste = () => {
        const history=(State.history||[]).slice(0,60), favourites=(State.favorites||[]).slice(0,80);
        const key=`${history.length}:${history[0]||''}:${favourites.length}:${(State.favoriteArtists||[]).length}`;
        if(tasteCache.value&&tasteCache.key===key&&Date.now()-tasteCache.at<TASTE_TTL)return tasteCache.value;
        const taste={artists:new Map(),languages:new Map(),genres:new Map(),years:[]};
        const bump=(map,name,weight)=>{if(name)map.set(name,(map.get(name)||0)+weight);};
        const feed=(track,weight)=>{
            if(!track)return;
            artistSet(track.artist||track.artists).forEach(name=>bump(taste.artists,name,weight));
            bump(taste.languages,norm(track.language),weight);
            genresOf(track.genre).forEach(name=>bump(taste.genres,name,weight));
            const year=yearOf(track.year); if(year)taste.years.push(year);
        };
        history.forEach((id,index)=>feed(lookupTrack(id),1/(1+index*0.08)));   // recent plays count more
        favourites.forEach(id=>feed(lookupTrack(id),2));
        (State.favoriteArtists||[]).forEach(entry=>bump(taste.artists,norm(typeof entry==='string'?entry:entry?.name),3));
        taste.medianYear=taste.years.length?[...taste.years].sort((a,b)=>a-b)[Math.floor(taste.years.length/2)]:0;
        tasteCache.at=Date.now();tasteCache.key=key;tasteCache.value=taste;
        return taste;
    };
    const topTasteArtist = (taste,exclude) => { let best='',score=0; taste.artists.forEach((value,name)=>{if(value>score&&!exclude.includes(name)){best=name;score=value;}}); return best; };

    const fetchPool = async currentTrack => {
        const key=`${currentTrack.provider||'saavn'}:${currentTrack.onlineTrackId||currentTrack.id}`;
        const hit=poolCache.get(key);
        if(hit&&hit.expires>Date.now())return hit.pool;
        const pool=[];
        const push=(items,source)=>items.forEach((track,rank)=>{if(track?.id)pool.push({track,source,rank,size:items.length});});
        let related=[];
        try{related=candidatesFrom(await OnlineMusic.fetchRelated(currentTrack)).map(item=>OnlineMusic.normalizeTrack({...item,provider:item.provider||currentTrack.provider})).filter(Boolean);}catch(_){}
        push(related,'related');
        if(related.length<8){
            const primary=String(currentTrack.artist||'').split(/,|&/)[0].trim();
            const primaryKey=cleanArtist(primary);
            const lookups=[];
            if(primary)lookups.push(['artist',primary]);
            const favourite=topTasteArtist(buildTaste(),artistSet(currentTrack.artist));
            if(favourite)lookups.push(['taste',favourite]);
            const language=String(currentTrack.language||'').trim();
            if(language&&related.length<4)lookups.push(['language',`${language} ${genresOf(currentTrack.genre)[0]||'top songs'}`]);
            const results=await Promise.all(lookups.map(async([source,query])=>{
                try{return [source,await OnlineMusic.search(query,{background:true,limit:30})];}catch(_){return [source,[]];}
            }));
            results.forEach(([source,items])=>{
                const list=Array.isArray(items)?items:[];
                push(source==='artist'?list.filter(track=>{const a=cleanArtist(track.artist);return a&&primaryKey&&(a.includes(primaryKey)||primaryKey.includes(a));}):list,source);
            });
        }
        if(pool.length){
            poolCache.set(key,{pool,expires:Date.now()+POOL_TTL});
            while(poolCache.size>POOL_MAX)poolCache.delete(poolCache.keys().next().value);
        }
        return pool;
    };

    const SOURCE_WEIGHT = { related:0.34, artist:0.14, taste:0.12, language:0.05 };
    const scoreCandidate = (track,entry,currentTrack,taste,context) => {
        const artists=artistSet(track.artist||track.artists);
        let score=(SOURCE_WEIGHT[entry.source]||0)*(1-(entry.rank/Math.max(entry.size,1))*0.8);
        if(artists.some(name=>context.currentArtists.includes(name)))score+=0.16;
        if(artists.some(name=>context.sessionArtists.has(name)))score+=0.05;
        score+=affinity(taste.artists,artists)*0.2;
        const language=norm(track.language);
        if(language&&context.language){score+=language===context.language?0.12:-0.08;}
        else if(language&&taste.languages.size)score+=affinity(taste.languages,[language])*0.06;
        const genres=genresOf(track.genre);
        if(genres.length&&context.genres.length&&genres.some(name=>context.genres.includes(name)))score+=0.08;
        else if(genres.length)score+=affinity(taste.genres,genres)*0.04;
        const year=yearOf(track.year), anchor=context.year||taste.medianYear;
        if(year&&anchor)score+=Math.max(0,1-Math.abs(year-anchor)/12)*0.08;
        const duration=Number(track.duration)||0;
        if(duration&&(duration<60||duration>480))score-=0.1; else if(duration)score+=0.03;
        if(fingerprint(track).variant&&!context.currentIsVariant)score-=0.25;
        return score+stableNoise(`${track.id}|${currentTrack.id}`)*0.02;
    };
    const rankCandidates = (tracks,meta,currentTrack) => {
        const taste=buildTaste(), current=fingerprint(currentTrack);
        const context={
            currentArtists:current.artists, language:norm(currentTrack.language), genres:genresOf(currentTrack.genre),
            year:yearOf(currentTrack.year), currentIsVariant:current.variant,
            sessionArtists:new Set(playedFingerprints.slice(0,3).flatMap(fp=>fp.artists||[]))
        };
        const scored=tracks.map(track=>({track,score:scoreCandidate(track,meta.get(track.id)||{source:'related',rank:0,size:1},currentTrack,taste,context)}));
        const ordered=[],artistCount=new Map(),albumCount=new Map();
        while(scored.length){
            let bestIndex=0,bestValue=-Infinity;
            scored.forEach((item,index)=>{
                const artistPenalty=artistSet(item.track.artist||item.track.artists).reduce((sum,name)=>Math.max(sum,artistCount.get(name)||0),0)*0.14;
                const albumKey=norm(item.track.album);
                const albumPenalty=albumKey&&albumKey!=='unknown album'?(albumCount.get(albumKey)||0)*0.08:0;
                const value=item.score-artistPenalty-albumPenalty;
                if(value>bestValue){bestValue=value;bestIndex=index;}
            });
            const [picked]=scored.splice(bestIndex,1);
            artistSet(picked.track.artist||picked.track.artists).forEach(name=>artistCount.set(name,(artistCount.get(name)||0)+1));
            const albumKey=norm(picked.track.album); if(albumKey)albumCount.set(albumKey,(albumCount.get(albumKey)||0)+1);
            ordered.push(picked.track);
        }
        return ordered;
    };
    const getCandidates = async (currentTrack, minCount=6) => {
        const excludeIds=currentQueueIds();
        const pool=await fetchPool(currentTrack);
        const accepted=[],seen=new Set(),meta=new Map();
        for(const entry of pool){
            const track=entry.track;
            if(!track?.id||seen.has(String(track.id))||isBlocked(track,currentTrack,excludeIds))continue;
            if(accepted.some(previous=>isSameRecording(track,previous)))continue;
            seen.add(String(track.id));accepted.push(track);meta.set(track.id,entry);
        }
        return rankCandidates(accepted,meta,currentTrack).slice(0,Math.max(minCount,12));
    };
    const addToQueue = tracks => {
        const known=new Set([...(State.queue||[]),...(State.playbackOrder||[])].map(String));
        const knownTracks=[...known].map(id=>Player.getTrackById(id)||OnlineMusic.getTrack(id)).filter(Boolean);
        let added=0;
        for(const track of tracks){
            if(!track?.id||known.has(String(track.id)))continue;
            if(knownTracks.some(previous=>isSameRecording(track,previous)))continue;
            known.add(String(track.id));knownTracks.push(track);State.queue.push(track.id);State.playbackOrder.push(track.id);added++;
            OnlineMusic.registerTrack(track);
        }
        if(added){UI.renderQueue();OnlineWorkspace?.renderQueue?.();}
        return added;
    };
    const primeQueue = async currentTrack => {
        if(!currentTrack||currentTrack.source!=='machhar-online'||State.playbackSourceMode!=='online'||!navigator.onLine)return false;
        const upcoming=(State.playbackOrder||[]).slice(State.queueIndex+1).length;
        if(upcoming>=6)return false;
        if(priming.has(currentTrack.id))return priming.get(currentTrack.id);
        const work=(async()=>{
            const candidates=await getCandidates(currentTrack,Math.max(4,8-upcoming));
            const currentNow=Player.getCurrentTrack();
            if(currentNow?.id!==currentTrack.id||State.playbackSourceMode!=='online')return false;
            const added=addToQueue(candidates.slice(0,Math.max(0,8-upcoming)));
            return added>0;
        })().catch(error=>{console.warn('Online queue prefill unavailable:',error);return false;}).finally(()=>priming.delete(currentTrack.id));
        priming.set(currentTrack.id,work);return work;
    };
    const enqueueNext = async currentTrack => {
        if(!currentTrack||currentTrack.source!=='machhar-online'||State.playbackSourceMode!=='online')return false;
        if(!navigator.onLine)return false;
        const upcoming=(State.playbackOrder||[]).slice(State.queueIndex+1).length;
        const candidates=await getCandidates(currentTrack,Math.max(5,7-upcoming));
        const added=addToQueue(candidates.slice(0,Math.max(1,7-upcoming)));
        if(!added) return false;
        return true;
    };
    window.OnlineRecommendations={fingerprint,isSameRecording,similarity,cleanTitle,cleanArtist,remember,seedHistory,wasPlayedOrEquivalent,isBlocked,filterPlaybackContext,enqueueNext,primeQueue,getCandidates};
})();
