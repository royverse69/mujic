/* Copyright mujic@royverse69 */
/* Picture-in-Picture for Mujic.

   Two presentations, chosen in Settings → Playback → "Picture-in-Picture style":
   • clean  (default) — browser video PiP. Chrome shows no address / site bar on this window. A Spotify-style
                        card is drawn on a canvas; previous / play / next / seek come from the OS Media Session.
   • full             — Document PiP: an app-owned mini player with queue, lyrics, volume, shuffle, repeat and
                        favourite. Chrome always prints the site name in this window's title bar; pages cannot hide it.

   Both stay in lock-step with the one real <audio> element through window.MujicPiP.sync(). */
(() => {
    'use strict';

    /* ── CORS-safe cover art ─────────────────────────────────────
       Fetched once as a same-origin blob so the canvas is never tainted and the Document PiP never depends on
       a cross-origin request that only the service worker can answer. */
    const Art = (() => {
        let key = '', url = '', image = null, pending = null;
        const resolve = async src => {
            if (!src || typeof src !== 'string') return null;
            if (src === key && image) return { url, image };
            if (pending && pending.src === src) return pending.promise;
            const promise = (async () => {
                try {
                    let blob;
                    if (/^(data|blob):/.test(src)) blob = await (await fetch(src)).blob();
                    else {
                        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
                        try {
                            const response = await fetch(src, { mode: 'cors', credentials: 'omit', signal: controller.signal });
                            if (!response.ok) return null;
                            blob = await response.blob();
                        } finally { clearTimeout(timer); }
                    }
                    if (!blob || !blob.size) return null;
                    const objectUrl = URL.createObjectURL(blob);
                    const img = new Image(); img.decoding = 'async'; img.src = objectUrl;
                    try { await img.decode(); } catch (_) { URL.revokeObjectURL(objectUrl); return null; }
                    const old = url; key = src; url = objectUrl; image = img;
                    if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
                    return { url, image };
                } catch (_) { return null; }
            })();
            pending = { src, promise };
            promise.finally(() => { if (pending && pending.promise === promise) pending = null; });
            return promise;
        };
        return { resolve, get key() { return key; }, get image() { return image; } };
    })();

    /* ── shared helpers ──────────────────────────────────────── */
    const audio = () => AudioAdapter.audio;
    const fmt = value => { const n = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
    const isMobile = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
    const hasDocumentPiP = () => Boolean(window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function');
    const hasVideoPiP = () => Boolean(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream);
    const isPlaying = () => !audio().paused && !audio().ended;
    const snapshot = () => {
        const track = Player.getCurrentTrack();
        const el = audio();
        const duration = Number(el.duration);
        const known = Number.isFinite(duration) && duration > 0;
        return {
            track,
            id: String(track?.id ?? State.currentTrackId ?? ''),
            title: String(track?.title || document.getElementById('full-title')?.textContent || 'Mujic'),
            artist: String(track?.artist || document.getElementById('full-artist')?.textContent || 'Now playing'),
            playing: isPlaying(),
            current: Math.max(0, Number(el.currentTime) || Number(State.currentTime) || 0),
            duration: known ? duration : Math.max(0, Number(State.duration) || 0),
            known
        };
    };
    const artSource = track => {
        try {
            if (track?.source === 'machhar-online' || window.OnlineMusic?.isOnlineTrack?.(track)) {
                const proxied = window.OnlineMusic?.getImage?.(track?.raw || {}, { targetSize: 640 });
                if (proxied) return String(proxied);
            }
        } catch (_) {}
        const value = track?.artworkLargeUrl || track?.artworkMediumUrl || track?.artworkUrl || track?.artwork || track?.imageUrl || track?.image_url || track?.image;
        if (typeof value === 'string' && value) return value;
        const loaded = document.getElementById('full-art') || document.getElementById('mini-art');
        return loaded?.currentSrc || loaded?.src || window.Utils?.defaultArt || '';
    };
    const isFavorite = track => {
        if (!track) return false;
        try {
            if (window.OnlineMusic?.isOnlineTrack?.(track)) return Boolean(window.OnlineWorkspace?.isFavorite?.(track.id));
            return State.favorites.includes(track.id);
        } catch (_) { return false; }
    };
    const activeLyricIndex = (lines, time) => {
        const clock = Math.max(0, time + (Number(State.lyricsTimingOffset) || 0));
        let low = 0, high = lines.length - 1, index = -1;
        while (low <= high) { const mid = (low + high) >> 1; if (clock >= (Number(lines[mid]?.time) || 0)) { index = mid; low = mid + 1; } else high = mid - 1; }
        return index;
    };

    /* ═════════════ clean mode: video PiP ═════════════ */
    const Clean = (() => {
        const SIZE = 640;
        let video = null, canvas = null, ctx = null, lastKey = '', selfChange = 0, listening = false;

        const ensure = () => {
            if (video) return;
            canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
            ctx = canvas.getContext('2d', { alpha: false });
            video = document.createElement('video');
            video.id = 'mujic-pip-video'; video.muted = true; video.playsInline = true; video.autoplay = false;
            video.disablePictureInPicture = false;
            video.setAttribute('aria-hidden', 'true');
            video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:-4px;top:-4px';
            video.srcObject = canvas.captureStream();
            document.body.appendChild(video);
            // The PiP overlay's own play/pause buttons drive the (muted) video: forward them to the real player.
            video.addEventListener('play', () => { if (!selfChange && inPiP() && !isPlaying()) Promise.resolve(Player.togglePlay()).finally(sync); });
            video.addEventListener('pause', () => { if (!selfChange && inPiP() && isPlaying()) { Player.pause(); sync(); } });
            video.addEventListener('enterpictureinpicture', () => { AudioAdapter.setupMediaSession(); AudioAdapter.updateMediaSessionMeta(Player.getCurrentTrack()); AudioAdapter.updateMediaSessionPosition(true); lastKey = ''; sync(); });
            video.addEventListener('leavepictureinpicture', () => { lastKey = ''; });
        };
        const inPiP = () => Boolean(video && document.pictureInPictureElement === video);

        const fit = (text, maxWidth) => {
            let value = String(text || '');
            if (ctx.measureText(value).width <= maxWidth) return value;
            while (value.length > 1 && ctx.measureText(value + '…').width > maxWidth) value = value.slice(0, -1);
            return value.trimEnd() + '…';
        };
        const roundRect = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

        const paint = (snap, force) => {
            const src = artSource(snap.track);
            if (src && Art.key !== src && video._art !== src) {
                video._art = src;
                Art.resolve(src).then(() => { video._art = null; lastKey = ''; if (video) sync(); });
            }
            const art = Art.key === src ? Art.image : null;
            const second = Math.floor(snap.current);
            const key = [snap.id, snap.title, snap.artist, art ? 1 : 0, second, snap.playing, Math.floor(snap.duration)].join('|');
            if (!force && key === lastKey) return;
            lastKey = key;

            ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, SIZE, SIZE);
            // blurred full-bleed backdrop
            if (art && art.naturalWidth) {
                const s = Math.max(SIZE / art.naturalWidth, SIZE / art.naturalHeight);
                ctx.save(); ctx.globalAlpha = .9;
                ctx.drawImage(art, (SIZE - art.naturalWidth * s) / 2, (SIZE - art.naturalHeight * s) / 2, art.naturalWidth * s, art.naturalHeight * s);
                ctx.restore();
            }
            const shade = ctx.createLinearGradient(0, 120, 0, SIZE);
            shade.addColorStop(0, 'rgba(8,8,12,0)'); shade.addColorStop(.45, 'rgba(8,8,12,.62)'); shade.addColorStop(1, 'rgba(8,8,12,.97)');
            ctx.fillStyle = shade; ctx.fillRect(0, 120, SIZE, SIZE - 120);
            if (!art) { ctx.fillStyle = 'rgba(255,255,255,.06)'; roundRect(210, 130, 220, 220, 28); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '120px system-ui'; ctx.textAlign = 'center'; ctx.fillText('♪', SIZE / 2, 275); }

            // text
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#ffffff'; ctx.font = '700 38px system-ui, sans-serif';
            ctx.fillText(fit(snap.title, SIZE - 96), 48, 478);
            ctx.fillStyle = 'rgba(255,255,255,.72)'; ctx.font = '500 26px system-ui, sans-serif';
            ctx.fillText(fit(snap.artist, SIZE - 96), 48, 518);

            // progress
            const x0 = 48, x1 = SIZE - 48, y = 566, w = x1 - x0;
            const ratio = snap.known ? Math.min(1, snap.current / snap.duration) : 0;
            ctx.fillStyle = 'rgba(255,255,255,.26)'; roundRect(x0, y, w, 6, 3); ctx.fill();
            if (ratio > 0) { ctx.fillStyle = '#ffffff'; roundRect(x0, y, Math.max(6, w * ratio), 6, 3); ctx.fill(); }
            ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '500 20px system-ui, sans-serif';
            ctx.textAlign = 'left'; ctx.fillText(fmt(snap.current), x0, 604);
            ctx.textAlign = 'right'; ctx.fillText(snap.known ? `-${fmt(snap.duration - snap.current)}` : '--:--', x1, 604);
        };

        const syncVideoPlayState = snap => {
            if (!inPiP()) return;
            if (snap.playing && video.paused) { selfChange++; Promise.resolve(video.play()).catch(() => {}).finally(() => { selfChange--; }); }
            else if (!snap.playing && !video.paused) { selfChange++; try { video.pause(); } finally { setTimeout(() => { selfChange--; }, 0); } }
        };
        const sync = () => {
            if (!video) return;
            const snap = snapshot();
            paint(snap, false);
            try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = snap.playing ? 'playing' : 'paused'; } catch (_) {}
            syncVideoPlayState(snap);
        };
        const open = async () => {
            if (!hasVideoPiP()) throw new Error('Video Picture-in-Picture is not supported here.');
            ensure();
            if (inPiP()) { await document.exitPictureInPicture(); return; }
            if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
            paint(snapshot(), true);
            // A canvas stream needs one frame and a running video before the browser will enter PiP.
            selfChange++;
            try { await video.play(); } finally { selfChange--; }
            if (video.readyState < 2) await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('PiP video frame not ready')), 2500);
                video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
            });
            await video.requestPictureInPicture();
            if (!isPlaying()) { selfChange++; video.pause(); setTimeout(() => { selfChange--; }, 0); }
        };
        const close = async () => { if (inPiP()) await document.exitPictureInPicture().catch(() => {}); };
        return { open, close, sync, get isOpen() { return inPiP(); } };
    })();

    /* ═════════════ full mode: Document PiP ═════════════ */
    const STYLE = `
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;--fg:#f8fafc;--dim:rgba(248,250,252,.66);--line:rgba(255,255,255,.2);--accent:#fff}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{height:100%;margin:0;overflow:hidden;background:#09090b;color:var(--fg);user-select:none;-webkit-user-select:none}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;touch-action:manipulation}
button:focus-visible,input:focus-visible{outline:2px solid #fff;outline-offset:2px;border-radius:8px}
svg{width:22px;height:22px;fill:currentColor;display:block;pointer-events:none}
[hidden]{display:none!important}
.bg{position:fixed;inset:0;background:#09090b center/cover no-repeat;filter:blur(44px) saturate(1.5) brightness(.55);transform:scale(1.35);transition:background-image .3s;z-index:-1}
.app{height:100%;display:flex;flex-direction:column;gap:10px;padding:14px 16px 12px}
.stage{position:relative;flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center}
.art{max-width:100%;max-height:100%;aspect-ratio:1;width:auto;height:100%;object-fit:cover;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.55);background:#18181b;transition:transform .25s ease,opacity .2s}
.app.paused .art{transform:scale(.94)}
.panel{position:absolute;inset:0;overflow-y:auto;overscroll-behavior:contain;border-radius:12px;background:rgba(9,9,11,.72);backdrop-filter:blur(18px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
.q-row{display:flex;align-items:center;gap:10px;width:100%;padding:8px 12px;text-align:left}
.q-row:hover{background:rgba(255,255,255,.08)}
.q-row.now{background:rgba(255,255,255,.12)}
.q-n{width:18px;text-align:center;font-size:11px;color:var(--dim);flex:none}
.q-t{min-width:0;flex:1}.q-t b{display:block;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.q-t span{display:block;font-size:11.5px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q-h{padding:12px 12px 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.lyr{padding:28% 18px;text-align:center}
.lyr p{margin:0 0 14px;font-size:19px;line-height:1.3;font-weight:700;color:rgba(255,255,255,.38);transition:color .2s,transform .2s;cursor:pointer}
.lyr p.on{color:#fff;transform:scale(1.03)}
.lyr.plain p{font-size:15px;font-weight:500;color:rgba(255,255,255,.85);cursor:default}
.msg{display:flex;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;color:var(--dim);font-size:14px}
.meta{display:flex;align-items:center;gap:10px}
.meta>div{min-width:0;flex:1}
.title{font-size:17px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.artist{margin-top:2px;font-size:13px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--dim);flex:none;transition:color .12s,background .12s,transform .1s}
.icon:hover{color:#fff;background:rgba(255,255,255,.1)}.icon:active{transform:scale(.9)}
.icon.on{color:#fff}.icon.on::after{content:"";position:absolute;bottom:2px;width:4px;height:4px;border-radius:50%;background:#fff}
.icon{position:relative}
.seek{display:grid;grid-template-columns:36px 1fr 40px;align-items:center;gap:8px;font-size:11px;color:var(--dim);font-variant-numeric:tabular-nums}
.seek span:last-child{text-align:right}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:18px;margin:0;background:transparent;cursor:pointer;--p:0%}
input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,#fff var(--p),var(--line) var(--p))}
input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:var(--line)}
input[type=range]::-moz-range-progress{height:4px;border-radius:2px;background:#fff}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:#fff;opacity:0;transition:opacity .12s}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:#fff;opacity:0}
input[type=range]:hover::-webkit-slider-thumb,input[type=range]:focus-visible::-webkit-slider-thumb{opacity:1}
input[type=range]:hover::-moz-range-thumb,input[type=range]:focus-visible::-moz-range-thumb{opacity:1}
input[type=range]:disabled{opacity:.4;cursor:default}
.transport{display:flex;align-items:center;justify-content:center;gap:6px}
.play{width:52px;height:52px;border-radius:50%;background:#fff;color:#09090b;display:inline-flex;align-items:center;justify-content:center;transition:transform .12s}
.play:hover{transform:scale(1.06)}.play:active{transform:scale(.95)}.play svg{width:26px;height:26px}
.skip svg{width:26px;height:26px}.skip{width:44px;height:44px;color:#fff}
.tools{display:flex;align-items:center;justify-content:space-between;gap:4px}
.vol{display:flex;align-items:center;gap:2px;flex:1;min-width:0;max-width:150px}
.vol input{flex:1;min-width:40px}
.tools-right{display:flex;align-items:center;gap:2px}
@media (max-height:380px){.meta .artist{display:none}.app{gap:6px;padding:10px 12px 8px}.play{width:44px;height:44px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
    const ICON = {
        play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zM20 6v12L9 12z"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM4 6v12l11-6z"/></svg>',
        shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5l-2-2-4.5 4.5-1.4-1.4L17.6 4.6 16 3zM3 7h3.6c1 0 1.9.5 2.5 1.3l8 10.2c.2.3.6.5 1 .5H19v-2.2l-1.6 1.6 1.4 1.4L22 17.5 18.8 14.3l-1.4 1.4 1.6 1.6H17.7L9.7 7.1C8.9 6.1 7.8 5.5 6.6 5.5H3V7zm0 10h3.6c.8 0 1.5-.3 2-.9l1.2-1.5-1.3-1.7-1.5 1.8c-.2.2-.5.3-.8.3H3V17zM16 14l2.7-2.7L22 14.5V19h-2v-3l-1.7 1.7z" transform="scale(.9) translate(1.3 1.3)"/></svg>',
        repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
        repeat1: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z"/></svg>',
        heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 5 6 5c2 0 3.4 1 4.2 2.2h.0C11 6 12.400 5 14 5c3.300 0 5.100 3.400 3.600 6.800C19.500 16.400 12 21 12 21z" transform="translate(.4 0)"/></svg>',
        heartOff: '<svg viewBox="0 0 24 24"><path d="M16.500 3c-1.700 0-3.200.8-4.500 2.100C10.700 3.800 9.200 3 7.500 3 4.400 3 2 5.400 2 8.500c0 3.800 3.400 6.900 8.600 11.500l1.400 1.300 1.400-1.300C18.600 15.400 22 12.300 22 8.500 22 5.400 19.600 3 16.500 3zm-4.400 15.600l-.1.100-.1-.1C7.100 14.400 4 11.600 4 8.500 4 6.500 5.500 5 7.500 5c1.500 0 3 1 3.600 2.400h1.800C13.500 6 15 5 16.500 5c2 0 3.500 1.500 3.500 3.500 0 3.100-3.100 5.900-7.900 10.100z"/></svg>',
        vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 4V5L7 9H3zm13.500 3a4.500 4.500 0 0 0-2.500-4v8a4.500 4.500 0 0 0 2.500-4zM14 3.200v2.100a7 7 0 0 1 0 13.400v2.100a9 9 0 0 0 0-17.600z"/></svg>',
        mute: '<svg viewBox="0 0 24 24"><path d="M16.500 12A4.500 4.500 0 0 0 14 8v2.200l2.500 2.500c0-.2 0-.5 0-.7zM19 12c0 .9-.2 1.800-.5 2.600l1.500 1.500A9 9 0 0 0 21 12a9 9 0 0 0-7-8.800v2.100A7 7 0 0 1 19 12zM4.300 3L3 4.300 7.700 9H3v6h4l5 5v-6.700l4.300 4.300c-.7.500-1.400.9-2.300 1.200v2.100a9 9 0 0 0 3.700-1.800l2 2 1.300-1.300L4.300 3zM12 4L9.900 6.100 12 8.200V4z"/></svg>',
        lyrics: '<svg viewBox="0 0 24 24"><path d="M19 3H5a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h3l4 3 4-3h3a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zm1 13a1 1 0 0 1-1 1h-3.700L12 19.500 8.700 17H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10zM7 8h10v2H7zm0 4h7v2H7z"/></svg>',
        queue: '<svg viewBox="0 0 24 24"><path d="M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z"/></svg>',
        open: '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.600l-9.800 9.800 1.400 1.400L19 6.400V10h2V3h-7z"/></svg>'
    };
    const HTML = `
