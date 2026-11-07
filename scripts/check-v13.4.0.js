const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html'), sw = read('sw.js'), ws = read('js/online-workspace.js'), ux = read('js/native-ux.js');
const nux = read('css/native-ux.css'), settings = read('css/settings.css'), lyrics = read('js/ui-lyrics.js'), provider = read('js/online-provider.js');

// Quick Picks: accumulating feed, prepend-only, persisted, progressively rendered.
assert.ok(ws.includes("quickFeed:'mujic-online-quick-feed-v1'") && ws.includes('const absorbQuickPicks') && ws.includes('[...additions,...feed]'));
assert.ok(ws.includes('return absorbQuickPicks(out)') && ws.includes('QUICK_PAGE') && ws.includes("insertAdjacentHTML('beforeend'"));
assert.ok(ws.includes('localStorage.removeItem(KEYS.quickFeed)'), 'resetting the profile must clear the feed');

// Settings redesign is linked, precached and keeps the toggle visible in the Player section.
assert.ok(html.includes('./css/settings.css') && sw.includes('./css/settings.css'));
assert.ok(html.indexOf('./css/native-ux.css') < html.indexOf('./css/settings.css'));
assert.ok(settings.includes('.settings-category-card') && settings.includes('input[type="checkbox"].settings-control'));
assert.ok(html.indexOf('data-setting="swipeDismissMini"') < html.indexOf('<h2 class="section-title">Playback</h2>'));

// Mini-player redesign: markup hooks and seek handler.
for (const id of ['mini-time-current', 'mini-time-total', 'mini-prev', 'mini-scrub', 'mini-now']) assert.ok(html.includes(id), `${id} missing`);
assert.ok(nux.includes('grid-template-columns: minmax(0, 1fr) minmax(320px, 540px) minmax(0, 1fr)') && ux.includes('initMiniScrub'));

// Lyrics: JS follow-scroll, no native smooth scrolling, no `transition: all` on lines.
assert.ok(lyrics.includes('const lyricFollow') && !lyrics.includes("behavior:document.body.classList.contains('reduced-motion') ? 'auto' : 'smooth'"));
assert.ok(nux.includes('scroll-behavior: auto !important') && nux.includes('.lyric-line {\n  transition: opacity'));

// Caching limits raised.
assert.ok(provider.includes('onlineTracks.size > 1500') && sw.includes('MAX_API_ENTRIES = 1500') && sw.includes('trimCounters'));

console.log('v13.4.0 checks passed: quick picks feed, settings redesign, mini-player, lyrics motion, caching.');
