const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sources = [path.join(root, 'index.html'), ...fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).map(name => path.join(root, 'js', name))];
const used = new Set();
const handled = new Set();
for (const file of sources) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/data-action\s*=\s*["']([^"']+)["']/g)) used.add(match[1]);
  for (const match of text.matchAll(/case\s+["']([^"']+)["']\s*:/g)) handled.add(match[1]);
  for (const match of text.matchAll(/action\s*===\s*["']([^"']+)["']/g)) handled.add(match[1]);
}
const missing = [...used].filter(action => !handled.has(action)).sort();
if (missing.length) {
  console.error(`Action coverage failed; no dispatch case found for: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Action coverage OK: ${used.size} action labels have explicit dispatch/handling.`);
