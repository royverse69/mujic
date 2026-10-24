const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
  const rel = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'scripts' ? [] : walk(rel);
  return [rel];
});
const shipped = ['.', ...['js', 'css', 'worker', 'docs', 'data']].flatMap(d => d === '.' ? fs.readdirSync(root).filter(f => /\.(html|js|json|webmanifest|md|bat|toml)$/.test(f)) : walk(d));

/* 1. Render and the changelog are gone everywhere that ships. */
const WORKER = 'https://mujic.calverse.online';
for (const file of shipped) {
  const text = read(file);
  check(!/onrender\.com|gaana-suno-varna/i.test(text), `${file} still references the Render backend.`);
}
check(!fs.existsSync(path.join(root, 'backend')), 'The Render backend folder must be removed.');
check(!fs.existsSync(path.join(root, 'changlog.json')) && !fs.existsSync(path.join(root, 'changelog.json')), 'The changelog file must be removed.');
for (const file of ['index.html', 'sw.js', ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`)]) {
  check(!/changlog|changelog|loadChangeLog/i.test(read(file)), `${file} still references the changelog.`);
}
check(!fs.existsSync(path.join(root, 'js/backend.js')), 'The unused duplicate js/backend.js must stay removed.');

/* 2. The browser only ever talks to the Worker. */
const forbidden = /saavn\.sumit\.co|lrclib\.net|api\.lyrics\.ovh|lyricsplus\./;
for (const file of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => `js/${f}`).concat('sw.js')) {
  check(!forbidden.test(read(file)), `${file} must not call an upstream API directly; route it through the Worker.`);
}
const config = read('js/backend-config.js');
check(config.includes(WORKER) && !/FALLBACK/.test(config), 'backend-config.js must expose exactly one origin.');

/* 3. Worker source is valid and implements every route the PWA calls. */
const worker = read('worker/index.js');
for (const route of ["'/media'", "'/api'", "'/search'", "'/trending'", "'/queue/'", "'/stream/'", "'/lyrics/get'", "'/lyrics/search'", "'/lyrics/ovh'", "'/lyricsplus/v2/lyrics/get'", "'/health'"]) {
  check(worker.includes(route), `Worker is missing route ${route}.`);
}
check(worker.includes('caches.default') && worker.includes('stale-while-revalidate') && worker.includes('inflight'), 'Worker must cache at the edge, serve stale-while-revalidate and coalesce requests.');
check(/ALLOWED_CATALOGUE/.test(worker) && /MEDIA_HOSTS/.test(worker), 'Worker must keep its catalogue and media allowlists.');

/* 4. Behaviour: requests are coalesced and cached in the provider, and the single-origin helper retries once. */
(async () => {
  let network = 0;
  const fetchImpl = async input => {
    const url = new URL(String(input));
    check(url.origin === WORKER, `Unexpected origin ${url.origin}`);
    network++;
    await new Promise(r => setTimeout(r, 15));
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, data: { results: [{ id: 's1', name: 'Song', duration: 100, primaryArtists: 'A', album: { name: 'B' }, downloadUrl: [{ quality: '160kbps', url: 'https://aac.saavncdn.com/s1.m4a' }] }] } }) };
  };
  const context = {
    window: { addEventListener() {} }, State: { playbackSourceMode: 'online', playbackOrder: [], currentTrackId: null },
    navigator: { onLine: true }, document: { createElement() { return { value: '', set innerHTML(v) { this.value = v; } }; }, getElementById() { return null; } },
    URL, URLSearchParams, DOMException, AbortController, setTimeout, clearTimeout, console, fetch: fetchImpl, Map, Set, String, Number, Array, Object, Math, Date, Error, Promise
  };
  vm.createContext(context);
  vm.runInContext(config, context);
  vm.runInContext(read('js/online-provider.js'), context);
  const music = context.window.OnlineMusic;
  const [a, b, c] = await Promise.all([music.search('arijit', { limit: 10 }), music.search('arijit', { limit: 10, background: true }), music.search('arijit', { limit: 10, background: true })]);
  check(a.length === 1 && b.length === 1 && c.length === 1, 'Search results should parse.');
  check(network === 1, `Identical concurrent searches must share one network request (saw ${network}).`);
  await music.search('arijit', { limit: 10 });
  check(network === 1, 'A repeated search must be answered from memory with no network request.');
  await music.globalSearch('arijit'); await music.globalSearch('arijit');
  check(network === 2, `A repeated global search must be cached (saw ${network}).`);

  let attempts = 0;
  const retryCtx = { window: {}, fetch: async () => { if (++attempts === 1) throw new TypeError('blip'); return { ok: true, status: 200, clone() { return this; } }; }, URL, AbortController, DOMException, setTimeout, clearTimeout, Promise, Error, Map, Number, String, Math };
  vm.createContext(retryCtx);
  vm.runInContext(config, retryCtx);
  const response = await retryCtx.window.MujicBackend.fetchWithFallback('/api/search?query=x', {}, { timeoutMs: 500 });
  check(response.ok && attempts === 2, 'The backend helper must retry once after a network error.');

  /* 5. Hardening: storage helpers settle even when IndexedDB misbehaves. */
  const storage = read('js/storage.js');
  check(storage.includes('_run:') && storage.includes('tx.onabort') && storage.includes('onblocked') && storage.includes('onversionchange'), 'IndexedDB helpers must settle on abort and handle blocked upgrades.');
  check(/unhandledrejection/.test(read('js/app.js')), 'A global unhandled-rejection handler must exist.');
  console.log('v13.1.0 checks passed: Worker-only routing, no Render, no changelog, edge caching, request coalescing, resilient storage.');
})().catch(error => { console.error(error.stack || error); process.exit(1); });
