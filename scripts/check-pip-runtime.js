const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

class FakeTarget {
    constructor(id = '') {
        this.id = id; this.dataset = {}; this.style = {};
        this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
        this.hidden = false; this.textContent = ''; this.attributes = {}; this.listeners = {}; this.children = [];
        this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 180; this.playbackRate = 1;
        this.readyState = 2; this.isConnected = false; this.naturalWidth = 0; this.complete = false; this.src = ''; this.currentSrc = '';
    }
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
    removeEventListener(type, handler) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== handler); }
    dispatch(type, extra = {}) { for (const handler of [...(this.listeners[type] || [])]) handler({ type, target: this, ...extra }); }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    closest() { return null; }
    contains() { return true; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
    play() { this.paused = false; this.dispatch('play'); this.dispatch('playing'); return Promise.resolve(); }
    pause() { if (!this.paused) { this.paused = true; this.dispatch('pause'); } }
    requestPictureInPicture() { doc.pictureInPictureElement = this; this.dispatch('enterpictureinpicture'); return Promise.resolve({}); }
    getContext() { return context2d; }
    captureStream() { return {}; }
}

const context2d = {
    measureText: value => ({ width: String(value).length * 8 }),
    fillRect() {}, save() {}, restore() {}, beginPath() {}, roundRect() {}, clip() {}, drawImage() {}, fillText() {},
    set fillStyle(value) {}, set font(value) {}, set textAlign(value) {}
};
class FakeCanvas extends FakeTarget { getContext() { return context2d; } captureStream() { return {}; } }
class FakeVideo extends FakeTarget { constructor(id = '') { super(id); this.muted = true; this.srcObject = null; } }

const elements = new Map();
const doc = {
    pictureInPictureEnabled: true, pictureInPictureElement: null, body: new FakeTarget('body'),
    createElement(tag) { return tag === 'canvas' ? new FakeCanvas() : tag === 'video' ? new FakeVideo() : new FakeTarget(); },
    getElementById(id) {
        if (id === 'mujic-pip-video') return elements.get(id) || null;
        if (!elements.has(id)) { const el = new FakeTarget(id); el.isConnected = true; elements.set(id, el); }
        return elements.get(id);
    },
    querySelectorAll() { return []; }, querySelector() { return null; }, addEventListener() {},
    exitPictureInPicture() { doc.pictureInPictureElement = null; return Promise.resolve(); }
};
doc.body.appendChild = element => { element.isConnected = true; elements.set(element.id, element); };
const win = { addEventListener() {}, matchMedia() { return { matches: false }; }, setTimeout, clearTimeout, Utils: { defaultArt: '' } };
win.document = doc;
const audio = new FakeTarget('audio'); audio.duration = 180; audio.currentTime = 0; audio.dataset = {};
const mediaSessionHandlers = {};
const navigator = { userAgent: 'Desktop Chrome', onLine: true, mediaSession: { setActionHandler: (action, handler) => { mediaSessionHandlers[action] = handler; }, playbackState: 'paused' } };
let playRequests = 0, pauseRequests = 0;
const Player = {
    getCurrentTrack: () => ({ id: 'track-1', title: 'Track One', artist: 'Artist' }),
    togglePlay() { playRequests++; return new Promise(resolve => setTimeout(() => { audio.play(); resolve(); }, 25)); },
    pause() { pauseRequests++; audio.pause(); }, previous() {}, next() {}
};
const State = { currentTrackId: 'track-1', duration: 180, currentTime: 0, queueIndex: 0, playbackOrder: ['track-1'], isPlaying: false };
const AudioAdapter = {
    audio,
    setupMediaSession() {
        mediaSessionHandlers.play = () => { const pip = win.MujicNativePiP; if (pip?.requestPlay) return pip.requestPlay(); if (audio.paused) return Player.togglePlay(); };
        mediaSessionHandlers.pause = () => { const pip = win.MujicNativePiP; if (pip?.requestPause) return pip.requestPause(); return Player.pause(); };
    },
    updateMediaSessionPosition() {}, updateMediaSessionMeta() {}, seek(time) { audio.currentTime = time; }
};
const UI = { showToast() {}, closeFullPlayer() {}, closeSheets() {}, updateProgress() {}, updatePlayPause() {}, updateDuration() {}, updateVolumeUI() {}, updatePlayerMeta() { return Promise.resolve(); }, updateHighlights() {}, syncNowPlayingIndicators() {}, switchView() {}, handleSearch() {} };
function HTMLCanvasElement() {}
HTMLCanvasElement.prototype.captureStream = function () {};
const sandbox = {
    window: win, document: doc, navigator, HTMLCanvasElement, AudioAdapter, Player, State, UI,
    Library: {}, OnlineMusic: {}, OnlineWorkspace: {}, OnlineRecommendations: {}, Stats: {}, StorageAdapter: {},
    Utils: { defaultArt: '' }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, Promise, console, URL,
    DOMException, Map, Set, Array, Object, String, Number, Boolean, RegExp, JSON
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ui-events.js'), 'utf8'), sandbox, { filename: 'js/ui-events.js' });
UI.setupGlobalDelegation();
const button = { dataset: { action: 'picture-in-picture' }, closest(selector) { return selector === '[data-action]' ? this : null; } };
const clickHandler = (doc.body.listeners.click || []).find(Boolean);
const fakeClick = { target: button, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };

(async () => {
    if (!clickHandler) throw new Error('Global PiP action handler was not installed.');
    await clickHandler(fakeClick);
    const video = doc.getElementById('mujic-pip-video');
    if (!video || doc.pictureInPictureElement !== video || !win.MujicNativePiP) throw new Error('Native PiP did not open and expose the audio-control bridge.');

    // Simulate an OS Media Session Play action and the video PiP Play event arriving together.
    const playAction = mediaSessionHandlers.play();
    video.play();
    await Promise.resolve(playAction);
    await new Promise(resolve => setTimeout(resolve, 40));
    if (audio.paused || playRequests !== 1) throw new Error(`PiP/Media Session Play did not start audio once: paused=${audio.paused}, requests=${playRequests}.`);

    video.pause();
    await Promise.resolve();
    if (!audio.paused || pauseRequests !== 1) throw new Error(`PiP Pause did not pause audio once: paused=${audio.paused}, requests=${pauseRequests}.`);

    // Playback started from the main page should also update the PiP video state.
    audio.play();
    await Promise.resolve();
    if (video.paused) throw new Error('Native PiP failed to mirror playback started outside the PiP window.');
    await mediaSessionHandlers.pause();
    await Promise.resolve();
    if (!audio.paused) throw new Error('Media Session Pause did not reach the source audio element.');

    doc.pictureInPictureElement = null;
    video.dispatch('leavepictureinpicture');
    console.log('PiP runtime test passed: Play/Pause controls operate the source audio, concurrent native and Media Session Play requests are deduplicated, external playback is mirrored, and cleanup runs on PiP close.');
})().catch(error => {
    const video = doc.getElementById('mujic-pip-video');
    if (video) { doc.pictureInPictureElement = null; video.dispatch('leavepictureinpicture'); }
    console.error(error.stack || error);
    process.exitCode = 1;
});
