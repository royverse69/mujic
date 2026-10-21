const fs = require('node:fs');
const vm = require('node:vm');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const read = file => fs.readFileSync(file, 'utf8');

const provider = read('js/online-provider.js');
const playerSource = read('js/player.js');
const sw = read('sw.js');
const html = read('index.html');
const css = read('css/app.css');
const lyricsShare = read('js/lyrics-share.js');
const pkg = JSON.parse(read('package.json'));
const changelog = JSON.parse(read('changlog.json'));

check(pkg.version === '13.0.14' && read('VERSION').trim() === pkg.version && changelog.version === pkg.version, 'Release versions must match.');
check(Array.isArray(changelog.entries) && changelog.entries[0]?.version === pkg.version, 'The current release must be in the top-level changelog entries used by Settings.');
check(provider.includes('return { API_BASE, BACKEND_BASE:LEGACY_BASE') && /resolvePlaybackCandidates\s*,\s*markStreamWorking/.test(provider), 'OnlineMusic must export both stream-candidate functions called by the player.');
check(playerSource.includes('OnlineMusic.resolvePlaybackCandidates(track') && playerSource.includes('OnlineMusic.markStreamWorking?.('), 'The player should resolve and record working stream candidates.');
check(playerSource.includes('audio.removeAttribute(\'crossorigin\')') && playerSource.includes('await ready;'), 'Normal media playback must not force CORS and must await media readiness.');
check(sw.includes('looksLikeErrorPayload') && sw.includes('fallbackRequest'), 'Service worker must fall back when a media proxy returns an error payload.');
check(!html.includes('id="lyrics-share-start-btn"') && html.includes('id="player-more-share-lyrics"') && html.includes('data-action="lyrics-share-start"'), 'Share lyrics must be available from the full player More Options menu, not the transport row.');
check(lyricsShare.includes('function startSelection()') && lyricsShare.includes('const MAX_LINES = 4'), 'The share action must start line selection with a four-line limit.');
check(/\.lyrics-share-selection-bar\s*\{[^}]*z-index:\s*3190/s.test(css), 'The selected-lyrics toolbar must appear above the full-screen player.');

// Run the real AudioAdapter.playRemote method against a fake HTMLAudioElement. This catches
// failures in the ready/error lifecycle without requiring a network or an installed browser.
class FakeAudio {
  constructor() {
    this.listeners = new Map(); this.dataset = {}; this.readyState = 0; this.error = null;
    this.paused = true; this.currentTime = 0; this.duration = 0; this._src = '';
    this.attributes = new Set(); this.volume = 1; this.preload = 'none'; this.playbackRate = 1;
  }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ type, target: this }); }
  set src(value) { this._src = String(value || ''); if (this._src) this.attributes.add('src'); }
  get src() { return this._src; }
  removeAttribute(name) { this.attributes.delete(String(name).toLowerCase()); if (String(name).toLowerCase() === 'src') this._src = ''; if (String(name).toLowerCase() === 'crossorigin') this.crossOrigin = undefined; }
  load() {
    this.error = null;
    if (!this._src) { this.readyState = 0; return; }
    if (this._src.includes('mock-failure')) {
      this.readyState = 0; this.error = { code: 4, message: 'Mock unsupported media source' }; this.dispatch('error'); return;
    }
    this.readyState = 3; this.duration = 180; this.dispatch('loadedmetadata'); this.dispatch('loadeddata'); this.dispatch('canplay');
  }
  async play() { if (!this._src || this.error) throw new Error('Mock playback rejected.'); this.paused = false; return true; }
  pause() { this.paused = true; }
}

