/* Copyright mujic@royverse69 */
/* Mini-player behaviour: seek bar, volume slider and swipe-to-dismiss.
   Buttons need no code here — they are plain <button data-action> elements handled by the single
   delegated click listener in ui-events.js, which works identically for mouse, touch and pen. */
(() => {
    'use strict';
    const mini = document.getElementById('mini-player');
    if (!mini) return;
    const desktop = window.matchMedia('(min-width: 768px)');
    const phone = window.matchMedia('(max-width: 767px)');

    /* ── seek bar (desktop/tablet) ─────────────────────────────── */
    const bar = document.getElementById('mini-progress-bar');
    const fill = document.getElementById('mini-progress');
    const timeLabel = document.getElementById('mini-time-current');
    if (bar) {
        let pointerId = null, ratio = 0;
        const ratioFrom = e => {
            const r = bar.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
        };
        const preview = value => {
            ratio = value;
            if (fill) fill.style.transform = `scaleX(${value})`;
            if (timeLabel) timeLabel.textContent = Utils.formatTime(value * State.duration);
        };
        const finish = (e, commit) => {
            if (pointerId === null || e.pointerId !== pointerId) return;
            pointerId = null;
            State.miniScrubbing = false;
            bar.classList.remove('scrubbing');
            try { bar.releasePointerCapture(e.pointerId); } catch (_) {}
            if (commit && State.duration > 0) AudioAdapter.seek(ratio * State.duration);
            UI.updateProgress();
        };
        bar.addEventListener('pointerdown', e => {
            if (!(State.duration > 0) || (e.pointerType === 'mouse' && e.button !== 0)) return;
            e.preventDefault(); e.stopPropagation();
            pointerId = e.pointerId;
            State.miniScrubbing = true;
            bar.classList.add('scrubbing');
            try { bar.setPointerCapture(e.pointerId); } catch (_) {}
            preview(ratioFrom(e));
        });
        bar.addEventListener('pointermove', e => { if (e.pointerId === pointerId) preview(ratioFrom(e)); });
        bar.addEventListener('pointerup', e => finish(e, true));
        bar.addEventListener('pointercancel', e => finish(e, false));
        bar.addEventListener('lostpointercapture', e => finish(e, false));
        bar.addEventListener('click', e => e.stopPropagation()); // a seek must never open the full player
        bar.addEventListener('keydown', e => {
            if (!(State.duration > 0)) return;
            const step = Number(State.seekStep) || 5;
            let target = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = State.currentTime + step;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = State.currentTime - step;
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = State.duration - 1;
            if (target === null) return;
            e.preventDefault(); e.stopPropagation();
            AudioAdapter.seek(target);
        });
        bar.tabIndex = 0;
    }

    /* ── volume slider (desktop/tablet) ────────────────────────── */
    const range = document.getElementById('mini-volume-range');
    if (range) {
        range.addEventListener('input', () => AudioAdapter.setVolume(Number(range.value), { persist: false }));
        range.addEventListener('change', () => AudioAdapter.setVolume(Number(range.value)));
        // Interacting with the slider must not open the full player.
        ['click', 'pointerdown'].forEach(type => range.addEventListener(type, e => e.stopPropagation()));
    }

    /* ── keyboard: Enter / Space on the title opens the full player ── */
    mini.querySelector('.mini-meta')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); UI.openFullPlayer(); }
    });

    /* ── optional: swipe the mini-player down on phones to stop playback ──
       Settings → Playback → "Swipe mini-player down to stop". */
    const DISMISS_DISTANCE = 64, DISMISS_VELOCITY = 0.55, AXIS_LOCK = 10;
    let drag = null, blockClickUntil = 0;
    const clearInline = () => { mini.style.transition = ''; mini.style.transform = ''; mini.style.opacity = ''; };
    const settle = () => {
        mini.style.transition = 'transform .28s cubic-bezier(.22,.61,.36,1), opacity .2s ease';
        mini.style.transform = 'translateY(0)'; mini.style.opacity = '1';
        setTimeout(clearInline, 300);
    };
    const dismiss = () => {
        AudioAdapter.audio.addEventListener('play', () => { if (State.currentTrackId) UI.showMiniPlayer(); }, { once: true });
        mini.style.transition = 'transform .24s ease-in, opacity .2s ease';
        mini.style.transform = 'translateY(160%)'; mini.style.opacity = '0';
        try { Player.pause(); AudioAdapter.seek(0); } catch (_) {}
        setTimeout(() => { mini.classList.remove('visible'); clearInline(); }, 250);
    };
    mini.addEventListener('pointerdown', e => {
        if (!State.swipeDismissMini || !phone.matches || State.isFullPlayerOpen || e.button > 0 || !mini.classList.contains('visible')) return;
        if (e.target.closest('.mini-action, .mini-tool, .mini-progress-bar')) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dy: 0, active: false };
    });
    mini.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.active) {
            if (Math.abs(dx) > AXIS_LOCK && Math.abs(dx) >= Math.abs(dy)) { drag = null; return; }
            if (dy > AXIS_LOCK && dy > Math.abs(dx) * 1.2) { drag.active = true; try { mini.setPointerCapture(e.pointerId); } catch (_) {} mini.style.transition = 'none'; }
            else return;
        }
        drag.dy = Math.max(0, dy);
        mini.style.transform = `translateY(${drag.dy}px)`;
        mini.style.opacity = String(Math.max(0.35, 1 - drag.dy / 180));
    });
    const endDrag = (e, cancelled) => {
        if (!drag || e.pointerId !== drag.id) return;
        const { active, dy, t } = drag; drag = null;
        if (!active) return;
        blockClickUntil = performance.now() + 350;
        try { mini.releasePointerCapture(e.pointerId); } catch (_) {}
        const velocity = dy / Math.max(1, e.timeStamp - t);
        if (!cancelled && (dy > DISMISS_DISTANCE || (velocity > DISMISS_VELOCITY && dy > 24))) dismiss(); else settle();
    };
    mini.addEventListener('pointerup', e => endDrag(e, false));
    mini.addEventListener('pointercancel', e => endDrag(e, true));
    // A drag must never also count as a tap that opens the full player.
    mini.addEventListener('click', e => { if (performance.now() < blockClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
})();
