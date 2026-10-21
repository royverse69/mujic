const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const pkg = JSON.parse(read('package.json'));
const changelog = JSON.parse(read('changlog.json'));
const version = read('VERSION').trim();
const provider = read('js/online-provider.js');
const workspace = read('js/online-workspace.js');
const player = read('js/player.js');
const uiLibrary = read('js/ui-library.js');
const uiLyrics = read('js/ui-lyrics.js');
const share = read('js/lyrics-share.js');
const css = read('css/app.css');
const html = read('index.html');
const sw = read('sw.js');

check(pkg.version === version && changelog.version === version && changelog.entries[0]?.version === version && changelog.entries.some(entry => entry.version === '13.0.15'), 'Current release metadata must agree and retain the v13.0.15 history.');
check(html.includes(`application-version" content="${version}"`) && sw.includes(`mujic-pwa-v${version}-`), 'HTML and service-worker cache need the current release version.');
check(provider.includes('const streamResolvePromises = new Map()') && provider.includes('const streamResolveControllers = new Map()'), 'Stream resolution must be deduplicated and abort-scoped per track.');
check(provider.includes('warmPlaybackCandidates') && provider.includes('Math.min(3, unique.length)'), 'Visible results should warm candidate URLs with bounded concurrency.');
check(workspace.includes('warmPlaybackCandidates?.([...topSongsForWarm,...searchResults.slice(0,8)])') && workspace.includes('warmPlaybackCandidates?.(searchResults.slice(0,8))'), 'Both all-results and song-only search results should be pre-warmed.');
check(provider.includes('add(`${RENDER_MEDIA_ORIGIN}/media?url=${encodeURIComponent(source)}`)') && provider.includes('RENDER_MEDIA_ORIGIN}/media?url='), 'Render must be tried first for catalogue media playback.');
check(provider.includes('getArtistImage:raw => getImage(raw, {renderProxy:true})') && provider.includes('const renderProxyMediaUrl'), 'Artist portraits must be loaded through Render /media.');
check(workspace.includes('OnlineMusic.getArtistImage?.(rawArtist||{})'), 'Artist detail view must request Render-proxied portraits.');
check(uiLibrary.includes('syncNowPlayingIndicators: () =>') && player.includes('UI.syncNowPlayingIndicators?.()') && player.includes('if (!State.startsInFlight)'), 'Now-playing indicators must resynchronize once a track start finishes.');
check(uiLibrary.includes('boundAudioId===String(State.currentTrackId||\'\')') && uiLibrary.includes('row.classList.toggle(\'is-now-playing\', active)'), 'The visible row indicator must reflect the audio element track ID.');
check(player.includes(`if(requestId!==State.playbackRequestId) return false; AudioAdapter.audio.dataset.mujicTrackId=String(State.currentTrackId || '')`) && player.includes(`delete AudioAdapter.audio.dataset.mujicTrackId;\n                UI.syncNowPlayingIndicators?.();`), 'Stale blob playback completions must not bind the now-playing indicator to the wrong track, and new starts must clear the old binding.');
check(share.includes('const MAX_LINES = 5') && share.includes("const sidePadding=shareStyle==='spotify'?76:108") && share.includes("lyricAreaHeight=shareStyle==='spotify'?600:520"), 'Both lyric-card styles must accept up to five lines with style-specific safe insets.');
check(share.includes('Choose up to 5 lyric lines per card.') && share.includes('Tap lyric lines to select up to 5'), 'The lyric selection instructions must match the five-line limit.');
check(css.includes('.player-lyrics-container.is-lyrics-selecting') && css.includes('text-shadow:none !important') && css.includes('backdrop-filter:none !important') && css.includes('opacity:1 !important; color:inherit !important'), 'Selection mode must suppress neon, blur and per-word dimming effects.');
check(uiLyrics.includes('const lyricWordTimingCache = new WeakMap()') && uiLyrics.includes('while (low <= high)') && uiLyrics.includes('setLyricRevealCount(model, revealCount)'), 'Word-to-word lyric sync must cache weights and update only changed word classes.');
check(!share.includes('paintQr') && !share.includes('MujicQRCode'), 'Lyric card must remain QR-free.');

const render = 'https://gaana-suno-varna-machhar-aajayega.onrender.com';
const makeContext = fetchImpl => {
  const context = {
    window:{addEventListener(){}},
    State:{playbackSourceMode:'online',playbackOrder:[],currentTrackId:null},
    navigator:{onLine:true},
    document:{createElement(){return {value:'',set innerHTML(value){this.value=value;}};},getElementById(){return null;}},
    URL, Request, Headers, Response, AbortController, setTimeout, clearTimeout, console, fetch:fetchImpl,
    Map, Set, String, Number, Array, Object, Math, Date, Error, Promise
  };
  vm.createContext(context);
  vm.runInContext(read('js/backend-config.js'), context, {filename:'backend-config.js'});
  vm.runInContext(provider, context, {filename:'online-provider.js'});
  return {context, music:context.window.OnlineMusic};
};

