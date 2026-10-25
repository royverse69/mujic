const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const read = file => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const css = read('css/app.css');
const core = read('js/core.js');
const settings = read('js/ui-settings.js');
const onboarding = read('js/onboarding.js');
const ui = read('js/ui.js');
const lyrics = read('js/lyrics.js');
const onlineLyrics = read('js/online-lyrics.js');
const provider = read('js/online-provider.js');
const sw = read('sw.js');
assert.equal(pkg.version, '13.2.4');
assert.equal(read('VERSION').trim(), pkg.version);
assert.ok(html.includes(`content="${pkg.version}"`));
assert.ok(sw.includes(`mujic-pwa-v${pkg.version}-cloudflare-edge`));
assert.match(html, /id="mini-player"[\s\S]*?class="mini-desktop-tools"[\s\S]*?data-target="volume-sheet"[\s\S]*?data-action="picture-in-picture"/);
assert.match(html, /id="mini-play-btn"/);
assert.match(css, /@media \(min-width:768px\)[\s\S]*?#mini-player \.mini-controls\s*\{[^}]*left:50%[^}]*width:0/);
assert.match(css, /#mini-player \.mini-action\[data-action=\"toggle-play\"\] \{ left:-21px; \}/);
assert.match(css, /#mini-player \.mini-action\[data-action=\"next-track\"\] \{ left:29px; \}/);
assert.match(css, /@media \(max-width:767px\)[\s\S]*?#mini-player \.mini-action\s*\{[^}]*width:40px/);
for (const mode of ['sharp','medium','rounded','extra']) assert.ok(css.includes(`body[data-corner-radius="${mode}"] #mini-player`), `Mini-player needs ${mode} corner mapping`);
assert.ok(ui.includes('mini-volume-icon') && ui.includes('Volume muted'));
assert.ok(core.includes('window-controls-overlay') && core.includes('isInstalledApp'));
assert.ok(settings.includes('Utils.isInstalledApp()'));
assert.ok(onboarding.includes("'(display-mode: window-controls-overlay)'"));
assert.ok(provider.indexOf('syncedLyrics: raw.syncedLyrics') < provider.indexOf('plainLyrics: raw.plainLyrics'));
assert.ok(lyrics.includes('embeddedData: (track) =>'));
assert.ok(lyrics.includes('const timed = candidates.find(value => LyricsFetcher.isLRC(value))'));
assert.ok(lyrics.includes('rememberPlain') && lyrics.includes('LyricsFetcher.isLRC(timed)'));
assert.ok(onlineLyrics.includes('const timed = values.find(isLRC)'));
assert.ok(onlineLyrics.includes('payload?.more_info?.syncedLyrics'), 'Nested provider-supplied timestamped lyrics must be recognized.');
assert.ok(onlineLyrics.includes("if (isLRC(embedded.text)) return"));
assert.ok(onlineLyrics.includes('const timedResult = matches.find(item => isLRC(item.syncedLyrics || \'\'))'));
assert.ok(!html.includes('<script defer src="./js/vendor/qrcode-generator.js"></script>'));
assert.ok(!fs.existsSync('js/vendor/qrcode-generator.js'));
assert.ok(!fs.existsSync('test.html') && !fs.existsSync('music.mp3'));
assert.ok(!fs.existsSync('RELEASE_NOTES-v13.2.3.md') && fs.existsSync('RELEASE_NOTES-v13.2.4.md'));
assert.ok(sw.includes("'./js/lyrics-share.js'"), 'The optional share script remains cached for offline use while its execution remains lazy.');
assert.ok(!html.includes('<script defer src="./js/lyrics-share.js"></script>'));

// Exercise the lyric-priority behavior rather than relying on source-string checks alone.
const lyricsContext = {
  window: { MujicBackend: { PRIMARY: 'https://backend.example', isBackendOrigin: () => true } },
  URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
  navigator: { onLine: true }, location: { href: 'https://mujic.example/' },
  document: { createElement: () => ({ set innerHTML(value) { this.value = value; }, value: '' }) },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  fetch: async () => { throw new Error('Unexpected network call in embedded lyric test'); }
};
vm.createContext(lyricsContext);
vm.runInContext(read('js/online-lyrics.js') + '\nglobalThis.__onlineLyrics = window.OnlineLyrics;', lyricsContext);
(async () => {
  const nested = await lyricsContext.__onlineLyrics.fetchFromMusicSource({
    id: 'nested-sync-test', source: 'machhar-online', provider: 'machhar', title: 'Test Song', artist: 'Test Artist',
    raw: { lyrics: 'Plain lyrics should be a fallback', more_info: { syncedLyrics: '[00:01.00]Timestamped line' } }
  });
  assert.equal(nested?.text, '[00:01.00]Timestamped line');
  assert.equal(nested?.isSynced, true);
  assert.equal(nested?.source, 'Music catalogue');
  console.log('v13.2.4 checks passed: mini-player geometry and controls, desktop install-state detection, timed-lyrics priority, and removal of unused package artifacts.');
})().catch(error => { console.error(error); process.exitCode = 1; });
