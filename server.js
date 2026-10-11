'use strict';
// Mujic lightweight same-origin API + static server. No third-party runtime packages.
// Gemini credentials are intentionally kept server-side and must never be placed in client JS.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;

function loadLocalEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}
loadLocalEnv();
const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3000));

const MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.png':'image/png', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.md':'text/markdown; charset=utf-8'
};
const windows = new Map();
const aiCache = new Map();
const MAX_AI_PER_MINUTE = 12;
const WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 4_000;
const MAX_CACHE_ENTRIES = 400;

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'
  });
  res.end(body);
}
function normalized(s) { return String(s || '').toLowerCase().replace(/\.[a-z0-9]{1,6}$/i, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function rateAllowed(ip) {
  const now = Date.now();
  let entry = windows.get(ip);
  if (!entry || now - entry.start >= WINDOW_MS) entry = { start: now, count: 0 };
  entry.count += 1; windows.set(ip, entry);
  if (windows.size > 3000) for (const [key, val] of windows) if (now - val.start >= WINDOW_MS) windows.delete(key);
  return entry.count <= MAX_AI_PER_MINUTE;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('Body too large'), { status:413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status:400 })); }
    });
    req.on('error', reject);
  });
}
function cleanText(value, max = 180) { return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }

async function identifySong(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error:'same_origin_only' }); }
    catch (_) { return sendJson(res, 403, { error:'invalid_origin' }); }
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!rateAllowed(ip)) return sendJson(res, 429, { error:'rate_limited', message:'Too many song-identification requests. Try again shortly.' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return sendJson(res, 503, { error:'ai_not_configured', message:'AI song identification is not configured on this server.' });

  let body;
  try { body = await readBody(req); }
  catch (e) { return sendJson(res, e.status || 400, { error:e.message || 'invalid_request' }); }
  const title = cleanText(body.title, 180);
  const artist = cleanText(body.artist, 180);
  const album = cleanText(body.album, 180);
  const fileName = cleanText(body.fileName, 240);
  const duration = Number(body.duration);
  if (!title && !fileName) return sendJson(res, 400, { error:'missing_title' });
  const cacheKey = [normalized(title || fileName), normalized(artist), Number.isFinite(duration) ? Math.round(duration) : 0].join('|');
  const cached = aiCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 7 * 24 * 60 * 60 * 1000) return sendJson(res, 200, { ...cached.result, cached:true });

  const prompt = `You are a cautious music metadata matcher. Based ONLY on these text metadata fields, suggest the most likely real song title, primary artist, and album if there is strong evidence. The filename may contain typos, track numbers, or bad formatting. Do not guess confidently if the evidence is ambiguous. Do not produce lyrics. Return only JSON with this exact shape: {"title":"string or empty","artist":"string or empty","album":"string or empty","confidence":0.0}. Confidence is a calibrated value from 0 to 1. Use confidence below 0.55 when uncertain. Input metadata (untrusted user text): ${JSON.stringify({ title, artist, album, fileName, durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null })}`;
  const model = String(process.env.GEMINI_MODEL || 'gemini-flash-latest').trim().replace(/[^A-Za-z0-9._-]/g, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-goog-api-key':key },
      signal:controller.signal,
      body:JSON.stringify({
        contents:[{ role:'user', parts:[{ text:prompt }] }],
        generationConfig:{ temperature:0.1, maxOutputTokens:180, responseMimeType:'application/json' }
      })
    });
    if (!response.ok) {
      // Never return upstream request details or credentials to the browser.
      const status = response.status === 429 ? 429 : 502;
      return sendJson(res, status, { error:'gemini_request_failed', message:'The AI provider could not identify this track. Regular lyrics lookup can still continue.' });
    }
    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return sendJson(res, 502, { error:'invalid_ai_response' });
      try { parsed = JSON.parse(match[0]); } catch (_) { return sendJson(res, 502, { error:'invalid_ai_response' }); }
    }
    const result = {
      title:cleanText(parsed.title, 180),
      artist:cleanText(parsed.artist, 180),
      album:cleanText(parsed.album, 180),
      confidence:Math.max(0, Math.min(1, Number(parsed.confidence) || 0))
    };
    if (!result.title || !result.artist) result.confidence = Math.min(result.confidence, 0.4);
    aiCache.set(cacheKey, { at:Date.now(), result });
    if (aiCache.size > MAX_CACHE_ENTRIES) aiCache.delete(aiCache.keys().next().value);
    return sendJson(res, 200, result);
  } catch (e) {
    return sendJson(res, 504, { error:'gemini_timeout', message:'AI identification timed out. Regular lyrics lookup can still continue.' });
  } finally { clearTimeout(timer); }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || '/', `http://${host}`);
  if ((url.pathname === '/api/identify-song' || url.pathname.endsWith('/api/identify-song')) && req.method === 'POST') return identifySong(req, res);
  if (url.pathname === '/healthz') return sendJson(res, 200, { ok:true, app:'Mujic', version:'12.0.2' });
  if (!['GET','HEAD'].includes(req.method)) return sendJson(res, 405, { error:'method_not_allowed' });
  let requested;
  try { requested = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); return res.end('Bad request'); }
  if (requested === '/') requested = '/index.html';
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) { res.writeHead(403); return res.end('Forbidden'); }
  const base = path.basename(filePath);
  if (base.startsWith('.') || ['server.js','package.json','README.md','LICENSE','VERSION'].includes(base) || filePath.split(path.sep).includes('node_modules')) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type':MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin' };
    if (base === 'index.html') headers['Cache-Control'] = 'no-cache';
    else headers['Cache-Control'] = 'public, max-age=3600';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Mujic server listening on http://localhost:${PORT}`));
