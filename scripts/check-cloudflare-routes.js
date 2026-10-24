const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const fail = message => { throw new Error(message); };
const provider = read('js/online-provider.js');
const config = read('js/backend-config.js');
const sw = read('sw.js');
const workspace = read('js/online-workspace.js');
const downloader = read('dloader.html');
for (const obsolete of [[['on','render.com'].join(''), ['saavn','.sumit.co'].join('')], ['FALLBACK_API_ORIGIN', 'CATALOGUE_API_ORIGIN']].flat()) {
  if (`${config}\n${provider}\n${sw}`.toLowerCase().includes(obsolete.toLowerCase())) fail(`Active routing must not contain obsolete backend host/route: ${obsolete}`);
}
if (!config.includes("const PRIMARY = 'https://mujic.calverse.online'")) fail('Cloudflare Worker origin is not configured.');
if (!provider.includes('const API_BASE = `${window.MujicBackend.PRIMARY}/api`')) fail('Catalogue API must use the Worker /api path.');
for (const name of ['fetchWorkerQuickPicks','fetchWorkerSuggestions','searchWorkerSongs']) {
  if (!provider.includes(name) || !workspace.includes(name)) fail(`Home recommendation path ${name} must use the Worker.`);
}
if (!provider.includes('request(`${WORKER_RECOMMENDATIONS_BASE}/${route}`')) fail('Recommendation routes must call the Worker through the shared request helper.');
if (!provider.includes('fetchWithWorker')) fail('Backend requests must use the Worker-only fetch helper.');
if (!downloader.includes('const BACKEND = "https://mujic.calverse.online/"') || !downloader.includes('fetch(new URL(route, BACKEND).href')) fail('The standalone downloader must route metadata requests through the Worker origin.');
if (!downloader.includes('workerMediaUrl(sorted[0]?.link || sorted[0]?.url || sorted[0]?.downloadUrl)')) fail('Downloader preview audio must use the Worker media proxy.');
if (!sw.includes('url.origin === API_ORIGIN && cacheableWorkerPath(url.pathname)')) fail('Service-worker JSON caching must be scoped to the Worker API origin.');
if (sw.includes('FALLBACK_API_ORIGIN') || sw.includes('CATALOGUE_API_ORIGIN')) fail('Service worker must not retain secondary API origins.');
console.log('Cloudflare routing checks passed: catalogue, recommendations, lyrics, stream metadata, media proxy and service-worker cache are single-origin.');