<div class="bg" id="bg"></div>
<main class="app" id="app" aria-label="Mujic mini player">
  <section class="stage" id="stage">
    <img class="art" id="art" alt="" draggable="false">
    <div class="panel" id="panel-queue" hidden role="list" aria-label="Up next"></div>
    <div class="panel" id="panel-lyrics" hidden aria-label="Lyrics"></div>
  </section>
  <section class="meta">
    <div><div class="title" id="title">Mujic</div><div class="artist" id="artist">Ready to play</div></div>
    <button class="icon" id="fav" title="Favourite" aria-label="Favourite"></button>
  </section>
  <section class="seek"><span id="cur">0:00</span><input id="seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="Seek"><span id="dur">--:--</span></section>
  <nav class="transport" aria-label="Playback controls">
    <button class="icon" id="shuffle" title="Shuffle" aria-label="Shuffle"></button>
    <button class="icon skip" id="prev" title="Previous" aria-label="Previous track"></button>
    <button class="play" id="toggle" title="Play" aria-label="Play"></button>
    <button class="icon skip" id="next" title="Next" aria-label="Next track"></button>
    <button class="icon" id="repeat" title="Repeat" aria-label="Repeat"></button>
  </nav>
  <section class="tools">
    <div class="vol"><button class="icon" id="mute" title="Mute" aria-label="Mute"></button><input id="volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume"></div>
    <div class="tools-right">
      <button class="icon" id="lyrics" title="Lyrics" aria-label="Lyrics" aria-pressed="false"></button>
      <button class="icon" id="queue" title="Queue" aria-label="Queue" aria-pressed="false"></button>
      <button class="icon" id="open" title="Open Mujic" aria-label="Open Mujic"></button>
    </div>
  </section>
