const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const worker = 'https://mujic.calverse.online';
const calls = [];
const rawSong = (id, name, artist='Worker Artist') => ({ id, name, duration: 188, primaryArtists: artist, album: { name: 'Worker album' }, image: [{ quality: '500x500', url: `https://cdn.saavncdn.com/${id}.jpg` }] });
const fetchImpl = async input => {
  const url = new URL(String(input));
  calls.push(url.href);
  let payload;
  if (url.origin !== worker) throw new Error(`Recommendation route unexpectedly used ${url.origin} instead of the Worker.`);
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
  URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console, fetch: fetchImpl,
  Map, Set, String, Number, Array, Object, Math, Date, Error, Promise
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/backend-config.js'), 'utf8'), context, { filename: 'backend-config.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'js/online-provider.js'), 'utf8'), context, { filename: 'online-provider.js' });
(async () => {
  const music = context.window.OnlineMusic;
  const quick = await music.fetchQuickPicks();
  if (quick.length !== 2 || !quick.every(track => track.provider === 'machhar')) throw new Error('Worker /trending results should be normalized to playable streaming tracks.');
  const suggestions = await music.fetchSuggestions({ id: 'machhar:seed', onlineTrackId: 'render-seed', provider: 'machhar' });
  if (suggestions.length !== 2 || !suggestions[0].id.startsWith('machhar:')) throw new Error('Worker /queue recommendations should normalize into playable tracks.');
  const search = await music.searchSongsFast('Hindi evening songs');
  if (search.length !== 1 || search[0].title !== 'Search One') throw new Error('Worker /search fallback should normalize song rows.');
  if (calls.length !== 3 || calls.some(call => !call.startsWith(worker + '/'))) throw new Error('All Quick Picks/Suggested discovery requests must go to the Worker.');
  if (calls.some(call => call.includes('onrender') || call.includes('saavn.sumit.co'))) throw new Error('Discovery must not touch Render or the upstream catalogue directly.');
  console.log('Worker route checks passed: /trending, /queue and /search all use the Cloudflare Worker.');
})().catch(error => { console.error(error.stack || error); process.exit(1); });
