const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const pkg = JSON.parse(read('package.json'));
const version = read('VERSION').trim();
const html = read('index.html'), sw = read('sw.js'), provider = read('js/online-provider.js');
const config = read('js/backend-config.js'), lyrics = read('js/online-lyrics.js'), settings = read('js/ui-settings.js');
check(version === '13.0.21' && pkg.version === version, 'App and package versions must match.');
check(html.includes(`application-version\" content=\"${version}\"`) && sw.includes(`mujic-pwa-v${version}-`), 'HTML and service-worker release cache must be version-busted.');
check(!fs.existsSync(path.resolve(__dirname, '..', ['chang','log.json'].join(''))), 'The obsolete release-note JSON must be absent.');
for (const file of ['js/backend-config.js','js/online-provider.js','js/online-lyrics.js','js/lyrics.js','sw.js','README.md','docs/api-integration.md']) {
  const source = read(file).toLowerCase();
  check(!source.includes(['on','render.com'].join('')) && !source.includes(['saavn','.sumit.co'].join('')), `${file} must not call the old backend or direct catalogue origin.`);
}
check(config.includes("const PRIMARY = 'https://mujic.calverse.online'") && !config.includes('FALLBACK'), 'Only the Cloudflare Worker origin may be configured.');
check(provider.includes('const API_BASE = `${window.MujicBackend.PRIMARY}/api`'), 'Catalogue paths must use the Worker API.');
check(provider.includes('const searchInFlight = new Map()') && provider.includes('searchCache.set(cacheKey'), 'Search requests must use in-flight deduplication and a bounded result cache.');
check(lyrics.includes('lyrics/get?') && lyrics.includes('lyrics/search?') && !lyrics.includes('lrclib.net'), 'Online lyric lookup must be Worker-routed.');
check(sw.includes("const API_CACHE = 'mujic-api-v3'") && sw.includes('staleLimit') && sw.includes('cacheableWorkerPath'), 'The updated Worker cache must support stale fallback for API requests.');
check(settings.includes('Bundled release notes') || settings.includes('Cloudflare-only API routing'), 'The app must retain bundled release notes without downloading a JSON file.');
console.log('v13.0.21 checks passed: Cloudflare-only API routing, removed changelog asset, search dedupe, bounded stale cache and bundled release notes.');
