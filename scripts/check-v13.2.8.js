const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const html = read('index.html'), sw = read('sw.js'), css = read('css/native-ux.css');
const events = read('js/ui-events.js'), player = read('js/ui-player.js'), settings = read('js/ui-settings.js');
const downloader = read('js/online-downloader.js'), dloader = read('dloader.html'), core = read('js/core.js'), audio = read('js/player.js');
const provider = read('js/online-provider.js'), nativeJs = read('js/native-ux.js');

assert.equal(pkg.version, '13.2.8');
assert.equal(read('VERSION').trim(), '13.2.8');
assert.ok(html.includes('content="13.2.8"') && sw.includes('mujic-pwa-v13.2.8-cloudflare-edge'));

// Delivery: new layer is linked after app.css, loaded, and precached for offline use.
assert.ok(html.indexOf('./css/app.css') < html.indexOf('./css/native-ux.css'), 'native-ux.css must load after app.css');
assert.ok(html.includes('./js/native-ux.js') && sw.includes('./css/native-ux.css') && sw.includes('./js/native-ux.js'));

// Full-player backdrop: oversized static layer, no transform dependence, cover pixels via --bd-img even in low-end mode.
assert.ok(css.includes('#full-player #full-bg.player-bg') && css.includes('inset: -6% !important') && css.includes('transform: none !important'));
assert.ok(css.includes('background-image: var(--bd-img, none) !important'), 'Low-end CSS sets background-image !important, so the cover must flow through --bd-img.');
assert.ok(player.includes('tinyBackdrop') && player.includes("setProperty('--bd-img'") && player.includes('setPlayerBackdrop'));
assert.ok(!/fullBg\.style\.backgroundImage\s*=\s*`url\("\$\{track\.artworkLargeUrl/.test(player), 'Large artwork must not overwrite the blurred backdrop.');

// PiP: CORS-safe same-origin cover for both Document PiP and canvas video PiP.
assert.ok(events.includes('window.MujicPiPArt') && events.includes('safeArt') && events.includes('MujicPiPArt.resolve'));
assert.ok(!events.includes('ctx.drawImage(art,'), 'Canvas PiP must not draw the cross-origin <img> directly (taints the canvas).');

// Downloads: best artwork first, any image format, honest feedback, standalone page parity.
assert.ok(downloader.includes('fetchTrackCover') && downloader.includes('coverCandidates') && downloader.includes('reencodeToJpeg'));
assert.ok(downloader.indexOf('track.artworkLargeUrl') < downloader.indexOf('track.artworkUrl);'), 'Large artwork must be tried before the thumbnail.');
assert.ok(!downloader.includes('artwork tagged.') && downloader.includes('cover art could not be fetched'));
assert.ok(dloader.includes('toJpeg') && dloader.includes('"500x500"'), 'dloader.html must request the 500px cover and convert non-JPEG/PNG covers.');

// Theme-aware glass, titles, cache, audio routing.
assert.ok(settings.includes("classList.contains('theme-light')") && settings.includes('rgba(255,255,255,.80)'));
assert.ok(provider.includes('fixApostropheSpacing'));
assert.ok(core.includes('maxEntries: 400') && core.includes('trim: (keepId)') && core.includes("'online:' + track.id"));
assert.ok(audio.includes('AudioAdapter.source ||'), 'Once routed through Web Audio the element must keep its CORS attribute.');

// Accessibility and touch.
assert.ok(html.includes('<button type="button" class="btn-play-pause"') && html.includes('role="group" aria-label="Now playing"'));
assert.ok(html.includes('class="mini-meta" role="button" tabindex="0"'));
assert.ok(css.includes('@media (pointer: coarse)') && css.includes('touch-action: manipulation') && css.includes(':focus-visible') && css.includes('overscroll-behavior'));
assert.ok(nativeJs.includes("role', 'button'") && nativeJs.includes('pagehide') && nativeJs.includes('ctx.resume()'));
console.log('v13.2.8 checks passed: backdrop, PiP cover, download cover art, light-theme glass, touch targets, accessibility, resilience.');
