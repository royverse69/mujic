const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const pkg = JSON.parse(read('package.json'));
const version = read('VERSION').trim();
const html = read('index.html'), sw = read('sw.js'), core = read('js/core.js'), storage = read('js/storage.js');
const provider = read('js/online-provider.js'), workspace = read('js/online-workspace.js'), library = read('js/ui-library.js');
const onboarding = read('js/onboarding.js'), app = read('js/app.js'), css = read('css/app.css');

check(html.includes(`application-version" content="${version}"`) && sw.includes(`mujic-pwa-v${version}-`), 'HTML and service worker must use the current version.');

// Onboarding wiring
check(html.includes('./js/onboarding.js') && html.indexOf('./js/onboarding.js') < html.indexOf('./js/app.js'), 'onboarding.js must load before app.js.');
check(sw.includes("'./js/onboarding.js'"), 'The service worker must precache onboarding.js.');
check(app.includes('Onboarding?.start'), 'App init must start the onboarding module.');
check(html.includes('data-ob="open-guide"'), 'Settings must offer a way to replay the guide.');
check(onboarding.includes("#view-home .home-header") && onboarding.includes("#view-online-home .home-header"), 'The install banner must be injected into the two Home views only.');
check(onboarding.includes('State.deferredInstallPrompt || isIOS()') && onboarding.includes('isStandalone()'), 'Banner must require installability and hide when already installed.');
for (const topic of ['Offline and Online', 'How Offline works', 'Turn on lyrics', 'Settings']) check(onboarding.includes(topic), `Guide must cover: ${topic}.`);
check(storage.includes("s.onboardingSeen === undefined ? true"), 'Existing users must not be forced through the guide.');
check(core.includes('onboardingSeen: false'), 'New users start with the guide unseen.');
check(css.includes('.install-banner') && css.includes('.ob-overlay'), 'Onboarding styles must exist.');

// Wavy default
check(/visualizerMode:'wave'/.test(core), 'Wavy/wave visualizer must be the default.');
check(storage.includes('waveDefaultApplied') && storage.includes("'waveDefaultApplied'"), 'Wave default migration flag must be persisted.');

// Greeting
check(library.includes("return 'Good night'") && library.includes('updateGreeting') && !library.includes('let greeting = "Good evening"'), 'Offline greeting must follow the time of day.');

// Primary-first playback for tapped search results
check(workspace.includes('OnlineMusic.preferPrimaryMedia?.(selected)'), 'Tapping a search result must prefer the primary backend.');
check(provider.includes('preferPrimaryMedia') && provider.includes('prioritizePrimaryMedia'), 'Provider must expose primary-first ordering.');

// Behavioural test of the ordering logic
const primary = 'https://mujic.calverse.online';
const ctx = {
  window: { addEventListener() {}, MujicBackend: { PRIMARY: primary, origins: () => [primary], isBackendOrigin: o => o === primary, fetchWithFallback: async () => { throw new Error('no network'); } } },
  navigator: { onLine: true, serviceWorker: undefined }, location: { href: 'https://app.example/', protocol: 'https:', origin: 'https://app.example' },
  document: { createElement: () => ({}), addEventListener() {} }, console, setTimeout, clearTimeout, AbortController, URL, URLSearchParams, Request: class {}, DOMException,
  State: { playbackSourceMode: 'online' }, Utils: { id: () => 'x', warn() {} }, UI: {}, Player: {}, localStorage: { getItem: () => null, setItem() {} }
};
ctx.window.window = ctx.window; vm.createContext(ctx);
try { vm.runInContext(provider + '\nthis.__music = OnlineMusic;', ctx); } catch (error) { console.error("provider failed to load in the test sandbox:", error.message); process.exitCode = 1; }
(async () => {
  const music = ctx.__music;
  if (music) {
    const track = { id: 'machhar:saavn:t1', onlineTrackId: 't1', provider: 'saavn', raw: { downloadUrl: [{ quality: '160kbps', url: 'https://aac.saavncdn.com/t1.m4a' }] } };
    const normal = await music.resolvePlaybackCandidates({ ...track, id: 'machhar:saavn:plain' });
    check(normal.some(url => url.startsWith(`${primary}/media?url=`)) && !normal.some(url => /onrender/.test(url)), 'Non-search playback uses the Worker and never Render.');
    music.preferPrimaryMedia(track);
    const tapped = await music.resolvePlaybackCandidates(track);
    check(tapped[0].startsWith(`${primary}/media?url=`), 'Tapped search results must try mujic.calverse.online first.');
  }
  console.log('v13.0.20 checks passed: onboarding wiring, wavy default, time-aware greeting, primary-first search playback.');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
