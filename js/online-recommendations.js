/* Copyright mujic@royverse69 */
/* Online autoplay/recommendation engine. Never auto-queues likely duplicate recordings or variants. */
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
        // A release subtitle such as '(From …)' or a remix suffix is not a new core song title.
        // Same-title recordings are duplicates only when the artist identity also matches (or one
        // side lacks an artist); different artists can legitimately release songs with the same title.
        const sharedArtist=a.artists?.some(name=>b.artists?.includes(name));
        if(a.title===b.title){
            // If one catalogue title explicitly marks a remix/variant, or the only title difference
            // is release metadata (for example '(From …)'), treat it as the same recording even
            // when one catalogue record credits a composer/featured singer instead of the lead.
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
        // History is newest-first; seed old-to-new so the newest items stay at the front.
        [...(Array.isArray(tracks)?tracks:[])].slice(0,MAX_HISTORY).reverse().forEach(remember);
    };
    const isBlocked = (candidate,currentTrack,excludeIds=new Set()) => {
        const id=String(candidate?.id||''); if(!id||excludeIds.has(id)||playedIds.has(id))return true;
        if(currentTrack&&isSameRecording(candidate,currentTrack))return true;
        // A result can have a different catalogue ID and still be the same recording/remix.
        // Reject equivalents already present anywhere in the current queue before auto-adding it.
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
    const getCandidates = async (currentTrack, minCount=6) => {
        const excludeIds=currentQueueIds();
        const acceptUnique = input => {
            const accepted=[],seen=new Set();
            for(const track of input||[]){
                if(!track?.id||seen.has(String(track.id))||isBlocked(track,currentTrack,excludeIds))continue;
                if(accepted.some(previous=>isSameRecording(track,previous)))continue;
                seen.add(String(track.id));accepted.push(track);
            }
            return accepted;
        };
        // Documented /api/songs/{id}/suggestions is the primary source for connected tracks.
        let raw=[];try{raw=candidatesFrom(await OnlineMusic.fetchRelated(currentTrack));}catch(_){}
        let suggested=acceptUnique(raw.map(item=>OnlineMusic.normalizeTrack({...item,provider:item.provider||currentTrack.provider})).filter(Boolean));
        if(suggested.length>=Math.min(3,minCount))return suggested;
        // Only use same-primary-artist fallback when the official similar-track route is sparse.
        const primary=String(currentTrack.artist||'').split(/,|&/)[0].trim();
        if(primary){
            try{
                const artistTracks=await OnlineMusic.search(primary,{background:true,limit:40});
                const sameArtist=artistTracks.filter(track=>cleanArtist(track.artist).includes(cleanArtist(primary))||cleanArtist(primary).includes(cleanArtist(track.artist)));
                suggested=acceptUnique([...suggested,...sameArtist]);
            }catch(_){}
        }
        // Never pad the automatic queue with arbitrary language hits or trending songs.
        return suggested.slice(0,Math.max(minCount,12));
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
