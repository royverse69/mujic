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

    /* 6. Opt-in: swipe the mini-player down (small screens, full player closed) to pause, stop and dismiss it.
          Controlled by Settings → Playback → "Swipe mini-player down to stop". */
    const initMiniSwipeDismiss = () => {
        const mini = document.getElementById('mini-player');
        if (!mini) return;
        const small = window.matchMedia('(max-width: 767px)');
        const DISMISS_DISTANCE = 64, DISMISS_VELOCITY = 0.55, AXIS_LOCK = 10;
        let drag = null, blockClickUntil = 0;
        const clearInline = () => { mini.style.transition = ''; mini.style.transform = ''; mini.style.opacity = ''; };
        const settle = () => {
            mini.style.transition = 'transform .28s cubic-bezier(.22,.61,.36,1), opacity .2s ease';
            mini.style.transform = 'translateY(0)'; mini.style.opacity = '1';
            window.setTimeout(clearInline, 300);
        };
        const dismiss = () => {
            // Playing again (any control, media key or track pick) brings the mini-player back.
            AudioAdapter.audio.addEventListener('play', () => { if (State.currentTrackId) UI.showMiniPlayer(); }, { once: true });
            mini.style.transition = 'transform .24s ease-in, opacity .2s ease';
            mini.style.transform = 'translateY(160%)'; mini.style.opacity = '0';
            try { Player.pause(); AudioAdapter.seek(0); } catch (_) {}
            window.setTimeout(() => { mini.classList.remove('visible'); clearInline(); }, 250);
        };
        mini.addEventListener('pointerdown', event => {
            if (!State.swipeDismissMini || !small.matches || State.isFullPlayerOpen || event.button > 0 || !mini.classList.contains('visible')) return;
            if (event.target.closest('.mini-action,.mini-progress-bar')) return;
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, dy: 0, active: false };
        });
        mini.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.id) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.active) {
                if (Math.abs(dx) > AXIS_LOCK && Math.abs(dx) >= Math.abs(dy)) { drag = null; return; }
                if (dy > AXIS_LOCK && dy > Math.abs(dx) * 1.2) { drag.active = true; try { mini.setPointerCapture(event.pointerId); } catch (_) {} mini.style.transition = 'none'; }
                else return;
            }
            drag.dy = Math.max(0, dy);
            mini.style.transform = `translateY(${drag.dy}px)`;
            mini.style.opacity = String(Math.max(0.35, 1 - drag.dy / 180));
        });
        const finish = (event, cancelled) => {
            if (!drag || event.pointerId !== drag.id) return;
            const { active, dy, t } = drag; drag = null;
            if (!active) return;
            blockClickUntil = performance.now() + 350;
            try { mini.releasePointerCapture(event.pointerId); } catch (_) {}
            const velocity = dy / Math.max(1, event.timeStamp - t);
            if (!cancelled && (dy > DISMISS_DISTANCE || (velocity > DISMISS_VELOCITY && dy > 24))) dismiss(); else settle();
        };
        mini.addEventListener('pointerup', event => finish(event, false));
        mini.addEventListener('pointercancel', event => finish(event, true));
        // A drag must never also count as a tap that opens the full player.
        mini.addEventListener('click', event => { if (performance.now() < blockClickUntil) { event.stopPropagation(); event.preventDefault(); } }, true);
    };

    /* 7. Desktop: scroll "Title — Artist" through the browser tab title, slowly, following the current track.
          (<marquee> cannot live inside <title>, which is plain text, so the text is rotated one character at a time.) */
    const initTabTitleScroller = () => {
        const BASE_TITLE = document.title, STEP_MS = 160, GAP = '   •   ';
        const desktop = window.matchMedia('(min-width: 768px) and (hover: hover)');
        let key = '', offset = 0, timer = 0;
        const render = () => {
            const track = typeof Player !== 'undefined' ? Player.getCurrentTrack?.() : null;
            /* Nothing playing (no track, or paused): show the original Mujic title. */
            if (!track || !State.isPlaying) { if (document.title !== BASE_TITLE) document.title = BASE_TITLE; key = ''; return; }
            const label = `${track.title || 'Unknown'} — ${track.artist || 'Unknown artist'}`;
            if (label !== key) { key = label; offset = 0; }
            if (!desktop.matches || reducedMotion() || label.length < 3) { document.title = `▶ ${label} · Mujic`; return; }
            const loop = label + GAP;
            offset = (offset + 1) % loop.length;
            document.title = (loop + loop).slice(offset, offset + Math.max(loop.length, 24));
        };
        const run = () => { if (!timer) timer = window.setInterval(render, STEP_MS); render(); };
        window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', render);
        run();
    };

    /* 8. Desktop mini-player: click or drag the progress bar to seek. */
    const initMiniScrub = () => {
        const mini = document.getElementById('mini-player'), bar = mini?.querySelector('.mini-progress-bar');
        if (!bar) return;
        const desktop = window.matchMedia('(min-width: 768px)');
        const label = document.getElementById('mini-time-current');
        let active = false, ratio = 0;
        const ratioFrom = event => { const rect = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))); };
        const preview = value => {
            ratio = value;
            bar.style.setProperty('--scrub', `${value * 100}%`);
            if (label) label.textContent = Utils.formatTime(value * State.duration);
        };
        bar.addEventListener('pointerdown', event => {
            if (!desktop.matches || !(State.duration > 0) || event.button > 0) return;
            active = true;
            try { bar.setPointerCapture(event.pointerId); } catch (_) {}
            bar.classList.add('scrubbing');
            preview(ratioFrom(event));
            event.stopPropagation();
        });
        bar.addEventListener('pointermove', event => { if (active) preview(ratioFrom(event)); });
        const end = event => {
            if (!active) return;
            active = false;
            bar.classList.remove('scrubbing');
            bar.style.removeProperty('--scrub');
            try { bar.releasePointerCapture(event.pointerId); } catch (_) {}
            if (event.type === 'pointerup') AudioAdapter.seek(ratio * State.duration);
        };
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
    };

    /* 9. Desktop mini-player: inline volume slider that stays in sync with every other volume control. */
    const initMiniVolume = () => {
        const range = document.getElementById('mini-volume-range');
        if (!range) return;
        const desktop = window.matchMedia('(min-width: 768px)');
        let shown = -1;
        const paint = value => range.style.setProperty('--vol', `${value * 100}%`);
        const sync = () => {
            const raw = State.muted ? 0 : Number(State.volume);
            const value = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
            if (value === shown || document.activeElement === range) return;
            shown = value; range.value = String(value); paint(value);
        };
        range.addEventListener('input', () => { const value = Number(range.value); shown = value; paint(value); AudioAdapter.setVolume(value); });
        window.setInterval(() => { if (desktop.matches && document.visibilityState === 'visible') sync(); }, 500);
        sync();
    };

    const start = () => { enhance(); initMiniSwipeDismiss(); initTabTitleScroller(); initMiniScrub(); initMiniVolume(); new MutationObserver(scheduleEnhance).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
