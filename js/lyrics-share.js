/* Copyright mujic@royverse69 */
/* Offline-first lyric selection and share-card renderer. */
(() => {
    'use strict';

    const MAX_LINES = 5;
    const CARD_W = 1080;
    const CARD_H = 1080;
    const selected = new Map();
    let selectionActive = false;
    let selectionTrackId = null;
    let pressTimer = null;
    let pressRow = null;
    let pressPointerId = null;
    let pressStart = null;
    let pressFired = false;
    let ignoreNextClickIndex = null;
    let ignoreClickTimer = null;
    let cardBlob = null;
    let shareUrl = '';
    let cardTrack = null;
    let cardLinesSnapshot = [];
    let cardStartTime = 0;
    let cardRenderToken = 0;
    let returnFocus = null;

    const byId = id => document.getElementById(id);
    const container = () => byId('lyrics-content');
    const trackNow = () => {
        try { return Player.getCurrentTrack(); } catch (_) { return null; }
    };
    const formatTime = value => {
        const seconds = Math.max(0, Math.floor(Number(value) || 0));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    const selectedLines = () => [...selected.values()].sort((a, b) => a.index - b.index);
    const startTimeForLines = lines => {
        const first = [...(lines || [])].sort((a, b) => a.index - b.index)[0];
        return Math.max(0, Math.floor((Number(first?.time) || 0) - (Number(State.lyricsTimingOffset) || 0)));
    };
    const selectedStartTime = () => startTimeForLines(selectedLines());
    const isOnlineTrack = track => {
        try { return Boolean(track && (window.OnlineMusic?.isOnlineTrack?.(track) || track.source === 'machhar-online' || track.isOnline === true)); }
        catch (_) { return Boolean(track && (track.source === 'machhar-online' || track.isOnline === true)); }
    };

    function ensureSelectionBar() {
        let bar = byId('lyrics-share-selection-bar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.id = 'lyrics-share-selection-bar';
        bar.className = 'lyrics-share-selection-bar';
        bar.hidden = true;
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', 'Selected lyrics');
        bar.innerHTML = `
            <div class="lyrics-share-selection-copy"><span class="lyrics-share-selection-dot"></span><span id="lyrics-share-selection-count">0 / 5 lines</span></div>
            <div class="lyrics-share-selection-actions">
                <button type="button" class="lyrics-share-cancel" data-action="lyrics-share-cancel">Cancel</button>
                <button type="button" class="lyrics-share-open" data-action="lyrics-share-open"><span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span> Share card</button>
            </div>`;
        document.body.appendChild(bar);
        return bar;
    }

    function setIgnoreNextClick(index) {
        ignoreNextClickIndex = Number(index);
        clearTimeout(ignoreClickTimer);
        ignoreClickTimer = setTimeout(() => { ignoreNextClickIndex = null; }, 900);
    }

    function stopPress() {
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = null;
        pressRow = null;
        pressPointerId = null;
        pressStart = null;
    }

    function lineData(row) {
        const index = Number(row?.dataset?.lineIndex);
        const lyric = Array.isArray(State.currentLyrics?.parsed) ? State.currentLyrics.parsed[index] : null;
        if (!Number.isInteger(index) || index < 0 || !lyric || !Number.isFinite(Number(lyric.time))) return null;
        return { index, text: String(lyric.text || row.textContent || '').trim(), time: Number(lyric.time) };
    }

    function updateRows() {
        const root = container();
        if (root) {
            root.classList.toggle('is-lyrics-selecting', selectionActive);
            root.querySelectorAll('.lyric-line[data-line-index]').forEach(row => {
                const index = Number(row.dataset.lineIndex);
                const item = selected.get(index);
                row.classList.toggle('is-share-selected', Boolean(item));
                row.setAttribute('aria-pressed', String(Boolean(item)));
                let marker = row.querySelector('.lyric-share-check');
                if (item) {
                    if (!marker) {
                        marker = document.createElement('span');
                        marker.className = 'lyric-share-check material-symbols-rounded';
                        marker.setAttribute('aria-hidden', 'true');
                        row.appendChild(marker);
                    }
                    marker.textContent = 'check';
                    marker.dataset.selectedOrder = String(selectedLines().findIndex(line => line.index === index) + 1);
                } else if (marker) marker.remove();
            });
        }
        const bar = ensureSelectionBar();
        bar.hidden = !selectionActive;
        const count = byId('lyrics-share-selection-count');
        if (count) count.textContent = `${selected.size} / ${MAX_LINES} ${selected.size === 1 ? 'line' : 'lines'}`;
        const open = bar.querySelector('[data-action="lyrics-share-open"]');
        if (open) open.disabled = selected.size === 0;
        document.body.classList.toggle('lyrics-share-selecting', selectionActive);
    }

    function toggleLine(index) {
        const root = container();
        const row = root?.querySelector(`.lyric-line[data-line-index="${Number(index)}"]`);
        const data = lineData(row);
        if (!data) return;
        if (selected.has(data.index)) {
            selected.delete(data.index);
        } else {
            if (selected.size >= MAX_LINES) {
                UI.showToast('Choose up to 5 lyric lines per card.', 'info');
                return;
            }
            selected.set(data.index, data);
        }
        updateRows();
    }

    function beginSelection(row) {
        if (State.lyricsShareEnabled === false) return;
        const track = trackNow();
        const line = lineData(row);
        if (!track || !line) return;
        const id = String(track.id ?? State.currentTrackId ?? '');
        if (!selectionActive || selectionTrackId !== id) {
            selected.clear();
            selectionTrackId = id;
            selectionActive = true;
        }
        toggleLine(line.index);
        updateRows();
        if (navigator.vibrate) { try { navigator.vibrate(16); } catch (_) {} }
    }

    function startSelection() {
        if (State.lyricsShareEnabled === false) { UI.showToast('Enable lyric sharing in Settings → Lyrics to use this feature.', 'info'); return false; }
        const track = trackNow();
        if (!track) { UI.showToast('Play a song before sharing lyrics.', 'info'); return false; }
        if (!State.isLyricsMode) UI.toggleLyricsMode();
        selected.clear();
        selectionTrackId = String(track.id ?? State.currentTrackId ?? '');
        selectionActive = true;
        updateRows();
        UI.showToast('Tap lyric lines to select up to 5, then choose Share card.', 'info');
        return true;
    }

    function handleLyricClick(row) {
        if (!selectionActive) return false;
        const track = trackNow();
        if (!track || String(track.id ?? State.currentTrackId ?? '') !== String(selectionTrackId)) {
            cancelSelection();
            return false;
        }
        const line = lineData(row);
        if (!line) return false;
        toggleLine(line.index);
        return true;
    }

    function resumeAutoFollow() {
        if (selectionActive || !byId('lyrics-share-overlay')?.hidden) return;
        const root = container();
        root?.querySelectorAll('.lyric-line.active').forEach(row => row.classList.remove('active'));
        State.activeLyricIndex = -1;
        const liveTime = Number(window.AudioAdapter?.audio?.currentTime);
        const fallbackTime = Number(State.currentTime) || 0;
        const run = () => {
            if (selectionActive || !byId('lyrics-share-overlay')?.hidden) return;
            const now = Number(window.AudioAdapter?.audio?.currentTime);
            const time = Number.isFinite(now) ? now : (Number.isFinite(liveTime) ? liveTime : fallbackTime);
            if (typeof UI?.syncLyrics === 'function') UI.syncLyrics(time);
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
    }

    function cancelSelection() {
        stopPress();
        selected.clear();
        selectionActive = false;
        selectionTrackId = null;
        updateRows();
        resumeAutoFollow();
    }

    function roundedRect(ctx, x, y, w, h, r, fill, stroke) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
        else {
            ctx.moveTo(x + radius, y);
            ctx.arcTo(x + w, y, x + w, y + h, radius);
            ctx.arcTo(x + w, y + h, x, y + h, radius);
            ctx.arcTo(x, y + h, x, y, radius);
            ctx.arcTo(x, y, x + w, y, radius);
            ctx.closePath();
        }
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }

    function wrapText(ctx, text, maxWidth, maxLines) {
        const words = String(text || '').split(/\s+/u).filter(Boolean);
        const lines = [];
        let line = '';
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(next).width > maxWidth) {
                lines.push(line);
                line = word;
            } else line = next;
        }
        if (line) lines.push(line);
        if (lines.length > maxLines) {
            lines.length = maxLines;
            let last = lines[maxLines - 1];
            while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trimEnd();
            lines[maxLines - 1] = `${last}…`;
        }
        return lines;
    }

    function artworkValueToUrl(value) {
        if (typeof value === 'string') return value.trim();
        if (Array.isArray(value)) {
            const candidate = [...value].sort((a, b) => (Number(b?.width || b?.height || 0) - Number(a?.width || a?.height || 0)))[0];
            return artworkValueToUrl(candidate);
        }
        if (value && typeof value === 'object') {
            return artworkValueToUrl(value.url || value.link || value.src || value.imageUrl || value.image_url || value.thumbnail || value.image || '');
        }
        return '';
    }

    function normalizeArtworkCandidate(value) {
        let src = artworkValueToUrl(value);
        if (!src) return '';
        // The service worker uses a same-origin virtual route for catalogue artwork. For
        // canvas export, unwrap it and use Render's CORS-enabled /media endpoint instead.
        try {
            const parsed = new URL(src, location.href);
            if (parsed.pathname.endsWith('/__mujic_media__')) {
                const raw = parsed.searchParams.get('src') || '';
                if (raw) src = raw;
            }
        } catch (_) {}
        if (/^(?:blob:|data:)/i.test(src)) return src;
        try {
            const parsed = new URL(src, location.href);
            if (parsed.origin === location.origin) return parsed.href;
            const proxied = window.OnlineMusic?.getImage?.({ image: parsed.href });
            if (proxied) return String(proxied);
            return parsed.href;
        } catch (_) { return ''; }
    }

    function artworkCandidates(track) {
        const candidates = [];
        const addUnique = src => { if (src && !candidates.includes(src)) candidates.push(src); };
        const add = value => {
            const raw = artworkValueToUrl(value);
            const src = normalizeArtworkCandidate(value);
            addUnique(src);
            // A Render proxy failure should not make us give up on the cover. Keep the
            // original CDN URL as a second attempt; anonymous CORS mode below ensures a
            // no-CORS response is rejected rather than tainting the exported canvas.
            if (raw && src && raw !== src) {
                let direct = raw;
                try {
                    const parsed = new URL(raw, location.href);
                    if (parsed.pathname.endsWith('/__mujic_media__')) direct = parsed.searchParams.get('src') || direct;
                    else if (window.MujicBackend?.origins?.().includes(parsed.origin) && parsed.pathname === '/media') direct = parsed.searchParams.get('url') || direct;
                    const directUrl = new URL(direct, location.href);
                    if (/\.saavncdn\.com$/i.test(directUrl.hostname) || /(^|\.)jiosaavn\.com$/i.test(directUrl.hostname)) addUnique(directUrl.href);
                } catch (_) {}
            }
        };
        // Offline/local tracks may use a blob URL already loaded into the actual player.
        // Use those first only when the track itself has no remote cover URL.
        const trackSrc = artworkValueToUrl(track?.artworkUrl || track?.artwork || track?.imageUrl || track?.image_url || track?.image);
        const isLocalBlob = /^(?:blob:|data:)/i.test(trackSrc);
        if (isLocalBlob) add(trackSrc);

        // Ask the provider to rebuild the high-resolution cover URL through Render. The
        // raw payload carries nested/quality-specific Saavn image variants omitted by some
        // queue copies of the track object.
        try {
            const rawImage = window.OnlineMusic?.getImage?.(track?.raw || {});
            add(rawImage);
        } catch (_) {}
        add(track?.artworkUrl);
        add(track?.artwork);
        add(track?.imageUrl || track?.image_url || track?.image);
        add(track?.raw?.image || track?.raw?.images || track?.raw?.artwork || track?.raw?.imageUrl || track?.raw?.image_url || track?.raw?.thumbnail);
        add(track?.raw?.more_info?.image || track?.raw?.more_info?.image_url || track?.raw?.more_info?.imageUrl || track?.raw?.more_info?.thumbnail);

        // The player can already have the genuine image loaded even when a track copy has
        // lost its artworkUrl (for example after being restored from the queue).
        for (const id of ['full-art', 'mini-art', 'desktop-lyrics-art']) {
            const image = byId(id);
            if (!image || !image.complete || !(image.naturalWidth > 1)) continue;
            const current = image.currentSrc || image.src;
            if (current && !/icon-(?:192|512)\.png|music-note|default-art/i.test(current)) add(current);
        }
        // Retry the actual player's sources after proxy URLs: this covers blob-cached album
        // art and older locally downloaded tracks without replacing their existing behavior.
        for (const id of ['full-art', 'mini-art', 'desktop-lyrics-art']) {
            const image = byId(id);
            if (!image) continue;
            const current = image.currentSrc || image.src;
            if (current && /^(?:blob:|data:)/i.test(current) && !candidates.includes(current)) candidates.push(current);
        }
        return candidates;
    }

    async function loadArtwork(track) {
        const candidates = artworkCandidates(track);
        for (const src of candidates) {
            const image = await new Promise(resolve => {
                const img = new Image();
                let settled = false;
                const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
                const timer = setTimeout(() => finish(null), 1800);
                img.decoding = 'async';
                try {
                    const parsed = new URL(src, location.href);
                    // Keep blob/data/same-origin sources untampered; remote candidates must
                    // load with CORS or the canvas would become unreadable on PNG export.
                    if (parsed.origin !== location.origin && !/^(?:blob:|data:)/i.test(src)) img.crossOrigin = 'anonymous';
                } catch (_) {}
                img.onload = () => finish(img.naturalWidth > 1 && img.naturalHeight > 1 ? img : null);
                img.onerror = () => finish(null);
                img.src = src;
                if (img.complete && img.naturalWidth > 1) finish(img);
            });
            if (image) return image;
        }
        return null;
    }

    async function loadSpotifyLogo(lightBackground) {
        const file = lightBackground ? 'Spotify%20Logo%20-%20Black.png' : 'Spotify%20Logo%20-%20White.png';
        const localUrl = new URL(`./icons/${file}`, location.href).href;
        const remoteUrl = `https://raw.githubusercontent.com/royverse69/mujic/main/icons/${file}`;
        return new Promise(resolve => {
            const img = new Image();
            let settled = false;
            let sourceIndex = 0;
            const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish(null), 1400);
            img.decoding = 'async';
            img.onload = () => finish(img);
            img.onerror = () => {
                if (settled) return;
                if (sourceIndex === 0) {
                    sourceIndex = 1;
                    // If the packaged files are missing, retry the exact uploaded asset from the public repo.
                    // CORS mode prevents a successfully loaded remote image from tainting the export canvas.
                    img.crossOrigin = 'anonymous';
                    img.src = remoteUrl;
                } else finish(null);
            };
            img.src = localUrl;
        });
    }


    async function loadMujicLogo() {
        const localUrl = new URL('./icons/icon-512.png', location.href).href;
        return new Promise(resolve => {
            const img = new Image(); let settled = false;
            const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish(null), 1000);
            img.decoding = 'async'; img.onload = () => finish(img); img.onerror = () => finish(null); img.src = localUrl;
        });
    }

    function paletteFromArtwork(image, track) {
        const hashHue = () => {
            const key = `${track?.id || ''}|${track?.title || ''}|${track?.artist || ''}`;
            let hash = 2166136261;
            for (let i = 0; i < key.length; i++) { hash ^= key.charCodeAt(i); hash = Math.imul(hash, 16777619); }
            return (hash >>> 0) % 360;
        };
        const hslToRgb = (h, s, l) => {
            h = ((h % 360) + 360) % 360 / 360;
            const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q-p)*6*t; if (t < 1/2) return q; if (t < 2/3) return p + (q-p)*(2/3-t)*6; return p; };
            const q = l < .5 ? l * (1+s) : l + s - l*s, p = 2*l-q;
            return { r:Math.round(hue2rgb(p,q,h+1/3)*255), g:Math.round(hue2rgb(p,q,h)*255), b:Math.round(hue2rgb(p,q,h-1/3)*255) };
        };
        const fallback = () => hslToRgb(hashHue(), .52, .45);
        if (!image) return fallback();
        try {
            const sample = document.createElement('canvas');
            sample.width = 36; sample.height = 36;
            const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
            sampleCtx.drawImage(image, 0, 0, 36, 36);
            const pixels = sampleCtx.getImageData(0, 0, 36, 36).data;
            const buckets = Array.from({length: 12}, () => ({r:0,g:0,b:0,weight:0,count:0}));
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i + 3] < 100) continue;
                const r = pixels[i]/255, g = pixels[i+1]/255, b = pixels[i+2]/255;
                const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max-min;
                const l = (max+min)/2;
                if (l < .09 || l > .94 || delta < .045) continue;
                let h = 0;
                if (delta) {
                    if (max === r) h = 60 * (((g-b)/delta) % 6);
                    else if (max === g) h = 60 * ((b-r)/delta + 2);
                    else h = 60 * ((r-g)/delta + 4);
                }
                if (h < 0) h += 360;
                const sat = delta / (1 - Math.abs(2*l - 1) || 1);
                if (sat < .16) continue;
                const weight = sat * (.55 + (1 - Math.abs(l-.5)*2) * .45);
                const bucket = buckets[Math.floor(h/30)%12];
                bucket.r += pixels[i]*weight; bucket.g += pixels[i+1]*weight; bucket.b += pixels[i+2]*weight;
                bucket.weight += weight; bucket.count++;
            }
            const bucket = buckets.sort((a,b) => (b.weight + b.count*.018) - (a.weight + a.count*.018))[0];
            if (!bucket || bucket.weight < 1) return fallback();
            let color = {r:bucket.r/bucket.weight,g:bucket.g/bucket.weight,b:bucket.b/bucket.weight};
            const r = color.r/255, g = color.g/255, b = color.b/255;
            const max = Math.max(r,g,b), min = Math.min(r,g,b), delta=max-min;
            let h=0;
            if (delta) { if(max===r) h=60*(((g-b)/delta)%6); else if(max===g) h=60*((b-r)/delta+2); else h=60*((r-g)/delta+4); }
            if(h<0)h+=360;
            const l=(max+min)/2;
            const sat=delta/(1-Math.abs(2*l-1)||1);
            // Lift muted album accents to a usable rich background while retaining their hue.
            return hslToRgb(h, Math.max(.42, Math.min(.78, sat*1.28)), Math.max(.34, Math.min(.53, l*.92)));
        } catch (_) { return fallback(); }
    }

    function colorString(color, alpha = 1) {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
    }

    function drawImageCover(ctx, image, x, y, width, height) {
        const scale = Math.max(width / image.width, height / image.height);
        const sw = width / scale, sh = height / scale;
        const sx = Math.max(0, (image.width - sw) / 2), sy = Math.max(0, (image.height - sh) / 2);
        ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
    }

    function fallbackSpotifyMark(ctx, x, y, foreground, background) {
        // Used only if an uploaded logo asset is unavailable; normal deployments use the repository PNG.
        ctx.save();
        ctx.fillStyle = foreground;
        ctx.beginPath(); ctx.arc(x + 22, y + 22, 21, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = background; ctx.lineCap = 'round'; ctx.lineWidth = 3.2;
        [[-10, -3, 10], [-8, 4, 8], [-5, 10, 5]].forEach(([dy, start, end]) => {
            ctx.beginPath(); ctx.moveTo(x + 22 - 13, y + 22 + dy);
            ctx.quadraticCurveTo(x + 22, y + 22 + dy + (dy < 0 ? -4 : 1), x + 22 + 13, y + 22 + dy + 1);
            ctx.stroke();
        });
        ctx.fillStyle = foreground; ctx.font = '800 42px Arial, sans-serif';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText('Spotify', x + 57, y + 22);
        ctx.restore();
    }

    async function drawCard(track, lines, token) {
        const canvas = byId('lyrics-share-card-canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas is not available.');
        canvas.width = CARD_W; canvas.height = CARD_H;
        const art = await loadArtwork(track);
        if (token !== cardRenderToken) return null;
        try { await Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 220))]); } catch (_) {}

        const shareStyle = State.lyricsShareStyle === 'mujic' ? 'mujic' : 'spotify';
        const artworkPalette = paletteFromArtwork(art, track);
        // The Spotify card uses the RGB negative of the dominant cover palette so the artwork
        // visibly separates from its background. Mujic keeps the art-derived accent palette.
        const palette = shareStyle === 'spotify'
            ? { r:255-artworkPalette.r, g:255-artworkPalette.g, b:255-artworkPalette.b }
            : artworkPalette;
        const linearChannel = value => { const channel = Math.max(0, Math.min(255, Number(value) || 0)) / 255; return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4); };
        const luminance = .2126 * linearChannel(palette.r) + .7152 * linearChannel(palette.g) + .0722 * linearChannel(palette.b);
        const lightBackground = luminance > .179;
        const foreground = lightBackground ? '#111216' : '#ffffff';
        const secondary = lightBackground ? 'rgba(12,13,17,.72)' : 'rgba(255,255,255,.76)';
        const gradientEnd = { r:Math.round(palette.r*(lightBackground ? .90 : .68)), g:Math.round(palette.g*(lightBackground ? .90 : .68)), b:Math.round(palette.b*(lightBackground ? .90 : .68)) };
        const background = ctx.createLinearGradient(0,0,CARD_W,CARD_H);
        background.addColorStop(0,colorString(palette)); background.addColorStop(1,colorString(gradientEnd));
        ctx.fillStyle=background;ctx.fillRect(0,0,CARD_W,CARD_H);
        roundedRect(ctx,20,20,CARD_W-40,CARD_H-40,26,null,lightBackground?'rgba(0,0,0,.10)':'rgba(255,255,255,.13)');

        const titleText=String(track?.title||'Unknown song');
        const artistText=String(track?.artist||'Unknown artist');
        if (shareStyle === 'spotify') {
            // Spotify-inspired card: album art and metadata form one compact identity row.
            const artX=72,artY=72,artSize=126;
            ctx.save();ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(artX,artY,artSize,artSize,15);else roundedRect(ctx,artX,artY,artSize,artSize,15,null);ctx.clip();
            if(art)drawImageCover(ctx,art,artX,artY,artSize,artSize);else{ctx.fillStyle=lightBackground?'rgba(0,0,0,.08)':'rgba(255,255,255,.12)';ctx.fillRect(artX,artY,artSize,artSize);ctx.fillStyle=foreground;ctx.font='700 68px Arial,sans-serif';ctx.textAlign='center';ctx.fillText('♫',artX+artSize/2,artY+88);}ctx.restore();
            ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle=foreground;
            const titleFont=titleText.length>35?36:titleText.length>25?40:46;ctx.font=`750 ${titleFont}px Inter,system-ui,sans-serif`;
            ctx.fillText(wrapText(ctx,titleText,792,1)[0]||'Unknown song',230,125,792);
            ctx.fillStyle=secondary;ctx.font='600 32px Inter,system-ui,sans-serif';ctx.fillText(wrapText(ctx,artistText,792,1)[0]||'Unknown artist',230,174,792);
        } else {
            // Original Mujic card: centered cover, track metadata, lyric quote, and app mark.
            const artSize=132,artX=(CARD_W-artSize)/2,artY=52;
            ctx.save();ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(artX,artY,artSize,artSize,18);else roundedRect(ctx,artX,artY,artSize,artSize,18,null);ctx.clip();
            if(art)drawImageCover(ctx,art,artX,artY,artSize,artSize);else{ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(artX,artY,artSize,artSize);ctx.fillStyle=foreground;ctx.font='700 68px Arial,sans-serif';ctx.textAlign='center';ctx.fillText('♫',CARD_W/2,artY+88);}ctx.restore();
            ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=foreground;
            ctx.font=`750 ${titleText.length>38?34:titleText.length>26?38:43}px Inter,system-ui,sans-serif`;
            ctx.fillText(wrapText(ctx,titleText,870,1)[0]||'Unknown song',CARD_W/2,224,870);
            ctx.fillStyle=secondary;ctx.font='600 30px Inter,system-ui,sans-serif';ctx.fillText(wrapText(ctx,artistText,870,1)[0]||'Unknown artist',CARD_W/2,267,870);
            ctx.fillStyle=lightBackground?'rgba(0,0,0,.22)':'rgba(255,255,255,.5)';ctx.font='700 100px Georgia,serif';ctx.fillText('“',94,381);
        }

        const chosen=(Array.isArray(lines)?lines:[]).slice(0,MAX_LINES).map(line=>String(line?.text||'').trim()).filter(Boolean);
        let fontSize=chosen.length>=5?66:chosen.length===4?72:chosen.length===3?78:chosen.length===2?84:90;
        const sidePadding=shareStyle==='spotify'?76:108;
        const availableWidth=CARD_W-sidePadding*2;
        const lyricAreaTop=shareStyle==='spotify'?254:320;
        const lyricAreaHeight=shareStyle==='spotify'?600:520;
        let wrappedGroups=[],totalHeight=0;
        const layoutLyrics=()=>{
            ctx.font=`750 ${fontSize}px Inter,system-ui,sans-serif`;
            wrappedGroups=chosen.map(text=>wrapText(ctx,text,availableWidth,2));
            const lineHeight=Math.round(fontSize*1.12),groupGap=Math.round(fontSize*.23);
            totalHeight=wrappedGroups.reduce((sum,parts)=>sum+parts.length*lineHeight,0)+Math.max(0,wrappedGroups.length-1)*groupGap;
            return {lineHeight,groupGap};
        };
        let {lineHeight,groupGap}=layoutLyrics();
        while(totalHeight>lyricAreaHeight&&fontSize>34){fontSize-=2;({lineHeight,groupGap}=layoutLyrics());}
        if(totalHeight>lyricAreaHeight){ctx.font='700 34px Inter,system-ui,sans-serif';wrappedGroups=chosen.map(text=>wrapText(ctx,text,availableWidth,1));lineHeight=39;groupGap=9;totalHeight=wrappedGroups.reduce((sum,parts)=>sum+parts.length*lineHeight,0)+Math.max(0,wrappedGroups.length-1)*groupGap;}
        let y=lyricAreaTop+Math.max(0,(lyricAreaHeight-totalHeight)/2)+lineHeight;
        ctx.textAlign=shareStyle==='spotify'?'left':'center';ctx.textBaseline='alphabetic';ctx.fillStyle=foreground;
        ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
        wrappedGroups.forEach((parts,index)=>{for(const part of parts){ctx.fillText(part,shareStyle==='spotify'?sidePadding:CARD_W/2,y,availableWidth);y+=lineHeight;}if(index<wrappedGroups.length-1)y+=groupGap;});

        if (shareStyle === 'spotify') {
            const spotifyLogo=await loadSpotifyLogo(lightBackground);
            if(token!==cardRenderToken)return null;
            const logoX=72,logoY=958,logoMaxWidth=190,logoMaxHeight=48;
            if(spotifyLogo&&spotifyLogo.naturalWidth&&spotifyLogo.naturalHeight){const scale=Math.min(logoMaxWidth/spotifyLogo.naturalWidth,logoMaxHeight/spotifyLogo.naturalHeight);const logoWidth=spotifyLogo.naturalWidth*scale,logoHeight=spotifyLogo.naturalHeight*scale;ctx.drawImage(spotifyLogo,logoX,logoY+(logoMaxHeight-logoHeight)/2,logoWidth,logoHeight);}
            else fallbackSpotifyMark(ctx,logoX,logoY+2,foreground,colorString(gradientEnd));
        } else {
            const brand=await loadMujicLogo();
            if(token!==cardRenderToken)return null;
            const size=42,x=CARD_W/2-80,yBrand=965;
            if(brand)ctx.drawImage(brand,x,yBrand,size,size);
            ctx.fillStyle=foreground;ctx.font='800 34px Inter,system-ui,sans-serif';ctx.textAlign='left';ctx.fillText('MUJIC',x+52,yBrand+30);
            ctx.fillStyle=secondary;ctx.font='500 19px Inter,system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('royverse69.github.io/mujic',CARD_W/2,1030);
        }
        return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob||null),'image/png'));
    }

    async function openCard() {
        const track = trackNow();
        const lines = selectedLines();
        if (!track || !lines.length) { UI.showToast('Long-press a lyric, then select up to 5 lines.', 'info'); return; }
        if (String(track.id ?? State.currentTrackId ?? '') !== String(selectionTrackId)) {
            cancelSelection();
            UI.showToast('The song changed. Select lyrics from the current song.', 'info');
            return;
        }
        if (!byId('lyrics-share-card-canvas')) {
            UI.showToast('The share-card interface did not load. Reload Mujic and try again.', 'error');
            return;
        }
        const stableTrack = {
            ...track,
            title: String(track.title || 'Unknown song'),
            artist: String(track.artist || 'Unknown artist'),
            artworkUrl: String(track.artworkUrl || track.artwork || '')
        };
        const stableLines = lines.map(line => ({ ...line }));
        const start = startTimeForLines(stableLines);
        cardTrack = stableTrack;
        cardLinesSnapshot = stableLines;
        cardStartTime = start;
        // Keep a timestamp link in the share message for streaming tracks when supported; the image itself has no QR code.
        try { shareUrl = isOnlineTrack(stableTrack) && window.TrackActions?.shortShareUrl ? (window.TrackActions.shortShareUrl(stableTrack, start) || '') : ''; }
        catch (_) { shareUrl = ''; }

        const overlay = byId('lyrics-share-overlay');
        const canvas = byId('lyrics-share-card-canvas');
        if (!overlay || !canvas) return;
        returnFocus = document.activeElement;
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('lyrics-share-open');
        cardBlob = null;
        overlay.classList.add('is-rendering');
        const token = ++cardRenderToken;
        try {
            cardBlob = await drawCard(stableTrack, stableLines, token);
            if (token !== cardRenderToken || overlay.hidden) return;
            if (!cardBlob) throw new Error('Could not export the lyric card.');
        } catch (error) {
            console.warn('[Mujic] lyric card render failed', error);
            UI.showToast('Could not render the share card. Try again.', 'error');
        } finally {
            if (token === cardRenderToken) overlay.classList.remove('is-rendering');
        }
    }

    function closeCard() {
        const overlay = byId('lyrics-share-overlay');
        if (!overlay) return;
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('is-rendering');
        document.body.classList.remove('lyrics-share-open');
        cardBlob = null;
        cardTrack = null;
        cardLinesSnapshot = [];
        cardStartTime = 0;
        shareUrl = '';
        cardRenderToken++;
        cancelSelection();
        if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus({ preventScroll: true });
    }

    function downloadCard() {
        if (!cardBlob) { UI.showToast('The card is still rendering. Try again in a moment.', 'info'); return; }
        const url = URL.createObjectURL(cardBlob);
        const link = document.createElement('a');
        link.href = url; link.download = 'mujic-lyrics-card.png';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        UI.showToast('Lyrics card saved as an image.', 'check_circle');
        closeCard();
    }

    async function shareCard() {
        if (!cardBlob) { UI.showToast('The card is still rendering. Try again in a moment.', 'info'); return; }
        const track = cardTrack;
        const lines = cardLinesSnapshot;
        const quote = lines.map(line => line.text).join('\n');
        const file = new File([cardBlob], 'mujic-lyrics-card.png', { type: 'image/png' });
        const title = `${track?.title || 'Lyrics'} — Mujic`;
        const shareText = `${quote}\n\n${track?.title || 'Song'} · ${track?.artist || 'Unknown artist'}${isOnlineTrack(track) ? ` · ${formatTime(cardStartTime)}` : ''}${shareUrl ? `\n${shareUrl}` : ''}`;
        try {
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ title, text: shareText, files: [file] });
                closeCard();
                return;
            }
            downloadCard();
            UI.showToast('Native image sharing is not available here, so the card was saved instead.', 'info');
        } catch (error) {
            if (error?.name === 'AbortError') return;
            console.warn('[Mujic] image share failed', error);
            downloadCard();
        }
    }

    function init() {
        const root = container();
        if (!root || root.dataset.lyricsShareReady === '1') return;
        root.dataset.lyricsShareReady = '1';
        ensureSelectionBar();

        root.addEventListener('pointerdown', event => {
            const row = event.target.closest('.lyric-line[data-line-index][data-time]');
            if (State.lyricsShareEnabled === false || !row || event.button > 0 || !lineData(row)) return;
            stopPress();
            pressRow = row;
            pressPointerId = event.pointerId;
            pressStart = { x: event.clientX, y: event.clientY };
            pressFired = false;
            pressTimer = setTimeout(() => {
                if (!pressRow || pressRow !== row) return;
                pressFired = true;
                setIgnoreNextClick(row.dataset.lineIndex);
                beginSelection(row);
                stopPress();
            }, event.pointerType === 'mouse' ? 520 : 470);
        }, { passive: true });

        root.addEventListener('pointermove', event => {
            if (!pressRow || event.pointerId !== pressPointerId || !pressStart) return;
            if (Math.abs(event.clientX - pressStart.x) > 10 || Math.abs(event.clientY - pressStart.y) > 10) stopPress();
        }, { passive: true });
        ['pointerup', 'pointercancel', 'dragstart'].forEach(type => root.addEventListener(type, () => {
            if (pressTimer) stopPress();
        }, { passive: true }));

        // The browser context-menu gesture also starts selection on desktop.
        root.addEventListener('contextmenu', event => {
            const row = event.target.closest('.lyric-line[data-line-index][data-time]');
            if (State.lyricsShareEnabled === false || !row || !lineData(row)) return;
            event.preventDefault();
            if (ignoreNextClickIndex === Number(row.dataset.lineIndex)) return;
            beginSelection(row);
        });

        // A long-press's synthetic click must not immediately deselect the tapped line.
        root.addEventListener('click', event => {
            const row = event.target.closest('.lyric-line[data-line-index]');
            if (!row || ignoreNextClickIndex === null || Number(row.dataset.lineIndex) !== Number(ignoreNextClickIndex)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            ignoreNextClickIndex = null;
            clearTimeout(ignoreClickTimer);
        }, true);

        byId('lyrics-share-overlay')?.addEventListener('click', event => {
            if (event.target === byId('lyrics-share-overlay')) closeCard();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                if (!byId('lyrics-share-overlay')?.hidden) closeCard();
                else if (selectionActive) cancelSelection();
            }
        });
        updateRows();
    }

    window.LyricsShare = {
        init,
        startSelection,
        refreshSelectionMarks: updateRows,
        handleLyricClick,
        openCard,
        closeCard,
        downloadCard,
        shareCard,
        cancelSelection,
        isSelecting: () => selectionActive,
        shouldPauseAutoFollow: () => selectionActive || !byId('lyrics-share-overlay')?.hidden,
        getSelected: selectedLines
    };
})();
