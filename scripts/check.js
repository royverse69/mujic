#!/usr/bin/env node
/* Mujic pre-deploy check — no dependencies. Run with `npm run check`.
   1. every JS file parses            2. every file index.html / the service worker point at exists
   3. no oversized assets sneak in   4. manifest, sitemap and robots are sane */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const problems = [];
const fail = msg => problems.push(msg);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = (dir, out = []) => {
    for (const name of fs.readdirSync(path.join(root, dir))) {
        if (['node_modules', '.git'].includes(name)) continue;
        const rel = path.join(dir, name), stat = fs.statSync(path.join(root, rel));
        stat.isDirectory() ? walk(rel, out) : out.push(rel);
    }
    return out;
};
const files = walk('.');

for (const file of files.filter(f => f.endsWith('.js') && !f.startsWith('worker' + path.sep))) { // worker/ is an ES module for Cloudflare
    try { new vm.Script(read(file), { filename: file }); } catch (e) { fail(`syntax error in ${file}: ${e.message}`); }
}

const html = read('index.html');
const refs = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)].map(m => decodeURIComponent(m[1]));
for (const ref of new Set(refs)) if (!fs.existsSync(path.join(root, ref))) fail(`index.html references missing file: ${ref}`);

const sw = read('sw.js');
const shell = (sw.match(/const APP_SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
for (const m of shell.matchAll(/'\.\/([^']+)'/g)) if (!fs.existsSync(path.join(root, decodeURIComponent(m[1])))) fail(`sw.js APP_SHELL lists missing file: ${m[1]}`);
for (const script of refs.filter(r => r.startsWith('js/') || r.startsWith('css/'))) if (!shell.includes(`./${script}`)) fail(`${script} is loaded by index.html but not precached in sw.js`);

const LIMIT = 1.5 * 1024 * 1024;
for (const file of files) {
    const size = fs.statSync(path.join(root, file)).size;
    if (size > LIMIT && !file.endsWith('mujic-wordmark.webp')) fail(`${file} is ${(size / 1048576).toFixed(1)} MB — keep shipped assets under 1.5 MB`);
}
const animated = fs.statSync(path.join(root, 'icons/mujic-wordmark.webp')).size;
if (animated > 1.2 * 1024 * 1024) fail(`icons/mujic-wordmark.webp is ${(animated / 1048576).toFixed(1)} MB (budget 1.2 MB)`);

try { const m = JSON.parse(read('manifest.webmanifest')); if (!m.icons?.length || !m.start_url) fail('manifest.webmanifest missing icons/start_url'); } catch (e) { fail(`manifest.webmanifest: ${e.message}`); }
if (!/<loc>https:\/\/[^<]+<\/loc>/.test(read('sitemap.xml'))) fail('sitemap.xml has no absolute <loc> entries');
if (!/Sitemap:\s*https:\/\//.test(read('robots.txt'))) fail('robots.txt does not point at the sitemap');
for (const tag of ['rel="canonical"', 'name="description"', 'property="og:image"', 'application/ld+json']) if (!html.includes(tag)) fail(`index.html is missing ${tag}`);


// Regression guards for bugs that shipped once: touch-target pseudo-elements are absolutely positioned, so every
// element they attach to MUST be position:relative or they expand over the whole page and swallow taps/swipes.
const ux = read('css/native-ux.css');
if (/\.icon-btn::after/.test(ux) && !/:where\(\.icon-btn[\s\S]*?\)\s*\{\s*position:\s*relative/.test(ux)) fail('native-ux.css: touch-target ::after rules exist but the position:relative rule for .icon-btn/.nav-item/.chip is missing');
const appCss = read('css/app.css');
if ((appCss.match(/data-corner-radius="[a-z]+"\]\s*:is\(/g) || []).length < 10) fail('app.css: corner-radius setting rules are missing (expected 10)');

const swSource = read('sw.js');
const versionFile = read('VERSION').trim();
if (!swSource.includes(`mujic-pwa-v${versionFile}`)) fail(`sw.js CACHE_NAME must contain mujic-pwa-v${versionFile} (bump it with VERSION, or installed apps never update)`);

if (problems.length) { console.error('✖ Check failed:\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log(`✔ Mujic check passed (${files.length} files, ${files.filter(f => f.endsWith('.js')).length} scripts parsed)`);
