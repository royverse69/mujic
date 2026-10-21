const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const mkContext = fetchImpl => {
    const context = {
        window: { addEventListener() {} },
        State: { playbackSourceMode: 'online', playbackOrder: [], currentTrackId: null },
        navigator: { onLine: true },
        document: { createElement() { return { value: '', set innerHTML(value) { this.value = value; } }; }, getElementById() { return null; } },
        URL, AbortController, setTimeout, clearTimeout, console, fetch: fetchImpl, Map, Set, String, Number, Array, Object, Math, Date, Error, Promise
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'js/backend-config.js'), 'utf8'), context, { filename: 'backend-config.js' });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/online-provider.js'), 'utf8'), context, { filename: 'online-provider.js' });
    return { context, music: context.window.OnlineMusic };
};
(async () => {
    const songs = Array.from({ length: 11 }, (_, i) => ({ id: `song-${i}`, title: `Track ${i}`, subtitle: `Artist ${i}`, duration: 180 }));
    const { music } = mkContext(async () => ({ ok: true, text: async () => JSON.stringify({ data: { songs: { results: songs }, topQuery: { results: songs.slice(0, 2) } } }) }));
    const results = await music.search('sample');
    if (results.length !== 11) throw new Error(`Expected 11 unique search results; got ${results.length}.`);
    if (results.some(track => !track.id.startsWith('machhar:'))) throw new Error('Search results must use isolated remote IDs.');

    const streamPayload = { data: [{ downloadUrl: [
        { quality: '128kbps', codec: 'aac', link: 'https://audio.example/low.m4a' },
        { quality: '320kbps', codec: 'aac', link: 'https://audio.example/high.m4a' },
        { quality: '999kbps', codec: 'mp3', link: 'https://audio.example/not-aac.mp3' }
    ] }] };
    const ctx2 = mkContext(async () => ({ ok: true, text: async () => JSON.stringify(streamPayload) }));
    const source = await ctx2.music.resolveDownloadSource({ id: 'machhar:song-x', onlineTrackId: 'song-x' });
    if (source.url !== 'https://audio.example/high.m4a' || !/aac/i.test(source.codec)) throw new Error('Downloader did not select the highest-quality AAC source.');
    const playbackFixture = {
        id: 'machhar:saavn:playback-fixture', onlineTrackId: 'playback-fixture', provider: 'saavn',
        raw: { downloadUrl: [{ quality: '320kbps', url: 'https://aac.saavncdn.com/playback-fixture.m4a?token=fixture' }] }
    };
    if (typeof ctx2.music.resolvePlaybackCandidates !== 'function' || typeof ctx2.music.markStreamWorking !== 'function') throw new Error('OnlineMusic must expose the resolver and working-source cache updater used by the player.');
    const streamCandidates = await ctx2.music.resolvePlaybackCandidates(playbackFixture);
    if (streamCandidates.length < 2 || !streamCandidates.some(url => url.includes('/media?url=')) || !streamCandidates.some(url => url.includes('aac.saavncdn.com'))) throw new Error('Playback resolution must provide proxy routes and a direct CDN fallback.');
    const selectedCandidate = streamCandidates[streamCandidates.length - 1];
    if (!ctx2.music.markStreamWorking(playbackFixture.id, selectedCandidate)) throw new Error('A successful source must be recorded by the provider.');
    const reorderedCandidates = await ctx2.music.resolvePlaybackCandidates(playbackFixture);
    if (reorderedCandidates[0] !== selectedCandidate) throw new Error('The last successful stream route must be preferred on subsequent playback.');
    const proxiedMedia = ctx2.music.proxyMediaUrl('https://aac.saavncdn.com/test-track.m4a?token=fixture');
    if (!proxiedMedia.startsWith('https://mujic.calverse.online/media?url=') || !decodeURIComponent(proxiedMedia.split('url=')[1]).includes('aac.saavncdn.com/test-track.m4a')) throw new Error('Known catalogue media hosts must be proxied through the primary backend.');


    const pageCalls = [];
    const paged = mkContext(async url => {
        pageCalls.push(String(url));
        const parsed = new URL(String(url));
        const page = Number(parsed.searchParams.get('page') || 0);
        const pageSongs = Array.from({ length: 3 }, (_, i) => {
            const n = page * 3 + i;
            return { id: `paged-${n}`, name: `Paged Sample Track ${n}`, duration: 190, artists: { primary: [{ name: `Artist ${n}` }] } };
        });
        return { ok: true, text: async () => JSON.stringify({ success: true, data: { total: 12, start: page * 3, results: pageSongs } }) };
    });
    const pageZero = await paged.music.search('paged sample', { page: 0, limit: 40 });
    if (pageZero.length !== 3 || !paged.music.getSearchMeta().hasMore) throw new Error('A capped three-result first page should retain hasMore when total=12.');
    const pageOne = await paged.music.search('paged sample', { page: 1, limit: 40 });
    if (pageOne.length !== 3 || pageOne[0].onlineTrackId !== 'paged-3') throw new Error('The provider should request and normalize the next page.');

    const birthday = mkContext(async () => ({ok:true,text:async()=>JSON.stringify({success:true,data:{total:4,start:0,results:[
        {id:'hb-exact',name:'Happy Birthday To You',duration:160,artists:{primary:[{name:'Traditional'}]}},
        {id:'happy-only',name:'Happy Ending',duration:190,artists:{primary:[{name:'Artist'}]}},
        {id:'birthday-only',name:'Birthday Song',duration:180,artists:{primary:[{name:'Artist'}]}},
        {id:'hb-remix',name:'Happy Birthday Remix',duration:170,artists:{primary:[{name:'DJ'}]}}
    ]}})}));
    const birthdayResults = await birthday.music.search('Happy Birthday');
    if (birthdayResults.length !== 2 || birthdayResults.some(track => /Happy Ending|Birthday Song/.test(track.title))) throw new Error('Multi-token search must not include unrelated partial-word matches.');
    if (!pageCalls.some(url => new URL(url).searchParams.get('page') === '1')) throw new Error('Load More pagination must request page=1.');

    const catalogueCalls=[];
    const catalogue=mkContext(async url=>{
        catalogueCalls.push(String(url));
        const u=new URL(String(url));
        const path=u.pathname.replace('/api/','');
        let data={id:'entity-1',name:'Fixture entity',songCount:3,songs:[{id:'s1',name:'Fixture song',duration:180}],image:[]};
        if(path==='songs') data=[{id:'s1',name:'Fixture song',duration:180}];
        if(path==='artists/artist-1/songs') data={total:6,limit:10,songs:[{id:`artist-song-${u.searchParams.get('page')}`,name:`Artist song ${u.searchParams.get('page')}`,duration:180}]};
        if(path==='artists/artist-1/albums') data={total:1,albums:[{id:'album-1',name:'Fixture album',image:[]}]};
        return {ok:true,text:async()=>JSON.stringify({success:true,data})};
    });
    const linkedSongs=await catalogue.music.fetchSongsByIdsOrLink('https://catalogue.example/song/fixture');
    if(linkedSongs.length!==1||!catalogueCalls.some(url=>new URL(url).searchParams.has('link')))throw new Error('Song lookup must support the documented link parameter.');
    const artistPage=await catalogue.music.fetchArtistSongs('artist-1',1);
    if(artistPage.tracks.length!==1||artistPage.total!==6||artistPage.pageSize!==1||!catalogueCalls.some(url=>new URL(url).pathname.endsWith('/artists/artist-1/songs')&&new URL(url).searchParams.get('page')==='1'))throw new Error('Artist song pagination must infer its page size from returned rows, not an unrelated limit field.');
    const foreignArtist=mkContext(async url=>{
        const u=new URL(String(url));
        if(u.pathname.endsWith('/artists/foreign-artist/songs'))return {ok:true,text:async()=>JSON.stringify({success:true,data:{total:0,songs:[]}})};
        if(u.pathname.endsWith('/search/songs'))return {ok:true,text:async()=>JSON.stringify({success:true,data:{total:2,start:0,results:[
            {id:'billie-track-1',name:'Ocean Eyes',duration:200,album:{name:'dont smile at me'},artists:{primary:[{id:'foreign-artist',name:'Billie Eilish'}]},image:[]},
            {id:'wrong-artist-track',name:'Happy Birthday',duration:180,artists:{primary:[{id:'other-artist',name:'Another Singer'}]},image:[]}
        ]}})};
        return {ok:true,text:async()=>JSON.stringify({success:true,data:{results:[]}})};
    });
    const foreignPage=await foreignArtist.music.fetchArtistSongs('foreign-artist',0,'Billie Eilish');
    if(foreignPage.tracks.length!==1||foreignPage.tracks[0].onlineTrackId!=='billie-track-1'||!foreignPage.fallback)throw new Error('Foreign-artist fallback must fetch relevant tracks and reject songs by unrelated artists.');
    const imageFallback = mkContext(async url => {
        const u = new URL(String(url));
        if (u.pathname.endsWith('/search/artists')) return { ok:true, text:async()=>JSON.stringify({success:true,data:{total:1,start:0,results:[{id:'artist-art',name:'Artwork fallback',image:[],images:[{quality:'500x500',url:'//cdn.example/artist.jpg'}]}]}}) };
        return {ok:true,text:async()=>JSON.stringify({success:true,data:{results:[]}})};
    });
    const artistSearch = await imageFallback.music.searchEntities('artists','artwork fallback');
    if (artistSearch.items[0]?.image !== 'https://cdn.example/artist.jpg') throw new Error('Artwork normalization must skip empty image arrays and accept protocol-relative fallback URLs.');

    const profileArtwork = mkContext(async url => {
        const u = new URL(String(url));
        if (u.pathname.endsWith('/artists') && u.searchParams.get('id')==='profile-artist') return { ok:true, text:async()=>JSON.stringify({success:true,data:{id:'profile-artist',name:'Profile Artist',image:[],topSongs:[{id:'profile-song',name:'Profile song',artists:{primary:[{id:'profile-artist',name:'Profile Artist',image:[{quality:'500x500',url:'https://cdn.example/profile-artist.jpg'}]}]}}],topAlbums:[],similarArtists:[]}}) };
        return {ok:true,text:async()=>JSON.stringify({success:true,data:{results:[]}})};
    });
    const profile = await profileArtwork.music.fetchArtistDetails('profile-artist');
    if (profile.image !== 'https://cdn.example/profile-artist.jpg') throw new Error('Artist detail must resolve portrait art from matching artist maps when the direct profile image is empty.');

    const suggestionCalls=[];
    const related = mkContext(async url => {
        suggestionCalls.push(String(url));
        return {ok:true,text:async()=>JSON.stringify({success:true,data:[{id:'recommended-1',name:'Recommended song',subtitle:'Recommended artist'}]})};
    });
    const suggestions = await related.music.fetchRelated({id:'machhar:saavn:seed-song',onlineTrackId:'seed-song',provider:'saavn'});
    if(suggestions.length!==1 || !suggestionCalls.some(url=>new URL(url).pathname.endsWith('/songs/seed-song/suggestions')&&new URL(url).searchParams.get('limit')==='20')) throw new Error('Related-track loading must use the documented suggestions endpoint and accept its data array response.');

    const artistAlbums=await catalogue.music.fetchArtistAlbums('artist-1',0);
    if(artistAlbums.items.length!==1||!catalogueCalls.some(url=>new URL(url).pathname.endsWith('/artists/artist-1/albums')))throw new Error('Artist albums must use the dedicated artist-albums route.');
    await catalogue.music.fetchPublicPlaylist('https://catalogue.example/playlist/fixture');
    await catalogue.music.fetchAlbumDetails('https://catalogue.example/album/fixture');
    await catalogue.music.fetchArtistDetails('https://catalogue.example/artist/fixture');
    if(!catalogueCalls.some(url=>new URL(url).pathname.endsWith('/playlists')&&new URL(url).searchParams.has('link'))||!catalogueCalls.some(url=>new URL(url).pathname.endsWith('/albums')&&new URL(url).searchParams.has('link'))||!catalogueCalls.some(url=>new URL(url).pathname.endsWith('/artists')&&new URL(url).searchParams.has('link')))throw new Error('Playlist, album and artist link lookup routes must be supported.');

    const calls = { count: 0 };
    const ctx3 = mkContext(async () => { calls.count++; throw new Error('Network should not be called while offline'); });
    ctx3.context.navigator.onLine = false;
    let blocked = false;
    try { await ctx3.music.search('sample'); } catch (e) { blocked = /offline/i.test(e.message); }
    if (!blocked || calls.count !== 0) throw new Error('Online search must be blocked without connectivity.');
    console.log('Online provider checks OK: search parsing, capped-page pagination, inferred artist page size, foreign artist song-search fallback, artwork fallback (including artist-map portraits), documented suggestions, link lookup, AAC source selection, stream resolver/route fallback caching, and offline request blocking.')
})().catch(error => { console.error(error); process.exit(1); });
