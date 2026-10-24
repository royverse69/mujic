const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'sw.js'), 'utf8');
const stores = new Map();
let now = 1000000000000;
class MemoryCache {
  constructor() { this.map = new Map(); }
  async match(key) { const hit = this.map.get(typeof key === 'string' ? key : key.url); return hit ? hit.clone() : undefined; }
  async put(key, response) { const url = typeof key === 'string' ? key : key.url; this.map.delete(url); this.map.set(url, response); }
  async delete(key) { return this.map.delete(typeof key === 'string' ? key : key.url); }
  async keys() { return [...this.map.keys()].map(url => ({ url })); }
  async add(path) { this.map.set(new URL(path, 'https://app.test/').href, new Response('shell')); }
}
const caches = {
  async open(name) { if (!stores.has(name)) stores.set(name, new MemoryCache()); return stores.get(name); },
  async has(name) { return stores.has(name); },
  async delete(name) { return stores.delete(name); },
  async keys() { return [...stores.keys()]; }
};
let fetchCalls = [];
let networkUp = true;
let nextResponse = () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
const fakeFetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  fetchCalls.push({ url, mode: init?.mode });
  if (!networkUp) throw new TypeError('network down');
  return nextResponse(url);
};
const handlers = {};
const sandbox = {
  self: { addEventListener: (type, fn) => { handlers[type] = fn; }, location: { origin: 'https://app.test' }, skipWaiting: async () => {}, clients: { claim: async () => {} } },
  caches, fetch: fakeFetch, Response, Headers, Request, URL, Promise, Date: Object.assign(class extends Date { static now() { return now; } }, {}), console, Number, String, Math, Set, Map, Array, Object, JSON, Error, TypeError, Boolean, RegExp
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const assert = (condition, message) => { if (!condition) throw new Error(`Service worker check failed: ${message}`); };
const API = 'https://mujic.calverse.online';
const DIRECT_API = 'https://saavn.sumit.co';
const dispatch = async (url, extra = {}) => {
  const request = Object.assign(new Request(url), {});
  const pending = [];
  let responded;
  const event = {
    request: Object.defineProperties(request, { destination: { value: extra.destination || '' }, mode: { value: extra.mode || 'cors' } }),
    respondWith: promise => { responded = promise; },
    waitUntil: promise => { pending.push(promise); }
  };
  handlers.fetch(event);
  if (!responded) return { passthrough: true };
  const response = await responded;
  await Promise.all(pending);
  return { response };
};
(async () => {
  await handlers.message({ data: { type: 'SET_CACHING', enabled: true }, waitUntil: p => p });
  const url = `${API}/api/artists/artist-id`;
  const directSearchUrl = `${DIRECT_API}/api/search/songs?query=arijit&page=0&limit=10`;
  fetchCalls = [];
  let result = await dispatch(url);
  assert(result.response && fetchCalls.length === 1, 'first API call reaches the network once');
  assert(stores.get('mujic-api-v3').map.size === 1, 'API JSON response is cached');
  result = await dispatch(url);
  assert(fetchCalls.length === 1, 'fresh cached API response is served without a network call');
  result = await dispatch(directSearchUrl);
  assert(result.passthrough, 'the upstream catalogue host is never contacted by the browser; only the Worker is');
  fetchCalls = [];
  const searchUrl = `${API}/api/search/songs?query=arijit&page=0&limit=10`;
  await dispatch(searchUrl); now += 4 * 60 * 1000; await dispatch(searchUrl);
  assert(fetchCalls.length === 1, 'search results stay fresh for five minutes');
  const legacyUrl = `${API}/trending`;
  await dispatch(legacyUrl); await dispatch(legacyUrl);
  assert(fetchCalls.length === 2, 'legacy Worker routes such as /trending are cached too');
  fetchCalls = [];
  result = await dispatch(url);
  now += 31 * 60 * 1000;
  result = await dispatch(url);
  assert(result.response && fetchCalls.length === 1, 'stale API response is served immediately and revalidated in the background');
  networkUp = false;
  now += 3 * 24 * 60 * 60 * 1000;
  result = await dispatch(url);
  assert(result.response && result.response.status === 200, 'cached API response is served when the network is down');
  const songUrl = `${API}/api/songs/abc`;
  networkUp = true;
  await dispatch(songUrl);
  const before = fetchCalls.length;
  now += 5 * 60 * 1000;
  await dispatch(songUrl);
  assert(fetchCalls.length === before + 1, 'stream-link lookups are refreshed from the network once older than four minutes');
  nextResponse = () => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
  await dispatch(`${API}/api/other`);
  assert(![...stores.get('mujic-api-v3').map.keys()].some(key => key.endsWith('/api/other')), 'non-JSON API responses are never cached');
  nextResponse = () => new Response('img', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  const art = 'https://c.saavncdn.com/art/x.jpg';
  fetchCalls = [];
  await dispatch(art, { destination: 'image', mode: 'no-cors' });
  assert(fetchCalls[0].mode === 'cors', 'artwork is fetched in CORS mode so the real response can be cached');
  await dispatch(art, { destination: 'image', mode: 'no-cors' });
  assert(fetchCalls.length === 1, 'cached artwork is served without a network call');
  const other = await dispatch('https://example.com/data.json');
  assert(other.passthrough, 'unrelated third-party requests are never intercepted');
  await handlers.message({ data: { type: 'SET_CACHING', enabled: false }, waitUntil: p => p });
  fetchCalls = [];
  nextResponse = () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  await dispatch(url);
  await dispatch(url);
  assert(fetchCalls.length === 2, 'API caching can be switched off');
  await handlers.message({ data: { type: 'SET_CACHING', enabled: true }, waitUntil: p => p });
  await handlers.message({ data: { type: 'CLEAR_ONLINE_MEDIA_CACHE' }, waitUntil: p => p });
  assert(!stores.has('mujic-api-v3') && !stores.has('mujic-art-v3'), 'clearing removes API and artwork caches');
  console.log('Service worker checks OK: API stale-while-revalidate, offline fallback, artwork caching, opt-out and cache clearing.');
})().catch(error => { console.error(error.message); process.exit(1); });
