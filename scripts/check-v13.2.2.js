const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const html = read('index.html');
const sw = read('sw.js');
const events = read('js/ui-events.js');
const css = read('css/app.css');
const onlineCss = read('css/online-workspace.css');
const moduleLoader = read('js/module-loader.js');
assert.equal(pkg.version, '13.2.2');
assert.equal(read('VERSION').trim(), pkg.version);
assert.ok(html.includes(`content="${pkg.version}"`));
assert.ok(sw.includes(`mujic-pwa-v${pkg.version}-cloudflare-edge`));
assert.match(events, /bottomNav\?\.classList\.toggle\('scroll-hidden', shouldCollapse\)/);
assert.match(events, /if \(delta > 6 && !bottomNav\?\.contains\(document\.activeElement\)\) setNavCollapsed\(true\)/);
assert.match(events, /else if \(delta < -6\) setNavCollapsed\(false\)/);
assert.match(events, /miniPlayer\?\.classList\.remove\('scroll-hidden'\)/);
assert.match(css, /#bottom-nav\.scroll-hidden\s*\{\s*transform:\s*translate3d\(0,calc\(100% \+ 18px\),0\)/);
assert.match(css, /body\.nav-scroll-hidden #mini-player\.visible\s*\{\s*bottom:\s*calc\(8px \+ var\(--safe-bottom\)\)/);
assert.match(events, /const setNavCollapsed = collapsed =>/);
assert.match(events, /const backgroundArt = get\('mj-pip-bg'\)/);
assert.match(events, /backgroundArt\.dataset\.source !== src\) \{ backgroundArt\.dataset\.source = src; backgroundArt\.src = src; \}/);
assert.match(events, /ctx\.filter='blur\(18px\) saturate\(1\.2\)'/);
assert.match(events, /ctx\.drawImage\(art,38,68,size,size\)/);
assert.match(events, /const isMobilePiPContext = \(\) =>[\s\S]*pointer: coarse/);
assert.ok(!html.includes('<script defer src="./js/lyrics-share.js"></script>'));
assert.ok(!html.includes('<script defer src="./js/vendor/qrcode-generator.js"></script>'));
assert.ok(moduleLoader.includes('ensureLyricsShare') && moduleLoader.includes("loadScript('./js/lyrics-share.js')"));
assert.match(onlineCss, /#view-online-home \.online-shelf\{content-visibility:visible;contain:none\}/);
assert.doesNotMatch(onlineCss, /#view-online-home \.online-shelf\{content-visibility:auto/);
for (const mode of ['sharp','medium','rounded','extra']) assert.ok(css.includes(`body[data-corner-radius="${mode}"] #bottom-nav .nav-item.active`));
assert.match(css, /@keyframes mujic-view-morph/);
assert.match(css, /prefers-reduced-motion: reduce/);
// Audit all source templates, not just the home screen, for lazy images without layout dimensions.
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(item => {
  const absolute = path.join(dir, item.name);
  if (item.isDirectory()) return ['node_modules','.git'].includes(item.name) ? [] : walk(absolute);
  return /\.(?:html|js)$/i.test(item.name) ? [absolute] : [];
});
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<img\b[^>]*loading=["']lazy["'][^>]*>/gi)) {
    const tag = match[0];
    assert.match(tag, /\bwidth=["']\d+["']/i, `${path.relative(root,file)} has lazy image without width: ${tag.slice(0,120)}`);
    assert.match(tag, /\bheight=["']\d+["']/i, `${path.relative(root,file)} has lazy image without height: ${tag.slice(0,120)}`);
  }
}
console.log('v13.2.2 checks passed: scroll dock direction, persistent mini-player, PiP artwork, deferred optional code, stable lazy imagery, radius-aware active nav and motion safety.');
