/* Copyright mujic@royverse69 */
/* Native-app behaviour layer: keyboard/screen-reader access for custom controls, touch feedback,
   gesture hygiene for installed (standalone) mode and resilience when the app returns from the background. */
(() => {
    'use strict';
    const coarse = () => window.matchMedia?.('(pointer: coarse)').matches;
    const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /* 1. Anything clickable through data-action but built from a <div>/<span> becomes a real "button" for keyboards and
          screen readers (focusable, announced, Enter/Space activates). Re-applied as the UI re-renders lists. */
    const SKIP = /overlay|backdrop|scrim|sheet-handle|swipe/i;
    const NATIVE = 'button,a[href],input,select,textarea,summary,[tabindex],[role="button"],[role="group"],[role="slider"],[role="tab"],[role="menuitem"],[role="switch"],[role="checkbox"]';
    let queued = false;
    const enhance = (root = document) => {
        root.querySelectorAll?.('[data-action]').forEach(el => {
            if (el.matches(NATIVE) || el.closest('[aria-hidden="true"]') || SKIP.test(el.className || '') || el.id === 'mini-player') return;
            if (el.hidden || el.getAttribute('disabled') !== null) return;
            el.setAttribute('role', 'button'); el.tabIndex = 0;
            if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', (el.dataset.action || 'action').replace(/-/g, ' '));
        });
    };
    const scheduleEnhance = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; enhance(); }); };
    document.addEventListener('keydown', event => {
        const el = event.target;
        if (!(el instanceof HTMLElement) || el !== event.currentTarget && !el.matches('[role="button"]:not(button)')) return;
        if (!el.matches('[role="button"]:not(button):not(a)') || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault(); el.click();
    });

    /* 2. Light haptic tick on primary controls (Android; silently ignored elsewhere). Off for reduced-motion users. */
    const HAPTIC = '.btn-play-pause,.mini-action,.nav-item,#view-player-controls button,.player-controls button,.icon-btn[data-action^="toggle"],.icon-btn[data-action$="track"]';
    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || reducedMotion() || window.State?.haptics === false || !navigator.vibrate) return;
        if (event.target.closest?.(HAPTIC)) { try { navigator.vibrate(6); } catch (_) {} }
    }, { passive: true });

    /* 3. Gesture hygiene so the installed app doesn't feel like a web page: no long-press menu on artwork/controls,
          no accidental pinch-zoom of the UI chrome. Text inputs and lyrics stay fully selectable. */
    document.addEventListener('contextmenu', event => {
        if (!coarse() && !standalone()) return;
        if (event.target.closest?.('input,textarea,[contenteditable],.selectable,.lyrics-line')) return;
        if (event.target.closest?.('img,canvas,button,.nav-item,.icon-btn,.btn-play-pause,#mini-player,.player-art,#player-art-container')) event.preventDefault();
    });
    if (standalone()) {
        ['gesturestart', 'gesturechange'].forEach(type => document.addEventListener(type, e => e.preventDefault(), { passive: false }));
    }

    /* 4. Coming back from the background: browsers suspend the AudioContext (and iOS may kill it). Resume it so
          playback doesn't come back silent, and persist the position on pagehide as iOS skips visibilitychange. */
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        try {
            const ctx = window.AudioAdapter?.ctx;
            if (ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted') && window.State?.isPlaying) ctx.resume().catch(() => {});
        } catch (_) {}
    });
    window.addEventListener('pagehide', () => {
        try {
            const S = window.State;
            if (S?.resumePlayback && S.currentTrackId) { S.resumePosition = S.currentTime; S.lastPositionSave = Date.now(); window.StorageAdapter?.saveSettings?.(); }
        } catch (_) {}
    });

    /* 5. Tell CSS about the input type and install mode so touch-only rules can stay in CSS. */
    const syncModes = () => {
        document.documentElement.classList.toggle('is-touch', !!coarse());
        document.documentElement.classList.toggle('is-standalone', !!standalone());
    };
    window.matchMedia?.('(pointer: coarse)').addEventListener?.('change', syncModes);
    syncModes();

    const start = () => { enhance(); new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
