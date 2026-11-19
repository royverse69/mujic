/* Copyright mujic@royverse69 */
/* Native-app behaviour layer: keyboard/screen-reader access for custom controls, touch feedback,
   gesture hygiene for installed (standalone) mode, and the scrolling tab title. */
(() => {
    'use strict';
    const mq = query => window.matchMedia?.(query);
    const coarse = () => mq('(pointer: coarse)')?.matches;
    const standalone = () => mq('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    const reducedMotion = () => mq('(prefers-reduced-motion: reduce)')?.matches;

    /* 1. Anything clickable through data-action but built from a <div>/<span> becomes a real "button" for keyboards
          and screen readers. Only newly inserted nodes are inspected, so cost is proportional to what changed. */
    const SKIP = /overlay|backdrop|scrim|sheet-handle|swipe/i;
    const NATIVE = 'button,a[href],input,select,textarea,summary,[tabindex],[role="button"],[role="group"],[role="slider"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"]';
    const enhanceEl = el => {
        if (el.matches(NATIVE) || el.closest('[aria-hidden="true"]') || SKIP.test(el.className || '') || el.id === 'mini-player') return;
        if (el.hidden || el.getAttribute('disabled') !== null) return;
        el.setAttribute('role', 'button'); el.tabIndex = 0;
        if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', (el.dataset.action || 'action').replace(/-/g, ' '));
    };
    const enhance = node => {
        if (!node || node.nodeType !== 1) return;
        if (node.matches('[data-action]')) enhanceEl(node);
        node.querySelectorAll('[data-action]').forEach(enhanceEl);
    };
    let pending = [], scheduled = false;
    const flush = () => { scheduled = false; const nodes = pending; pending = []; nodes.forEach(enhance); };
    const observe = () => {
        enhance(document.body);
        new MutationObserver(records => {
            for (const record of records) record.addedNodes.forEach(node => { if (node.nodeType === 1) pending.push(node); });
            if (pending.length && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
        }).observe(document.body, { childList: true, subtree: true });
    };
    document.addEventListener('keydown', event => {
        const el = event.target;
        if (!(el instanceof HTMLElement) || !el.matches('[role="button"]:not(button):not(a)')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); el.click();
    });

    /* 2. Light haptic tick on primary controls (Android; ignored elsewhere). Off for reduced-motion users. */
    const HAPTIC = '.btn-play-pause,.mini-action,.nav-item,.player-controls button,.icon-btn[data-action^="toggle"],.icon-btn[data-action$="track"]';
    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || reducedMotion() || window.State?.haptics === false || !navigator.vibrate) return;
        if (event.target.closest?.(HAPTIC)) { try { navigator.vibrate(6); } catch (_) {} }
    }, { passive: true });

    /* 3. Gesture hygiene so the installed app doesn't feel like a web page. Text inputs and lyrics stay selectable. */
    document.addEventListener('contextmenu', event => {
        if (!coarse() && !standalone()) return;
        if (event.target.closest?.('input,textarea,[contenteditable],.selectable,.lyrics-line')) return;
        if (event.target.closest?.('img,canvas,button,.nav-item,.icon-btn,.btn-play-pause,#mini-player,.player-art,#player-art-container')) event.preventDefault();
    });
    if (standalone()) ['gesturestart', 'gesturechange'].forEach(type => document.addEventListener(type, e => e.preventDefault(), { passive: false }));

    /* 4. Tell CSS about the input type and install mode so touch-only rules can stay in CSS. */
    const syncModes = () => {
        document.documentElement.classList.toggle('is-touch', !!coarse());
        document.documentElement.classList.toggle('is-standalone', !!standalone());
    };
    mq('(pointer: coarse)')?.addEventListener?.('change', syncModes);
    syncModes();

    /* 5. Desktop: scroll "Title — Artist" through the browser tab title while a song plays.
          The timer exists only while audio is playing, so an idle or paused app does no work. */
    const initTabTitleScroller = () => {
        const BASE_TITLE = document.title, STEP_MS = 200, GAP = '   •   ';
        const desktop = mq('(min-width: 768px) and (hover: hover)');
        const audio = window.AudioAdapter?.audio;
        let key = '', offset = 0, timer = 0;
        const label = () => {
            const track = Player.getCurrentTrack?.();
            return track ? `${track.title || 'Unknown'} — ${track.artist || 'Unknown artist'}` : '';
        };
        const render = () => {
            const text = label();
            if (!text || !State.isPlaying) { stop(); return; }
            if (text !== key) { key = text; offset = 0; }
            if (!desktop?.matches || reducedMotion() || text.length < 3) { document.title = `▶ ${text} · Mujic`; return; }
            const loop = text + GAP;
            offset = (offset + 1) % loop.length;
            document.title = (loop + loop).slice(offset, offset + Math.max(loop.length, 24));
        };
        function stop() { clearInterval(timer); timer = 0; key = ''; if (document.title !== BASE_TITLE) document.title = BASE_TITLE; }
        const start = () => { if (!timer) { timer = setInterval(render, STEP_MS); } render(); };
        audio?.addEventListener('play', start);
        audio?.addEventListener('pause', stop);
        audio?.addEventListener('emptied', stop);
        if (audio && !audio.paused) start();
    };

    const boot = () => { observe(); initTabTitleScroller(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