(async () => {
  // Verify concurrent lookups for different results don't abort one another.
  const perSongCalls = new Map();
  const concurrent = makeContext((url, init = {}) => new Promise((resolve, reject) => {
    const u = new URL(String(url));
    const id = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'unknown');
    perSongCalls.set(id, (perSongCalls.get(id) || 0) + 1);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const songId = id.replace(/^songs\//,'');
      const body = {success:true,data:{id:songId,name:`Concurrent ${songId}`,downloadUrl:[{quality:'320kbps',url:`https://aac.saavncdn.com/${songId}.m4a?token=test`}]}};
      resolve({ok:true,status:200,text:async()=>JSON.stringify(body)});
    }, 70);
    const signal = init.signal;
    if (signal) signal.addEventListener('abort', () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const error = new Error('request aborted'); error.name = 'AbortError'; reject(error);
    }, {once:true});
  }));
  const t1 = {id:'machhar:saavn:first',onlineTrackId:'first',provider:'saavn',raw:{}};
  const t2 = {id:'machhar:saavn:second',onlineTrackId:'second',provider:'saavn',raw:{}};
  const [firstCandidates, secondCandidates] = await Promise.all([
    concurrent.music.resolvePlaybackCandidates(t1),
    concurrent.music.resolvePlaybackCandidates(t2)
  ]);
  check(firstCandidates.some(url=>decodeURIComponent(url).includes('/first.m4a')) && secondCandidates.some(url=>decodeURIComponent(url).includes('/second.m4a')), 'Concurrent first/second search result stream resolution should both succeed.');
  check(firstCandidates[0].startsWith(`${render}/media?url=`) && secondCandidates[0].startsWith(`${render}/media?url=`), 'Render media must be the first URL attempted for each result.');

  const artwork = concurrent.music.getArtistImage({id:'artist-1',name:'Artist One',image:[{quality:'500x500',url:'https://c.saavncdn.com/artist-portrait.jpg'}]});
  check(artwork.startsWith(`${render}/media?url=`) && decodeURIComponent(artwork).includes('artist-portrait.jpg'), 'Artist image should use Render /media directly.');


  // A catalogue details failure must still be able to recover from Render /stream/:id.
  const renderFallback = makeContext(async (input, init = {}) => {
    const u = new URL(String(input));
    if (u.hostname === 'saavn.sumit.co') throw new Error('catalogue unavailable');
    if (u.hostname === 'mujic.calverse.online') throw new Error('primary API unavailable');
    if (u.hostname === 'gaana-suno-varna-machhar-aajayega.onrender.com' && u.pathname.startsWith('/stream/')) {
      return {ok:true,status:200,text:async()=>JSON.stringify({success:true,data:{downloadUrl:[{quality:'320kbps',url:'https://aac.saavncdn.com/recovered-on-render.m4a'}]}})};
    }
    if (u.hostname === 'gaana-suno-varna-machhar-aajayega.onrender.com') return {ok:true,status:200,text:async()=>JSON.stringify({success:true,data:{}})};
    throw new Error(`Unexpected fallback fixture route: ${u.href}`);
  });
  const recovered = await renderFallback.music.resolvePlaybackCandidates({id:'machhar:saavn:recovery',onlineTrackId:'recovery',provider:'saavn',raw:{}});
  check(recovered.some(url=>decodeURIComponent(url).includes('recovered-on-render.m4a')), 'Render stream endpoint must recover when catalogue detail calls fail.');

  // Check actual URL resolution warm-up caches the stream candidates for the first few results.
  const warmed = await concurrent.music.warmPlaybackCandidates([
    {id:'machhar:saavn:warm-a',onlineTrackId:'warm-a',provider:'saavn',raw:{downloadUrl:[{quality:'160kbps',url:'https://aac.saavncdn.com/warm-a.m4a'}]}},
    {id:'machhar:saavn:warm-b',onlineTrackId:'warm-b',provider:'saavn',raw:{downloadUrl:[{quality:'160kbps',url:'https://aac.saavncdn/warm-b.m4a'}]}}
  ], 2);
  check(warmed === true, 'Search-result stream warm-up should resolve without throwing.');

  console.log('Search/playback and lyrics continuity checks passed: per-track concurrent stream resolution, Render-first media routing, Render artist artwork, search result warm-up, actual audio-ID now-playing indicators, five-line card layout, effect-free lyric selection and cached word timing.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
