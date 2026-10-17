const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const sw = read('sw.js');
const provider = read('js/online-provider.js');
const workspace = read('js/online-workspace.js');
const css = read('css/online-workspace.css');
const changelog = JSON.parse(read('changlog.json'));
check(pkg.version === '12.0.40' && /application-version" content="12\.0\.40/.test(html) && read('VERSION').trim() === '12.0.40', 'App version metadata must be 12.0.40.');
check(/mujic-pwa-v12\.0\.40-online-polish-resume-lyrics/.test(sw), 'Service worker cache namespace must be bumped.');
check(changelog.version === pkg.version && changelog.latest.version === pkg.version, 'Changelog must match app version.');
const home = html.match(/<section id="view-online-home"[\s\S]*?<section id="view-online-artists"/)[0];
check(home.indexOf('id="online-shelf-collections-wrap"') < home.indexOf('id="online-shelf-quick-wrap"'), 'Your Playlists must appear before discovery shelves.');
check(home.indexOf('class="online-brand-footer"') > home.indexOf('id="online-shelf-albums-wrap"') && /online-brand-wordmark">Mujic<\/div>/.test(home), 'The last element on Online Home must be the visible Mujic wordmark footer.');
check(/const uniqueArtistItems = items =>/.test(workspace) && /const list=uniqueArtistItems\(items\);/.test(workspace) && /const source=uniqueArtistItems\(items\);/.test(workspace), 'Artist rails and mosaic must deduplicate normalized artist names and IDs.');
check(/class="online-media-action online-media-more" data-action="track-options"/.test(workspace) && /openPlaylistPicker\(State\.actionTargetId\)/.test(read('js/ui-events.js')), 'Online track cards must expose existing playlist/queue actions.');
check(/Range:'bytes=0-262143'/.test(provider) && /_mujic_prefetch/.test(provider) && /streamCache\.set\(next\.id, \{url:url\.href/.test(provider) && /prefetchStreams,/.test(provider), 'Next track must warm only the initial 256 KiB when PWA-controlled.');
check(/serveCachedMediaRange/.test(sw) && /Content-Range/.test(sw) && /MAX_MEDIA_CHUNK_BYTES = 262144/.test(sw), 'Service worker must reuse cached media ranges and pass later byte ranges upstream.');
check(/MAX_MEDIA_IMAGE_ENTRIES = 50/.test(sw) && /MAX_MEDIA_IMAGE_BYTES = 20 \* 1024 \* 1024/.test(sw) && /loading="lazy" decoding="async"/.test(workspace), 'Artwork should remain lazy-loaded and have a bounded cache.');
check(/response\.status!==206/.test(provider) && /Number\.isFinite\(Number\(contentRange\[3\]\)\)/.test(provider), 'Next-track prefetch must refuse non-partial or oversized responses rather than downloading a full song.');
check(/data-action=\"online-scroll-rail\" data-target=\"online-shelf-for-you-artists\"/.test(read('index.html')) && /online-detail-similar-rail/.test(workspace), 'Desktop artist rails must have explicit scroll controls for Home and Similar Artists.');
check(/modeResumePendingTrackId/.test(read('js/player.js')) && /OnlineWorkspace\.saveQueueSnapshot\(current\?\.source===\'machhar-online\'\?\'online\':\'offline\'\)/.test(read('js/player.js')), 'Track position must persist per workspace and resume from the saved position after switching modes.');
check(/Remember the last local track\/queue even when automatic resume is disabled/.test(read('js/app.js')) && /restoredPlaybackResume=State\.currentTrackId\?\{trackId:State\.currentTrackId,position:resumePosition/.test(workspace), 'The last local track must remain saved across restarts when autoplay resume is disabled.');
check(/Lyrics\.ovh/.test(read('js/lyrics.js')) && /lyrics\/ovh/.test(read('backend/app.py')) && /cached\?\.unavailable\s*&&\s*navigator\.onLine/.test(read('js/lyrics.js')), 'Both online and offline song lyrics must retry the free Lyrics.ovh fallback after an unavailable result.');
check(/mujic-media-chunks-v3/.test(sw) && /mujic-media-images-v3/.test(sw) && /mujic-media-chunks-v\d+/.test(sw) && /mujic-media-images-v\d+/.test(sw), 'New worker must use fresh media caches and delete stale media cache versions.');
check(/online-playing-row/.test(read('js/ui-player.js')) && /NOW PLAYING/.test(css), 'Current song must be highlighted in the queue.');
check(/body\.online-mode #view-online-home \.online-brand-wordmark\{[^}]*-webkit-text-fill-color:rgba\(255,255,255,\.30\)!important/s.test(css), 'Mujic wordmark must have a visible high-contrast fill on the black Online Home background.');
check(/body\.online-mode #main-content\{max-width:min\(100%,1480px\)!important/.test(css), 'Desktop Online workspace should better use horizontal space.');
// Exercise the worker's byte-range storage behavior with mocked fetch/Cache APIs.
class MockCache {
  constructor(){ this.map = new Map(); }
  key(req){ return typeof req === 'string' ? req : req.url; }
  async put(req,res){ this.map.set(this.key(req),res.clone()); }
  async match(req){ const value=this.map.get(this.key(req)); return value ? value.clone() : undefined; }
  async keys(){ return [...this.map.keys()].map(url=>new Request(url)); }
  async delete(req){ return this.map.delete(this.key(req)); }
}
const cacheMap = new Map();
const cachesMock = {
  async open(name){ if(!cacheMap.has(name))cacheMap.set(name,new MockCache()); return cacheMap.get(name); },
  async delete(name){ return cacheMap.delete(name); },
  async keys(){ return [...cacheMap.keys()]; }
};
const listeners = {};
const sandbox = {
  self: { location:{origin:'https://mujic.test'}, addEventListener:(type,fn)=>{listeners[type]=fn;}, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
  caches:cachesMock, URL, Request, Response, Headers, Date, Math, Number, String, Array, Promise, Set, Map, RegExp,
  fetch: async (url, options={}) => {
    const range = new Headers(options.headers||{}).get('Range') || '';
    const match = range.match(/^bytes=(\d+)-(\d*)$/i);
    const start = match ? Number(match[1]) : 0;
    const requestedEnd = match && match[2] ? Number(match[2]) : 999999;
    const end = Math.min(requestedEnd,999999);
    const bytes = new Uint8Array(Math.max(0,end-start+1));
    for(let i=0;i<bytes.length;i++)bytes[i]=(start+i)%251;
    return new Response(bytes,{status:206,headers:{'Content-Type':'audio/mp4','Content-Length':String(bytes.length),'Content-Range':`bytes ${start}-${end}/1000000`,'Accept-Ranges':'bytes'}});
  },
  console, setTimeout, clearTimeout
};
// Evaluate the worker in a persistent mocked service-worker environment so the route function is callable for tests.
const workerSandbox = { ...sandbox };
vm.createContext(workerSandbox);
vm.runInContext(sw, workerSandbox, {filename:'sw.js'});
(async()=>{
  const source='https://aac.saavncdn.com/test-track.m4a?token=fixture';
  const route=`https://mujic.test/mujic/__mujic_media__?src=${encodeURIComponent(source)}&_mujic_prefetch=1`;
  const prefetchRequest=new Request(route,{headers:{Range:'bytes=0-262143',Accept:'audio/*'}});
  const prefetched=await vm.runInContext('handleMediaRoute',workerSandbox)(prefetchRequest);
  check(prefetched.status===206,'Preload must remain a partial-content response.');
  const prefetchedBytes=await prefetched.arrayBuffer();
  check(prefetchedBytes.byteLength===262144,'Next-track preload must be capped at 256 KiB.');
  const playbackUrl=route.replace('&_mujic_prefetch=1','');
  const firstRange=await vm.runInContext('handleMediaRoute',workerSandbox)(new Request(playbackUrl,{headers:{Range:'bytes=0-999999',Accept:'audio/*'}}));
  check(firstRange.status===206 && firstRange.headers.get('Content-Range')==='bytes 0-262143/1000000','Playback must serve the cached initial range accurately.');
  check((await firstRange.arrayBuffer()).byteLength===262144,'Playback initial chunk should be served from cache.');
  const secondRange=await vm.runInContext('handleMediaRoute',workerSandbox)(new Request(playbackUrl,{headers:{Range:'bytes=262144-999999',Accept:'audio/*'}}));
  check(secondRange.status===206 && secondRange.headers.get('Content-Range')==='bytes 262144-999999/1000000','Subsequent ranges must continue upstream seamlessly.');
  check((await secondRange.arrayBuffer()).byteLength===737856,'Subsequent range body length is incorrect.');
  console.log('v12.0.40 checks OK: playlist ordering, bottom watermark, deduplicated artists, playlist actions, lazy artwork, capped next-track range cache and seamless subsequent ranges.');
})().catch(error=>{console.error(error);process.exitCode=1;});