(async () => {
  const calls = { playPause: 0, progress: 0, duration: 0 };
  const State = {
    playbackRequestId: 1, currentTrackId: 'mock-track', currentTime: 0, duration: 0, resumePosition: 0,
    visualizerMode: 'off', loudnessControl: false, crossfade: false, eqBands: [], isPlaying: true,
    playbackSourceMode: 'online', playbackOrder: [], queueIndex: 0, volume: 1, muted: false
  };
  const window = { addEventListener() {}, removeEventListener() {} };
  const document = { addEventListener() {}, getElementById() { return null; } };
  const navigator = { onLine: true };
  const UI = {
    updatePlayPause() { calls.playPause++; }, updateProgress() { calls.progress++; }, updateDuration() { calls.duration++; },
    showToast() {}, updatePlayerMeta: async () => {}, showMiniPlayer() {}, renderQueue() {}, updateHighlights() {}
  };
  const sandbox = {
    window, document, navigator, State, UI, Audio: FakeAudio, console: { warn() {}, error() {}, log() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, DOMException,
    Stats: { consumeAudioDelta() {}, flush() {}, recordPlay() {} },
    StorageAdapter: { saveSettings: async () => {}, getAudioBlob: async () => null, saveTrackMeta() {}, recordPlayHistory: async () => null },
    Utils: { warn() {} }, OnlineMusic: { invalidateStream() {}, resolvePlaybackCandidates: async () => [], markStreamWorking() {}, prefetchStreams: async () => {} },
    OnlineRecommendations: {}, OnlineWorkspace: {}, Library: {}, Playlists: {}, Dialog: {},
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  };
  vm.runInNewContext(`${playerSource}\nwindow.__mujicTest = { AudioAdapter, Player };`, sandbox, { filename: 'player.js' });
  const { AudioAdapter } = sandbox.window.__mujicTest;
  State.playbackRequestId = 1;
  const success = await AudioAdapter.playRemote('https://media.example/mock-success.mp3', 'test success', 1, false);
  check(success === true, 'A ready audio stream should start successfully.');
  check(AudioAdapter.audio.dataset.mujicTrackId === 'mock-track', 'Successful playback should bind the track ID to the audio element.');
  check(!AudioAdapter.audio.attributes.has('crossorigin'), 'Ordinary stream playback must not force cross-origin mode.');

  State.playbackRequestId = 2;
  State.isPlaying = true; State.currentTime = 14; State.duration = 180;
  const failed = await AudioAdapter.playRemote('https://media.example/mock-failure.mp3', 'test failure', 2, false);
  check(failed === false, 'A source that emits media error must fail rather than report success.');
  check(State.isPlaying === false && State.currentTime === 0 && State.duration === 0, 'Failed remote playback must reset stale playing/time/duration state.');
  check(calls.playPause > 0 && calls.progress > 0 && calls.duration > 0, 'Failed remote playback must refresh visible controls and timeline.');

  // Exercise the service worker's actual fallback path: a nominal HTTP 200 JSON error from
  // the primary proxy must not be mistaken for audio, and should fall through to Render.
  const swCalls = [];
  const swListeners = {};
  const swSandbox = {
    self: { location:{origin:'https://royverse69.github.io'}, addEventListener(type, fn) { swListeners[type] = fn; }, skipWaiting:async()=>{}, clients:{claim:async()=>{}} },
    caches: { open:async()=>({}), keys:async()=>[], delete:async()=>true },
    fetch: async url => {
      const target = String(url); swCalls.push(target);
      if (target.startsWith('https://mujic.calverse.online/media')) {
        return new Response(JSON.stringify({error:'not audio'}), {status:200, headers:{'Content-Type':'application/json'}});
      }
      if (target.startsWith('https://gaana-suno-varna-machhar-aajayega.onrender.com/media')) {
        return new Response(new Uint8Array([1,2,3,4]), {status:206, headers:{'Content-Type':'audio/mpeg','Content-Range':'bytes 0-3/4','Accept-Ranges':'bytes'}});
      }
      throw new Error(`Unexpected test fetch: ${target}`);
    },
    URL, Request, Headers, Response, AbortController, setTimeout, clearTimeout, Date, Promise, Map, Set, Math, Number, String, Array, Object, Error, console
  };
  vm.runInNewContext(`${sw}; self.__mujicTest = { fetchBackendMedia };`, swSandbox, {filename:'sw.js'});
  const mediaRequest = new Request('https://royverse69.github.io/mujic/__mujic_media__?src=fixture', {headers:{Range:'bytes=0-3', Accept:'audio/*'}});
  const mediaResponse = await swSandbox.self.__mujicTest.fetchBackendMedia('https://aac.saavncdn.com/test.m4a', mediaRequest);
  check(mediaResponse.status === 206 && mediaResponse.headers.get('Content-Type') === 'audio/mpeg', 'The media proxy should use the valid fallback audio response when the primary returns JSON.');
  check(swCalls.length === 2 && swCalls[0].startsWith('https://mujic.calverse.online/media') && swCalls[1].startsWith('https://gaana-suno-varna-machhar-aajayega.onrender.com/media'), 'The SW must try primary then fallback in order.');

  console.log('Playback recovery checks passed: exported stream methods, audio readiness/failure lifecycle, non-CORS playback path, actual mocked SW media fallback, visible lyric-share action, toolbar layering, and release metadata.');
})().catch(error => { console.error(error); process.exitCode = 1; });
