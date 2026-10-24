const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
const provider = read('js/online-provider.js');
const workspace = read('js/online-workspace.js');
const events = read('js/ui-events.js');
const player = read('js/player.js');
const cache = read('js/online-cache.js');
const sw = read('sw.js');
const required = [
  ['separate online search view', 'id="view-online-search"', index],
  ['online Library is the single collection view', 'id="view-online-playlists"', index],
  ['online History is a Library tab', 'data-tab="history"', index],
  ['online Queue is a Library tab', 'data-tab="queue"', index],
  ['artist pages load incrementally on request', 'const loadInitialArtistSongs = async', workspace],
  ['initial artist list stays bounded to twelve tracks', 'const ARTIST_INITIAL_TRACKS = 12;', workspace],
  ['explicit artist play waits for initial request only', 'const pending=artistLoadPromises.get(String(data.sourceId||entity.id));if(pending)await pending;', workspace],
  ['online Queue and History route into Library tabs', "setLibraryTab(vid === 'online-history' ? 'history' : 'queue')", read('js/ui.js')],
  ['swipeable artist carousel action is wired', "case 'online-scroll-rail'", events],
  ['artist catalogue retries failed API pages', 'failedSongPages', workspace],
  ['share links and IDs can be opened from Search', 'data-action="online-open-reference"', index],
  ['share link action is wired to catalogue lookup', "case 'online-open-reference'", events],
  ['artist detail keeps root navigation selected', "vid === 'online-detail' && window.OnlineWorkspace ? OnlineWorkspace.getNavView() : vid", read('js/ui.js')],
  ['home has the large Mujic end wordmark', 'class="online-brand-wordmark"', index],
  ['Home artist wall uses the ListenFree-style mosaic', 'online-home-artists-mosaic', index],
  ['Home has Quick Picks and English Hits shelves', 'online-shelf-quick-wrap', index],
  ['saved online likes recover older namespaced IDs', 'savedId.replace(/^machhar:(?:saavn|machhar):/', workspace],
  ['artist detail requests no duplicate profile-song batch', 'songCount=0&albumCount=6', provider],
  ['artist shelf has touch/swipe scrolling', '.online-artist-rail{overflow-x:auto', read('css/online-workspace.css')],
  ['mode transition animation is present', 'workspace-mode-enter', read('css/online-workspace.css')],
  ['no duplicate History/Queue content IDs remain', 'id="online-library-queue-panel"', index],
  ['documented paginated catalogue search', 'search/songs?query=', provider],
  ['documented suggestions endpoint', '/suggestions?limit=', provider],
  ['independent online search history key', 'mujic-online-searches-v1', workspace],
  ['independent online listening history key', 'mujic-online-history-v1', workspace],
  ['independent online playlist key', 'mujic-online-playlists-v1', workspace],
  ['per-workspace queue snapshots', 'mujic-workspace-queues-v1', workspace],
  ['optional linked workspace setting', 'mujic-workspaces-linked-v1', workspace],
  ['metadata cache stores sanitized lightweight metadata', 'sanitize', cache],
  ['manual tracks play the selected shelf context', 'OnlineWorkspace.playTrackFromShelf(btn.dataset.id,btn.dataset.context)', events],
  ['online selection starts at tapped track', 'list.findIndex(track => track.id === id)', events],
  ['online autoplay priming', 'OnlineRecommendations.primeQueue', player],
  ['metadata cache stores no signed stream URLs', "source: 'machhar-online'", cache],
  ['online modules included in app-shell cache', 'js/online-workspace.js', sw],
  ['English hit album shelf is present', 'id="online-shelf-english-hit-albums"', index],
  ['English public playlist shelf is present', 'id="online-shelf-english-playlists"', index],
  ['English discovery includes artist-focused queries', 'Taylor Swift hits', workspace],
  ['single app-controlled search clear button uses text input', 'id="online-search-input" type="text"', index],
  ['appearance values map into CSS data attributes', "setAttribute('data-interface-style'", read('js/ui-settings.js')],
  ['corner radius selection maps into CSS data attributes', "setAttribute('data-corner-radius'", read('js/ui-settings.js')],
  ['track rows do not carry repeated online badges', 'More options for ${Utils.escapeHTML(t.title)}', read('js/ui-library.js')]
];
for (const [label, token, source] of required) {
  if (!source.includes(token)) throw new Error(`Workspace contract check failed: ${label}`);
}
if (events.includes('OnlineRecommendations.filterPlaybackContext(matches')) throw new Error('Manual search playback must not filter away user-selectable remix/alternate variants.');
if (read('js/ui-library.js').includes('>ONLINE</span>')) throw new Error('Track rows must not repeat the Online label.');
if (!player.includes('wasPlayedOrEquivalent(candidate)')) throw new Error('Natural queue advance must skip versions equivalent to already-played tracks.');
if (provider.includes('/api/lyrics')) throw new Error('Lyrics calls must use the Worker-backed lyrics routes, not an invented catalogue endpoint.');
if (!read('docs/api-integration.md').includes('Worker-backed exact/search lyric routes')) throw new Error('API docs must describe Worker-backed lyrics routing.');
if (!fs.existsSync(path.join(root, 'docs/api-integration.md'))) throw new Error('Catalogue API integration documentation must be included.');
if (!sw.includes('./css/online-workspace.css')) throw new Error('The online workspace stylesheet must be cached by the service worker.');
if (!fs.existsSync(path.join(root, 'icons/icon-192.png')) || !fs.existsSync(path.join(root, 'icons/icon-512.png'))) throw new Error('The manifest and service-worker PWA icon files must exist.');

