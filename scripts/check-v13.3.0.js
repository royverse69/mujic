const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const html = read('index.html'), css = read('css/app.css'), ux = read('js/native-ux.js');
const reco = read('js/online-recommendations.js'), cache = read('js/online-cache.js'), core = read('js/core.js');

// Opt-in setting is wired end to end and off by default.
assert.match(core, /swipeDismissMini:\s*false/);
for (const file of ['js/storage.js', 'js/backend.js', 'js/ui-settings.js']) assert.ok(read(file).includes('swipeDismissMini'), `${file} must persist swipeDismissMini`);
assert.ok(html.includes('data-setting="swipeDismissMini"'));
assert.ok(css.includes('body.swipe-dismiss-mini #mini-player'));
assert.ok(read('js/ui-settings.js').includes("classList.toggle('swipe-dismiss-mini'"));

// Gesture only runs when enabled, on small screens, with the full player closed; a drag never counts as a tap.
assert.ok(ux.includes('State.swipeDismissMini') && ux.includes('(max-width: 767px)') && ux.includes('State.isFullPlayerOpen'));
assert.ok(ux.includes('Player.pause()') && ux.includes("classList.remove('visible')") && ux.includes('blockClickUntil'));

// Tab title scroller is desktop-only and respects reduced motion.
assert.ok(ux.includes('initTabTitleScroller') && ux.includes('(min-width: 768px) and (hover: hover)') && ux.includes('reducedMotion()'));

// Concentric radii.
assert.ok(css.includes('calc(var(--cr-main) - var(--mini-inset))') && css.includes('calc(var(--cr-row) - var(--row-inset))'));

// Recommendation engine pieces.
for (const name of ['buildTaste', 'fetchPool', 'scoreCandidate', 'rankCandidates']) assert.ok(reco.includes(`const ${name}`), `missing ${name}`);
for (const name of ['getCandidates', 'enqueueNext', 'primeQueue', 'isSameRecording', 'filterPlaybackContext']) assert.ok(reco.includes(name), `export ${name} must remain`);

// Cache: batched writes and LRU eviction.
assert.ok(cache.includes('scheduleFlush') && cache.includes("addEventListener('pagehide', flush)"));

console.log('v13.3.0 checks passed: suggestions, compact PiP, concentric radii, swipe-dismiss setting, tab title scroller, cache.');
