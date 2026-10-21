const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const render = 'https://gaana-suno-varna-machhar-aajayega.onrender.com';
const calls = [];
const rawSong = (id, name, artist='Render Artist') => ({ id, name, duration: 188, primaryArtists: artist, album: { name: 'Render album' }, image: [{ quality: '500x500', url: `https://cdn.saavncdn.com/${id}.jpg` }] });
const fetchImpl = async input => {
  const url = new URL(String(input));
  calls.push(url.href);
  let payload;
  if (url.origin !== render) throw new Error(`Recommendation route unexpectedly used ${url.origin} instead of Render.`);
  if (url.pathname === '/trending') payload = { songs: [rawSong('render-quick-1', 'Quick Pick One'), rawSong('render-quick-2', 'Quick Pick Two')] };
  else if (url.pathname === '/queue/render-seed') payload = { queue: [rawSong('render-suggest-1', 'Suggested One'), rawSong('render-suggest-2', 'Suggested Two')] };
  else if (url.pathname === '/search') payload = { data: { songs: { results: [rawSong('render-search-1', 'Search One')] } } };
  else throw new Error(`Unexpected path: ${url.pathname}`);
  return { ok: true, status: 200, text: async () => JSON.stringify(payload) };
};
const context = {
  window: { addEventListener() {} },
  State: { playbackSourceMode: 'online', playbackOrder: [], currentTrackId: null },
  navigator: { onLine: true },
  document: { createElement() { return { value: '', set innerHTML(value) { this.value = value; } }; }, getElementById() { return null; } },
  URL, AbortController, setTimeout, clearTimeout, console, fetch: fetchImpl,
  Map, Set, String, Number, Array, Object, Math, Date, Error, Promise
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/backend-config.js'), 'utf8'), context, { filename: 'backend-config.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/online-provider.js'), 'utf8'), context, { filename: 'online-provider.js' });
(async () => {
  const music = context.window.OnlineMusic;
  const quick = await music.fetchRenderQuickPicks();
  if (quick.length !== 2 || !quick.every(track => track.provider === 'machhar')) throw new Error('Render /trending results should be normalized to playable streaming tracks.');
  const suggestions = await music.fetchRenderSuggestions({ id: 'machhar:seed', onlineTrackId: 'render-seed', provider: 'machhar' });
  if (suggestions.length !== 2 || !suggestions[0].id.startsWith('machhar:')) throw new Error('Render /queue recommendations should normalize into playable tracks.');
  const search = await music.searchRenderSongs('Hindi evening songs');
  if (search.length !== 1 || search[0].title !== 'Search One') throw new Error('Render /search fallback should normalize song rows.');
  if (calls.length !== 3 || calls.some(call => !call.startsWith(render + '/'))) throw new Error('All Quick Picks/Suggested discovery requests must go directly to Render.');
  if (calls.some(call => call.includes('mujic.calverse.online') || call.includes('saavn.sumit.co'))) throw new Error('Quick Picks/Suggested discovery must not route through Cloudflare or direct catalogue hosts.');
  console.log('Render home-route checks passed: /trending, /queue and /search all use Render directly.');
})().catch(error => { console.error(error.stack || error); process.exit(1); });
