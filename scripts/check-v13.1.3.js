const fs = require('fs');
const assert = require('assert');
const read = file => fs.readFileSync(file, 'utf8');
const css = read('css/app.css');
const onlineCss = read('css/online-workspace.css');
const html = read('index.html');
const pkg = JSON.parse(read('package.json'));
const sw = read('sw.js');

assert.strictEqual(pkg.version, '13.2.0', 'package version should match the current release');
assert.ok(html.includes(`content="${pkg.version}"`), 'HTML should advertise the current version');
assert.strictEqual(read('VERSION').trim(), pkg.version, 'VERSION should agree with package version');
assert.ok(sw.includes(`mujic-pwa-v${pkg.version}-cloudflare-edge`), 'service worker should invalidate the previous shell');
assert.match(html, /class="workspace-toggle-mini"[\s\S]*?class="workspace-toggle-track"[\s\S]*?class="workspace-toggle-thumb"/, 'offline workspace switch markup should stay intact');
for (const selector of ['.workspace-toggle-mini {', '.workspace-toggle-track {', '.workspace-toggle-thumb {', '.workspace-toggle-beta {']) {
  assert.ok(css.includes(selector), `${selector} must be in the startup CSS so the offline switch remains styled`);
}
assert.ok(css.includes('.online-brand-footer {') && css.includes('.online-brand-wordmark {'), 'home watermark styling must be available before online CSS loads');
assert.ok(css.includes('body:not(.online-mode) #online-back-top { display: none !important; }'), 'online-only back-to-top must not appear as an unstyled control in offline mode');
assert.ok(onlineCss.includes('.workspace-toggle-mini{') && onlineCss.includes('.online-brand-footer{'), 'online styles should retain the same shared visual definitions');
const names = [...html.matchAll(/icon_names=([^&"]+)/g)].flatMap(m => m[1].split(','));
for (const icon of ['pause','play_arrow','keyboard_arrow_up','swap_horiz','add','history','home','library_music','search','settings']) {
  assert.ok(names.includes(icon), `Material Symbols subset must include ${icon}`);
}
console.log('v13.1.3 offline switch, watermark, online-control isolation, and icon subset checks passed.');
