// Guards against settings drifting apart between save, load, import and the HTML controls.
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm');
const root = path.resolve(__dirname, '..'); const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const storage = read('js/storage.js'), ui = fs.readdirSync(path.join(root, 'js')).filter(f => /^ui(-[a-z]+)?\.js$/.test(f)).sort().map(f => read('js/' + f)).join('\n'), html = read('index.html');
let failed = false; const fail = m => { console.error('FAIL: ' + m); failed = true; };

// 1) every saved key must be read back by loadSettings (except keys handled specially)
const saved = [...storage.match(/SAVED_KEYS:\s*\[([\s\S]*?)\]/)[1].matchAll(/'(\w+)'/g)].map(m => m[1]);
const load = storage.slice(storage.indexOf('loadSettings:'), storage.indexOf('savePlaylist:'));
saved.forEach(k => { if (!new RegExp('\\bs\\.' + k + '\\b').test(load)) fail(`"${k}" is saved but never loaded`); });

// 2) enum lists used by loadSettings and importData must agree
const enums = {};
for (const m of load.matchAll(/s\.(\w+) !== undefined && \[([^\]]+)\]\.includes\(s\.\w+\)/g)) enums[m[1]] = m[2].replace(/['\s]/g, '').split(',');
for (const [key, vals] of Object.entries(enums)) {
  const m = ui.match(new RegExp(key + ':\\[([^\\]]+)\\]'));
  if (!m) continue; // import may not restrict this key
  const imp = m[1].replace(/['\s]/g, '').split(',');
  const missing = vals.filter(v => !imp.includes(v)), extra = imp.filter(v => !vals.includes(v));
  if (missing.length || extra.length) fail(`${key}: loadSettings and importData differ (missing in import: ${missing}; unknown in import: ${extra})`);
}

// 3) surface palette buttons in the HTML must only use values the app accepts
const ok = new Set(enums.surfaceTheme || []);
for (const m of html.matchAll(/data-setting="surfaceTheme"[^>]*data-value="([^"]+)"|data-value="([^"]+)"[^>]*data-setting="surfaceTheme"/g)) {
  const v = m[1] || m[2]; if (!ok.has(v)) fail(`index.html offers surfaceTheme "${v}" which loadSettings rejects`);
}

// 4) behaviour tests for pure helpers in core.js
const sandbox = { window: {}, document: {}, navigator: { userAgent: '', platform: '', maxTouchPoints: 0 }, console, URL, crypto: require('node:crypto').webcrypto };
sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(read('js/core.js') + '\nthis.__U = Utils;', sandbox);
const U = sandbox.__U;
const eq = (a, b, m) => { if (a !== b) fail(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
eq(U.escapeHTML('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;', 'escapeHTML');
eq(U.escapeHTML(0), '0', 'escapeHTML(0)'); eq(U.escapeHTML(null), '', 'escapeHTML(null)');
eq(U.formatTime(65), '1:05', 'formatTime'); eq(U.formatTime(NaN), '0:00', 'formatTime NaN');
eq(new Set(Array.from({ length: 5000 }, () => U.id())).size, 5000, 'id() uniqueness');
eq(U.generateDefaultArt('Same'), U.generateDefaultArt('Same'), 'default art deterministic');
const before = U._artCache.size; U.generateDefaultArt('Same'); U.generateDefaultArt('Same');
if (U._artCache.size !== before) fail('default art should be cached per hue');

if (failed) process.exit(1);
console.log(`Settings checks OK: ${saved.length} saved keys, ${Object.keys(enums).length} enums compared, helper tests passed.`);
