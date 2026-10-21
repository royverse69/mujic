/* Copyright mujic@royverse69 */
/* Offline-first lyric selection and share-card renderer. */
(() => {
    'use strict';

    const MAX_LINES = 4;
    const CARD_W = 1080;
    const CARD_H = 1920;
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
            <div class="lyrics-share-selection-copy"><span class="lyrics-share-selection-dot"></span><span id="lyrics-share-selection-count">0 / 4 lines</span></div>
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
                UI.showToast('Choose up to 4 lyric lines per card.', 'info');
                return;
            }
            selected.set(data.index, data);
        }
        updateRows();
    }

    function beginSelection(row) {
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
        const track = trackNow();
        if (!track) { UI.showToast('Play a song before sharing lyrics.', 'info'); return false; }
        if (!State.isLyricsMode) UI.toggleLyricsMode();
        selected.clear();
        selectionTrackId = String(track.id ?? State.currentTrackId ?? '');
        selectionActive = true;
        updateRows();
        UI.showToast('Tap lyric lines to select up to 4, then choose Share card.', 'info');
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

    function cancelSelection() {
        stopPress();
        selected.clear();
        selectionActive = false;
        selectionTrackId = null;
        updateRows();
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

    async function loadArtwork(track) {
        let src = String(track?.artworkUrl || track?.artwork || '');
        if (!src) {
            const element = byId('full-art') || byId('mini-art');
            src = element?.currentSrc || element?.src || '';
        }
        if (!src) return null;
        return new Promise(resolve => {
            const img = new Image();
            let settled = false;
            const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish(null), 1400);
            try {
                const parsed = new URL(src, location.href);
                if (parsed.origin !== location.origin && !/^blob:|^data:/i.test(src)) img.crossOrigin = 'anonymous';
            } catch (_) {}
            img.onload = () => finish(img);
            img.onerror = () => finish(null);
            img.src = src;
        });
    }

    async function loadBrandIcon() {
        return new Promise(resolve => {
            const img = new Image();
            let settled = false;
            const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
            const timer = setTimeout(() => finish(null), 1200);
            img.onload = () => finish(img);
            img.onerror = () => finish(null);
            // This is the real icon shipped in the main Mujic repository (icons/icon-512.png).
            img.src = new URL('./icons/icon-512.png', location.href).href;
        });
    }

    function paletteFromArtwork(image) {
        if (!image) return { r: 52, g: 79, b: 98 };
        try {
            const sample = document.createElement('canvas');
            sample.width = 18; sample.height = 18;
            const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
            sampleCtx.drawImage(image, 0, 0, 18, 18);
            const pixels = sampleCtx.getImageData(0, 0, 18, 18).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i + 3] < 80) continue;
                // De-emphasize highlights and highly saturated poster accents; the palette is an ambience, not a neon fill.
                r += Math.min(210, pixels[i]);
                g += Math.min(210, pixels[i + 1]);
                b += Math.min(210, pixels[i + 2]);
                count++;
            }
            if (!count) return { r: 52, g: 79, b: 98 };
            const avg = { r: r / count, g: g / count, b: b / count };
            const luminance = avg.r * .2126 + avg.g * .7152 + avg.b * .0722;
            const scale = luminance > 150 ? .47 : luminance > 95 ? .58 : .72;
            return { r: Math.round(avg.r * scale), g: Math.round(avg.g * scale), b: Math.round(avg.b * scale) };
        } catch (_) {
            // If a provider's art disallows canvas sampling, use a restrained slate palette and still draw the artwork when possible.
            return { r: 39, g: 68, b: 88 };
        }
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

    async function drawCard(track, lines, token) {
        const canvas = byId('lyrics-share-card-canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('Canvas is not available.');
        canvas.width = CARD_W;
        canvas.height = CARD_H;
        const art = await loadArtwork(track);
        const appIcon = await loadBrandIcon();
        if (token !== cardRenderToken) return null;
        try { await Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(resolve => setTimeout(resolve, 500))]); } catch (_) {}

        const palette = paletteFromArtwork(art);
        ctx.save();
        if (art) {
            ctx.filter = 'blur(42px) saturate(.58)';
            ctx.globalAlpha = .72;
            drawImageCover(ctx, art, -54, -54, CARD_W + 108, CARD_H + 108);
            ctx.filter = 'none';
            ctx.globalAlpha = 1;
        } else {
            const fallback = ctx.createLinearGradient(0, 0, CARD_W * .65, CARD_H);
            fallback.addColorStop(0, '#203c4c');
            fallback.addColorStop(.56, '#1e2938');
            fallback.addColorStop(1, '#080b10');
            ctx.fillStyle = fallback;
            ctx.fillRect(0, 0, CARD_W, CARD_H);
        }
        const ambience = ctx.createRadialGradient(CARD_W * .18, CARD_H * .31, 12, CARD_W * .18, CARD_H * .31, CARD_W * .95);
        ambience.addColorStop(0, colorString(palette, .72));
        ambience.addColorStop(1, colorString(palette, 0));
        ctx.fillStyle = ambience;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        const shade = ctx.createLinearGradient(0, 0, 0, CARD_H);
        shade.addColorStop(0, 'rgba(5, 8, 12, .48)');
        shade.addColorStop(.28, 'rgba(5, 8, 12, .48)');
        shade.addColorStop(.64, 'rgba(4, 7, 11, .72)');
        shade.addColorStop(1, 'rgba(2, 4, 7, .94)');
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, CARD_W, CARD_H);
        ctx.restore();

        // Quiet frame inspired by the reference: avoid bright accent blocks and use a muted colour from the cover.
        roundedRect(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 34, null, 'rgba(255,255,255,.075)');
        const accent = {
            r: Math.min(205, Math.round(palette.r * .68 + 100)),
            g: Math.min(215, Math.round(palette.g * .68 + 105)),
            b: Math.min(225, Math.round(palette.b * .68 + 110))
        };

        // Header
        ctx.fillStyle = 'rgba(245, 248, 252, .86)';
        ctx.font = '800 30px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '8px';
        ctx.fillText('LYRIC', CARD_W / 2, 155);
        ctx.letterSpacing = '0px';

        // Oversized opening quote, tinted by the album art.
        ctx.textAlign = 'left';
        ctx.fillStyle = colorString(accent, .84);
        ctx.font = '900 225px Georgia, serif';
        ctx.fillText('“', 116, 350);

        // Keep each chosen line readable, centered and visually faithful to the reference.
        const chosen = (Array.isArray(lines) ? lines : []).slice(0, MAX_LINES).map(line => String(line?.text || '').trim()).filter(Boolean);
        let fontSize = chosen.length >= 4 ? 64 : chosen.length === 3 ? 69 : chosen.length === 2 ? 74 : 78;
        const availableWidth = 900;
        let wrappedGroups = [];
        let totalHeight = 0;
        const layoutLyrics = () => {
            ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
            wrappedGroups = chosen.map(text => wrapText(ctx, text, availableWidth, 2));
            const lineHeight = Math.round(fontSize * 1.16);
            totalHeight = wrappedGroups.reduce((sum, parts) => sum + parts.length * lineHeight, 0) + Math.max(0, wrappedGroups.length - 1) * Math.round(fontSize * .18);
            return lineHeight;
        };
        let lineHeight = layoutLyrics();
        while (totalHeight > 795 && fontSize > 42) { fontSize -= 2; lineHeight = layoutLyrics(); }
        const lyricsTop = 450 + Math.max(0, (790 - totalHeight) / 2);
        let y = lyricsTop;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f7f8fb';
        ctx.shadowColor = 'rgba(0,0,0,.36)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 7;
        wrappedGroups.forEach((parts, index) => {
            for (const part of parts) {
                ctx.fillText(part, CARD_W / 2, y, availableWidth);
                y += lineHeight;
            }
            if (index < wrappedGroups.length - 1) y += Math.round(fontSize * .18);
        });
        ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        // Actual album cover art, centered below the lyric passage.
        const artSize = 206, artX = (CARD_W - artSize) / 2, artY = 1275;
        ctx.save();
        ctx.shadowColor = colorString(accent, .28); ctx.shadowBlur = 54; ctx.shadowOffsetY = 12;
        roundedRect(ctx, artX, artY, artSize, artSize, 26, 'rgba(255,255,255,.06)');
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(artX, artY, artSize, artSize, 26);
        else roundedRect(ctx, artX, artY, artSize, artSize, 26, null);
        ctx.clip();
        if (art) drawImageCover(ctx, art, artX, artY, artSize, artSize);
        else if (appIcon) drawImageCover(ctx, appIcon, artX, artY, artSize, artSize);
        else {
            ctx.fillStyle = colorString(palette, .85); ctx.fillRect(artX, artY, artSize, artSize);
            ctx.fillStyle = '#fff'; ctx.font = '800 86px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♫', CARD_W / 2, artY + 136);
        }
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        const titleSize = String(track?.title || '').length > 42 ? 38 : 44;
        ctx.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
        const title = wrapText(ctx, track?.title || 'Unknown song', 950, 1)[0] || 'Unknown song';
        ctx.fillText(title, CARD_W / 2, 1538, 950);
        ctx.fillStyle = 'rgba(245, 247, 250, .74)';
        ctx.font = '600 31px Inter, system-ui, sans-serif';
        const artist = wrapText(ctx, track?.artist || 'Unknown artist', 900, 1)[0] || 'Unknown artist';
        ctx.fillText(artist, CARD_W / 2, 1605, 900);

        // Official Mujic app icon from this repository, not a drawn placeholder logo.
        const brandSize = 48, brandX = CARD_W / 2 - 114, brandY = 1692;
        if (appIcon) {
            ctx.save();
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') ctx.roundRect(brandX, brandY, brandSize, brandSize, 13);
            else ctx.rect(brandX, brandY, brandSize, brandSize);
            ctx.clip(); ctx.drawImage(appIcon, brandX, brandY, brandSize, brandSize); ctx.restore();
        }
        ctx.fillStyle = '#f4f6fa';
        ctx.font = '800 39px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.letterSpacing = '2px';
        ctx.fillText('MUJIC', brandX + 62, brandY + 36);
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(235, 239, 245, .58)';
        ctx.font = '600 24px Inter, system-ui, sans-serif';
        ctx.fillText('royverse69.github.io/mujic', CARD_W / 2, 1808);

        return new Promise(resolve => canvas.toBlob(blob => resolve(blob || null), 'image/png'));
    }

    async function openCard() {
        const track = trackNow();
        const lines = selectedLines();
        if (!track || !lines.length) { UI.showToast('Long-press a lyric, then select up to 4 lines.', 'info'); return; }
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
            if (!row || event.button > 0 || !lineData(row)) return;
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
            if (!row || !lineData(row)) return;
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
        getSelected: selectedLines
    };
})();