</main>`;

    const Doc = (() => {
        let win = null, doc = null, get = null, cleanup = [];
        let lastTrackKey = null, seeking = false, panel = 'none';
        let lyrics = { id: '', status: 'idle', lines: null, text: '', active: -2 };
        let queueKey = '';

        const setRange = (input, ratio) => input.style.setProperty('--p', `${Math.max(0, Math.min(1, ratio)) * 100}%`);
        const setPanel = name => {
            panel = panel === name ? 'none' : name;
            get('panel-queue').hidden = panel !== 'queue';
            get('panel-lyrics').hidden = panel !== 'lyrics';
            get('queue').classList.toggle('on', panel === 'queue'); get('queue').setAttribute('aria-pressed', String(panel === 'queue'));
            get('lyrics').classList.toggle('on', panel === 'lyrics'); get('lyrics').setAttribute('aria-pressed', String(panel === 'lyrics'));
            queueKey = ''; lyrics.active = -2;
            if (panel === 'lyrics') loadLyrics();
            sync();
        };

        const loadLyrics = async () => {
            const snap = snapshot();
            if (!snap.track || panel !== 'lyrics') return;
            if (lyrics.id === snap.id && lyrics.status !== 'idle') return renderLyrics();
            lyrics = { id: snap.id, status: 'loading', lines: null, text: '', active: -2 };
            renderLyrics();
            let data = null;
            try { data = await LyricsFetcher.getLyrics(snap.track); } catch (_) {}
            if (!win || win.closed || lyrics.id !== snap.id) return;
            if (data?.text && !data.unavailable) {
                if (data.isSynced) { lyrics.lines = data.parsed || LyricsFetcher.parseLRC(data.text); lyrics.status = lyrics.lines.length ? 'synced' : 'none'; }
                else { lyrics.text = data.text; lyrics.status = 'plain'; }
            } else lyrics.status = 'none';
            lyrics.active = -2;
            renderLyrics();
            sync();
        };
        const renderLyrics = () => {
            const box = get('panel-lyrics'); if (!box) return;
            if (lyrics.status === 'loading') { box.innerHTML = '<div class="msg">Finding lyrics…</div>'; return; }
            if (lyrics.status === 'none' || lyrics.status === 'idle') { box.innerHTML = '<div class="msg">No lyrics found for this song.</div>'; return; }
            const esc = Utils.escapeHTML;
            if (lyrics.status === 'plain') { box.innerHTML = `<div class="lyr plain">${lyrics.text.split(/\r?\n/).map(l => `<p>${esc(l) || '&nbsp;'}</p>`).join('')}</div>`; return; }
            box.innerHTML = `<div class="lyr">${lyrics.lines.map((l, i) => `<p data-i="${i}" data-t="${l.time}">${esc(l.text)}</p>`).join('')}</div>`;
        };
        const syncLyrics = snap => {
            if (panel !== 'lyrics' || lyrics.status !== 'synced' || lyrics.id !== snap.id) return;
            const index = activeLyricIndex(lyrics.lines, snap.current);
            if (index === lyrics.active) return;
            const box = get('panel-lyrics');
            box.querySelector('p.on')?.classList.remove('on');
            lyrics.active = index;
            const line = index >= 0 ? box.querySelector(`p[data-i="${index}"]`) : null;
            if (line) { line.classList.add('on'); line.scrollIntoView({ block: 'center', behavior: State.motion === 'reduced' ? 'auto' : 'smooth' }); }
        };
        const renderQueue = snap => {
            const key = `${State.queueIndex}|${State.playbackOrder.length}|${snap.id}`;
            if (panel !== 'queue' || key === queueKey) return;
            queueKey = key;
            const esc = Utils.escapeHTML;
            const rows = [];
            const order = State.playbackOrder || [];
            const from = Math.max(0, State.queueIndex);
            order.slice(from, from + 100).forEach((id, offset) => {
                const t = Player.getTrackById(id); if (!t) return;
                const index = from + offset;
                rows.push(`<button class="q-row${index === State.queueIndex ? ' now' : ''}" data-i="${index}" role="listitem"><span class="q-n">${index === State.queueIndex ? '▶' : offset}</span><span class="q-t"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></span></button>`);
            });
            get('panel-queue').innerHTML = rows.length ? `<div class="q-h">Now playing &amp; up next</div>${rows.join('')}` : '<div class="msg">The queue is empty.</div>';
        };

        const sync = () => {
            if (!win || win.closed) return;
            const snap = snapshot();
            const el = audio();
            if (snap.id !== lastTrackKey) {
                lastTrackKey = snap.id;
                get('title').textContent = snap.title; get('artist').textContent = snap.artist;
                doc.title = `${snap.title} · Mujic`;
                const src = artSource(snap.track);
                const art = get('art'), bg = get('bg');
                art.dataset.src = src;
                Art.resolve(src).then(res => {
                    if (!win || win.closed || art.dataset.src !== src) return;
                    const use = res?.url || src;
                    art.src = use; bg.style.backgroundImage = `url("${use}")`;
                });
                art.onerror = () => { art.onerror = null; art.src = window.Utils?.defaultArt || ''; };
                if (panel === 'lyrics') { lyrics.id = ''; loadLyrics(); }
            }
            const seek = get('seek');
            seek.max = String(snap.duration || 1); seek.disabled = !snap.known;
            if (!seeking) { seek.value = String(Math.min(snap.current, snap.duration || 1)); setRange(seek, snap.known ? snap.current / snap.duration : 0); get('cur').textContent = fmt(snap.current); }
            get('dur').textContent = snap.known ? `-${fmt(snap.duration - snap.current)}` : '--:--';

            const toggle = get('toggle');
            if (toggle._playing !== snap.playing) { toggle._playing = snap.playing; toggle.innerHTML = snap.playing ? ICON.pause : ICON.play; toggle.title = snap.playing ? 'Pause' : 'Play'; toggle.setAttribute('aria-label', toggle.title); get('app').classList.toggle('paused', !snap.playing); }
            const shuffle = get('shuffle'); shuffle.classList.toggle('on', Boolean(State.shuffle)); shuffle.setAttribute('aria-pressed', String(Boolean(State.shuffle)));
            const repeat = get('repeat'); repeat.classList.toggle('on', State.repeat > 0); repeat.innerHTML = State.repeat === 2 ? ICON.repeat1 : ICON.repeat;
            repeat.title = ['Repeat off', 'Repeat all', 'Repeat one'][State.repeat] || 'Repeat';
            const fav = isFavorite(snap.track); const favBtn = get('fav');
            if (favBtn._fav !== fav) { favBtn._fav = fav; favBtn.innerHTML = fav ? ICON.heart : ICON.heartOff; favBtn.classList.toggle('on', fav); favBtn.setAttribute('aria-pressed', String(fav)); }
            const volume = State.muted ? 0 : Math.max(0, Math.min(1, Number(State.volume) || 0));
            const vol = get('volume');
            if (doc.activeElement !== vol) { vol.value = String(volume); setRange(vol, volume); }
            const mute = get('mute'); if (mute._v !== (volume === 0)) { mute._v = volume === 0; mute.innerHTML = volume === 0 ? ICON.mute : ICON.vol; }
            renderQueue(snap); syncLyrics(snap);
        };

        const build = () => {
            doc.title = 'Mujic · Now Playing';
            const style = doc.createElement('style'); style.textContent = STYLE; doc.head.appendChild(style);
            doc.body.innerHTML = HTML;
            get = id => doc.getElementById(id);
            const icons = { shuffle: ICON.shuffle, prev: ICON.prev, next: ICON.next, repeat: ICON.repeat, lyrics: ICON.lyrics, queue: ICON.queue, open: ICON.open, mute: ICON.vol, toggle: ICON.play, fav: ICON.heartOff };
            Object.entries(icons).forEach(([id, svg]) => { get(id).innerHTML = svg; });
        };
        const wire = () => {
            const on = (id, type, fn) => get(id).addEventListener(type, fn);
            on('toggle', 'click', async () => { if (isPlaying()) Player.pause(); else await Player.togglePlay(); sync(); });
            on('prev', 'click', () => { Promise.resolve(Player.previous()).finally(sync); });
            on('next', 'click', () => { Promise.resolve(Player.next()).finally(sync); });
            on('shuffle', 'click', () => { Player.toggleShuffle(); sync(); });
            on('repeat', 'click', () => { Player.toggleRepeat(); sync(); });
            on('fav', 'click', () => { Player.toggleFavorite(); setTimeout(sync, 60); });
            on('seek', 'input', e => { seeking = true; get('cur').textContent = fmt(e.target.value); setRange(e.target, Number(e.target.value) / (Number(e.target.max) || 1)); });
            on('seek', 'change', e => { AudioAdapter.seek(Number(e.target.value)); seeking = false; UI.updateProgress(); sync(); });
            on('volume', 'input', e => { const v = Number(e.target.value); AudioAdapter.setVolume(v, { persist: false }); setRange(e.target, v); sync(); });
            on('volume', 'change', e => { AudioAdapter.setVolume(Number(e.target.value)); });
            on('mute', 'click', () => { AudioAdapter.toggleMute(); sync(); });
            on('lyrics', 'click', () => setPanel('lyrics'));
            on('queue', 'click', () => setPanel('queue'));
            on('open', 'click', () => { try { window.focus(); } catch (_) {} UI.openFullPlayer(); });
            on('panel-queue', 'click', e => { const row = e.target.closest('.q-row'); if (row) { Player.playQueueIndex(Number(row.dataset.i)); setTimeout(sync, 80); } });
            on('panel-lyrics', 'click', e => { const line = e.target.closest('p[data-t]'); if (line) { AudioAdapter.seek(Number(line.dataset.t) - (Number(State.lyricsTimingOffset) || 0)); sync(); } });
            doc.addEventListener('keydown', e => {
                if (e.target.matches?.('input[type=range]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                const step = Number(State.seekStep) || 10;
                if (e.code === 'Space') { if (e.target.closest?.('button')) return; e.preventDefault(); get('toggle').click(); }
                else if (e.key === 'ArrowRight') { AudioAdapter.seek(audio().currentTime + step); sync(); }
                else if (e.key === 'ArrowLeft') { AudioAdapter.seek(audio().currentTime - step); sync(); }
                else if (e.key === 'ArrowUp') { AudioAdapter.setVolume(Math.min(1, (Number(State.volume) || 0) + .05)); sync(); }
                else if (e.key === 'ArrowDown') { AudioAdapter.setVolume(Math.max(0, (Number(State.volume) || 0) - .05)); sync(); }
                else if (e.key.toLowerCase() === 'n') get('next').click();
                else if (e.key.toLowerCase() === 'p') get('prev').click();
            });
        };

        const open = async () => {
            const api = window.documentPictureInPicture;
            if (win && !win.closed) { win.close(); return; }
            if (api.window && !api.window.closed) { api.window.close(); return; }
            win = await api.requestWindow({ width: 340, height: 470, preferInitialWindowPlacement: true });
            doc = win.document;
            lastTrackKey = null; seeking = false; panel = 'none'; queueKey = ''; lyrics = { id: '', status: 'idle', lines: null, text: '', active: -2 };
            build(); wire();
            const events = ['play', 'playing', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'ended', 'emptied', 'volumechange'];
            events.forEach(type => audio().addEventListener(type, sync));
            cleanup = [() => events.forEach(type => audio().removeEventListener(type, sync))];
            win.addEventListener('pagehide', () => { cleanup.forEach(fn => fn()); cleanup = []; win = null; doc = null; }, { once: true });
            sync();
        };
        const close = () => { if (win && !win.closed) win.close(); };
        return { open, close, sync, get isOpen() { return Boolean(win && !win.closed); } };
    })();

    /* ═════════════ public API ═════════════ */
    const preferred = () => {
        const style = State.pipStyle === 'full' ? 'full' : 'clean';
        if (style === 'full' && hasDocumentPiP()) return 'full';
        if (hasVideoPiP()) return 'clean';
        return hasDocumentPiP() ? 'full' : null;
    };
    const supported = () => !isMobile() && Boolean(preferred());
    const refreshButtons = () => {
        const ok = supported();
        document.querySelectorAll('[data-action="picture-in-picture"]').forEach(button => { button.hidden = !ok; button.setAttribute('aria-hidden', String(!ok)); });
    };
    const sync = () => { if (Doc.isOpen) Doc.sync(); else if (Clean.isOpen) Clean.sync(); };
    const toggle = async () => {
        if (isMobile()) { UI.showToast('Picture-in-Picture is available in supported desktop browsers.', 'info'); return; }
        if (!State.currentTrackId) { UI.showToast('Play a song first to use Picture-in-Picture.', 'info'); return; }
        try {
            if (Doc.isOpen) { Doc.close(); return; }
            if (Clean.isOpen) { await Clean.close(); return; }
            const mode = preferred();
            if (mode === 'full') {
                try { await Doc.open(); return; }
                catch (error) { console.warn('Document PiP failed, trying video PiP.', error); if (!hasVideoPiP()) throw error; }
            }
            await Clean.open();
        } catch (error) {
            console.warn('PiP unavailable', error);
            UI.showToast('Could not open Picture-in-Picture. Use a supported desktop browser over HTTPS.', 'error');
        }
    };
    window.MujicPiP = { toggle, open: toggle, sync, refreshButtons, get isOpen() { return Doc.isOpen || Clean.isOpen; } };
    window.MujicPiPArt = Art;

    refreshButtons();
    window.addEventListener('resize', refreshButtons, { passive: true });
    // Clean mode has no event hooks of its own: the audio element drives it.
    ['play', 'pause', 'seeked', 'loadedmetadata', 'emptied'].forEach(type => AudioAdapter.audio.addEventListener(type, () => { if (Clean.isOpen) Clean.sync(); }));
})();