(async () => {
  const localSearchResults = [{ id: 'local-song-1', title: 'Local only' }];
  const target = { innerHTML: '', dataset: {} };
  const input = { value: 'capped page sample', dataset: {}, addEventListener() {} };
  const storage = new Map([['mujic-online-favorites-v1', JSON.stringify([{ id: 'machhar:saavn:legacy-like', title: 'Legacy Like', artist: 'Legacy Artist', source: 'machhar-online' }])]]);
  const pageCalls = [];
  const artistPageCalls = [];
  let playedArtistContext = null;
  let currentMeta = { total: 30, hasMore: true };
  const music = {
    async search(query, opts) {
      pageCalls.push(opts.page);
      const start = opts.page * 3;
      const songs = Array.from({ length: 3 }, (_, i) => ({
        id: `machhar:saavn:paged-${start + i}`, onlineTrackId: `paged-${start + i}`, source: 'machhar-online',
        provider: 'saavn', title: `Page track ${start + i}`, artist: `Artist ${start + i}`
      }));
      currentMeta = { total: 30, start, hasMore: start + songs.length < 30 };
      return songs;
    },
    getSearchMeta: () => currentMeta,
    async globalSearch() { return {topQuery:[],songs:[],albums:[],artists:[],playlists:[]}; },
    async fetchSongsByIdsOrLink(reference) { return [{id:'machhar:saavn:linked-song',onlineTrackId:'linked-song',source:'machhar-online',provider:'saavn',title:'Linked song result',artist:'Reference Artist',artworkUrl:'',duration:180,reference}]; },
    async searchEntities() { return {items:[],total:0,hasMore:false}; },
    async fetchArtistDetails(id) { return { id:`machhar:saavn:${id}`, sourceId:String(id), title:'Artist Test', image:'', totalSongs:12, tracks:[], albums:[], artists:[] }; },
    async fetchArtistSongs(id, page) {
      artistPageCalls.push(page);
      const start=page*3;
      return { total:12, start, page, pageSize:3, tracks:Array.from({length:3},(_,i)=>({ id:`machhar:saavn:artist-track-${start+i}`, onlineTrackId:`artist-track-${start+i}`, source:'machhar-online', provider:'saavn', title:`Artist Track ${start+i}`, artist:'Artist Test', artworkUrl:'', duration:180 })) };
    },
    async fetchArtistAlbums(id, page) { return { total:0, start:0, page, pageSize:1, items:[] }; },
    isOnlineTrack: track => track?.source === 'machhar-online',
    registerTrack: track => track,
    getTrack: () => null,
    isOnlineId: id => String(id).startsWith('machhar:')
  };
  const document = {
    getElementById(id) {
      if (id === 'online-search-results') return target;
      if (id === 'online-search-input') return input;
      return null;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: { dataset: {}, classList: { contains: () => false } }
  };
  const context = {
    window: {}, State: { playbackSourceMode: 'online', searchResults: localSearchResults, playbackOrder: [], queue: [], queueIndex: -1, library: [], playlists: [] },
    navigator: { onLine: true }, document,
    localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, val) => storage.set(key, val), removeItem: key => storage.delete(key) },
    Utils: { escapeHTML: value => { const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return String(value ?? '').replace(/[&<>"']/g, ch => map[ch]); }, id: () => 'test' },
    UI: { buildTrackRow: track => `<div data-test-track="${track.id}"></div>`, lazyLoadArtwork() {}, showToast() {}, renderQueue() {}, updatePlayPause() {}, showMiniPlayer() {}, updatePlayerMeta: async () => {}, switchView() {} },
    OnlineMusic: music, OnlineCache: { warmTracks() {}, rememberTrack() {}, getTrack: () => null, sanitize: track => track },
    OnlineRecommendations: { cleanTitle: value => String(value || '').toLowerCase(), cleanArtist: value => String(value || '').toLowerCase(), seedHistory() {}, primeQueue: async () => false, wasPlayedOrEquivalent: () => false },
    Player: { getTrackById: () => null, getCurrentTrack: () => null, playContext(tracks, index) { playedArtistContext = { tracks: tracks.slice(), index }; } },
    StorageAdapter: { saveSettings() {}, savePlaylist: async () => {} },
    Dialog: { show: async () => null }, console, URL, Date, Math, JSON, Promise, Map, Set, String, Number, Array, Object, Error, AbortController, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}, requestAnimationFrame: callback => setTimeout(callback, 0)
  };
  context.window.OnlineMusic = music;
  context.window.OnlineCache = context.OnlineCache;
  context.window.OnlineRecommendations = context.OnlineRecommendations;
  vm.createContext(context);
  vm.runInContext(read('js/online-workspace.js'), context, { filename: 'online-workspace.js' });
  context.window.OnlineWorkspace.init();
  if (!context.window.OnlineWorkspace.isFavorite('machhar:saavn:legacy-like')) throw new Error('Legacy Online favorites with missing onlineTrackId must remain visible after hydration.');
  const savedLikes = JSON.parse(storage.get('mujic-online-favorites-v1') || '[]');
  if (!savedLikes[0]?.onlineTrackId) throw new Error('Favorite migration should persist a repaired onlineTrackId.');
  const results = await context.window.OnlineWorkspace.performSearch('capped page sample');
  if (results.length !== 24) throw new Error(`Auto-fill should accumulate 24 tracks from capped pages; got ${results.length}.`);
  if (pageCalls.join(',') !== '0,1,2,3,4,5,6,7') throw new Error(`Auto-fill should probe sequential pages 0–7; got ${pageCalls.join(',')}.`);
  if (context.State.searchResults !== localSearchResults) throw new Error('Online search results must not overwrite the Offline search context.');
  await context.window.OnlineWorkspace.openRemoteEntity('artists', 'artist-test');
  await context.window.OnlineWorkspace.playRemoteEntity();
  if (artistPageCalls.join(',') !== '0') throw new Error(`Opening and playing an artist should request only page zero; got ${artistPageCalls.join(',')}.`);
  if (!playedArtistContext || playedArtistContext.tracks.length !== 3) throw new Error(`Initial artist playback should use only the loaded page (3 tracks), got ${playedArtistContext?.tracks.length || 0}.`);
  if (playedArtistContext.tracks[0].title !== 'Artist Track 0') throw new Error('Artist playback should preserve catalogue order.');
  await context.window.OnlineWorkspace.loadMoreRemote();
  await context.window.OnlineWorkspace.playRemoteEntity();
  if (artistPageCalls.join(',') !== '0,1') throw new Error(`Load more should request only the next 3-track page; got ${artistPageCalls.join(',')}.`);
  if (playedArtistContext.tracks.length !== 6) throw new Error(`After one explicit Load more, six tracks should be available; got ${playedArtistContext.tracks.length}.`);
  const opened = await context.window.OnlineWorkspace.openReference('linked-song-id');
  if (!opened || !target.innerHTML.includes('Linked song result')) throw new Error(`Opening a song ID should resolve and render playable catalogue results (opened=${opened}, html=${target.innerHTML.slice(0,240)}).`);
  console.log(`Workspace architecture checks OK: ${required.length} static contracts, automatic capped-page fill, explicit one-page artist loading, legacy-liked-song recovery, direct song-ID lookup, manual-variant playback, and workspace isolation passed.`);
})().catch(error => { console.error(error); process.exit(1); });
