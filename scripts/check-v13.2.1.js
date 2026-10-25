const fs = require('node:fs');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(file, 'utf8');
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const css = read('css/app.css');
const onlineCss = read('css/online-workspace.css');
const events = read('js/ui-events.js');
const modules = read('js/module-loader.js');
const workspace = read('js/online-workspace.js');
const sw = read('sw.js');
assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
assert.ok(html.includes(`content="${pkg.version}"`));
assert.ok(sw.includes(`mujic-pwa-v${pkg.version}-cloudflare-edge`));
assert.ok(!html.includes('<script defer src="./js/lyrics-share.js"></script>'), 'Lyric share renderer should not be parsed at startup.');
assert.ok(!html.includes('<script defer src="./js/vendor/qrcode-generator.js"></script>'), 'Unused QR generator should not be requested at startup.');
assert.ok(modules.includes('ensureLyricsShare') && modules.includes("loadScript('./js/lyrics-share.js')"), 'Sharing tools should load on demand.');
assert.ok(events.includes("await window.MujicModules?.ensureLyricsShare?.()"), 'Opening the sharing action must load and initialize the module.');
assert.ok(events.includes("bottomNav?.classList.toggle('scroll-hidden', shouldCollapse)"), 'The navigation bar itself should collapse.');
assert.ok(events.includes("document.body.classList.toggle('nav-scroll-hidden', shouldCollapse)"), 'Dock layout should follow collapsed navigation state.');
assert.ok(events.includes('if (delta > 6') && events.includes('else if (delta < -6)'), 'Scroll direction should collapse on upward content travel and reveal when reversing.');
assert.ok(!events.includes("miniPlayer.classList.add('scroll-hidden')"), 'The now-playing mini player must not be hidden by scrolling.');
assert.ok(css.includes('body.nav-scroll-hidden #mini-player.visible { bottom: calc(8px + var(--safe-bottom)); }'));
for (const mode of ['sharp', 'medium', 'rounded', 'extra']) assert.ok(css.includes(`body[data-corner-radius="${mode}"] #bottom-nav .nav-item.active`), `Active nav chip should follow ${mode} radius.`);
assert.ok(events.includes('mj-pip-bg') && events.includes('canvas.width=640; canvas.height=640') && events.includes('ctx.drawImage(art,(640-bw)/2,(640-bh)/2,bw,bh)'), 'Custom and native PiP should use a full-window poster composition.');
assert.ok(!html.includes('id="mj-pip-art"'), 'PiP UI should remain generated on demand, not add page startup markup.');
assert.ok(onlineCss.includes('#online-shelf-artists-wrap') && onlineCss.includes('content-visibility:visible !important'), 'Artist and radio shelves must not use paint suppression when scrolling.');
assert.ok(!onlineCss.includes('.online-card-rail > .online-media-card { content-visibility:auto'), 'Image-bearing cards should retain stable painting while scrolling.');
assert.ok(read('js/ui-history.js').includes('width="48" height="48"'), 'History lazy art needs explicit dimensions.');
assert.ok(workspace.includes('width="640" height="320"') && workspace.includes('width="280" height="280"') && workspace.includes('width="480" height="320"'), 'Lazy category, artist and radio art needs explicit dimensions.');
for (const source of [html, read('js/ui-history.js'), workspace]) {
  for (const tag of source.match(/<img\b[^>]*loading="lazy"[^>]*>/gi) || []) {
    assert.match(tag, /\bwidth="\d+"/i, `Lazy image missing width: ${tag.slice(0, 160)}`);
    assert.match(tag, /\bheight="\d+"/i, `Lazy image missing height: ${tag.slice(0, 160)}`);
  }
}
console.log('v13.2.1 checks passed: scroll-aware nav, artwork-rich PiP, radius-aware active state, stable lazy artwork and optional JS loading.');
