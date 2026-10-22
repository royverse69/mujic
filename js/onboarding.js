/* Mujic onboarding: Home-only install banner + first-run guide. Plain script (no modules). */
const Onboarding = (() => {
    const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // Re-offer the install banner after a week.
    const GUIDE_DELAY_MS = 1200;
    const STEPS = [
        {
            icon: 'music_note', title: 'Welcome to Mujic',
            body: 'Your music, your way. Play songs stored on your device, or stream from the online catalogue. This quick tour covers the essentials and takes under a minute.',
            art: 'brand'
        },
        {
            icon: 'swap_horiz', title: 'Switch between Offline and Online',
            body: 'Use the toggle beside the “Home” title at the top of the Home screen. Offline plays your own files. Online streams songs and needs an internet connection. The bottom bar updates to match the mode you pick.',
            art: 'toggle'
        },
        {
            icon: 'download_for_offline', title: 'How Offline works',
            body: 'Tap the + button on Home to add audio files from your device. They are stored privately inside the app, so they play with no internet and are never uploaded. Build playlists, like songs and manage your queue. Installing Mujic lets the app itself open without a connection too.'
        },
        {
            icon: 'travel_explore', title: 'Streaming with Online mode',
            body: 'Switch to Online, then use Search to find any song, artist or album and tap a result to play it. Home shows Quick Picks and suggestions made for you. If your connection drops, switch back to Offline to keep listening to your own library.'
        },
        {
            icon: 'lyrics', title: 'Turn on lyrics',
            body: 'Open the full player by tapping the mini player, then tap the lyrics icon beside the playback controls. Synced lyrics follow the song as it plays. Lyrics come from online providers, so connect to the internet the first time a song loads. Style, size and position live in Settings → Lyrics.'
        },
        {
            icon: 'tune', title: 'Make it yours in Settings',
            body: 'Open the Settings tab to personalise Mujic:',
            list: [
                ['palette', 'UI & Customization', 'themes, accent colours, corners, motion'],
                ['graphic_eq', 'Player & Audio', 'seek-bar waveform, equalizer, effects, shortcuts'],
                ['lyrics', 'Lyrics', 'style, size, timing and share cards'],
                ['library_music', 'Library & Listening', 'stats, backups, stored files'],
                ['apps', 'App & About', 'install the app, updates, this guide']
            ]
        },
        {
            icon: 'tips_and_updates', title: 'Handy extras',
            body: 'A few things worth knowing:',
            list: [
                ['ios_share', 'Share lyric cards', 'enable in Settings → Lyrics, then use the player’s More options'],
                ['picture_in_picture_alt', 'Picture-in-Picture', 'keep controls floating while you use other apps (where supported)'],
                ['install_mobile', 'Install Mujic', 'add it to your home screen for a full-screen app experience']
            ]
        }
    ];

    let guideEl = null, index = 0, lastFocus = null, touchX = null, started = false;

    const isStandalone = () => !!(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const isIOS = () => { try { return Boolean(Utils.isIOS()); } catch (_) { return false; } };
    const persist = () => { try { StorageAdapter.saveSettings(); } catch (_) {} };
    const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    /* ---------------------------------------------------------------- Install banner */
    const bannerMarkup = () => `
        <img class="install-banner-icon" src="./icons/icon-192.png" alt="" width="40" height="40" decoding="async">
        <div class="install-banner-copy"><strong>Install Mujic</strong><span>${isIOS() ? 'Add it to your Home Screen for a full-screen app.' : 'Get a faster, full-screen app on your device.'}</span></div>
        <button type="button" class="install-banner-btn" data-ob="install">${isIOS() ? 'How' : 'Install'}</button>
        <button type="button" class="install-banner-close" data-ob="dismiss-install" aria-label="Dismiss install suggestion" title="Dismiss"><span class="material-symbols-rounded">close</span></button>`;

    const ensureBanners = () => {
        // Banners live inside the two Home views only, so they never appear on other screens.
        const homes = [document.querySelector('#view-home .home-header'), document.querySelector('#view-online-home .home-header')].filter(Boolean);
        for (const header of homes) {
            if (header.parentElement.querySelector(':scope > .install-banner')) continue;
            const banner = document.createElement('div');
            banner.className = 'install-banner'; banner.hidden = true;
            banner.setAttribute('role', 'region'); banner.setAttribute('aria-label', 'Install Mujic');
            banner.innerHTML = bannerMarkup();
            header.after(banner);
        }
    };

    const shouldShowBanner = () => {
        if (isStandalone() || guideEl) return false;
        if (!(State.deferredInstallPrompt || isIOS())) return false; // Only offer when installation is actually possible.
        const dismissedAt = Number(State.installBannerDismissedAt) || 0;
        return !dismissedAt || Date.now() - dismissedAt > DISMISS_MS;
    };

    const refreshBanner = () => {
        ensureBanners();
        const show = shouldShowBanner();
        document.querySelectorAll('.install-banner').forEach(el => { el.hidden = !show; });
    };

    /* ---------------------------------------------------------------- First-run guide */
    const artMarkup = type => {
        if (type === 'brand') return '<div class="ob-art ob-art-brand"><img src="./icons/icon-192.png" alt="" width="84" height="84"></div>';
        if (type === 'toggle') return '<div class="ob-art ob-art-toggle" aria-hidden="true"><span class="ob-pill">Offline</span><span class="ob-switch"><span></span></span><span class="ob-pill is-on">Online</span></div>';
        return '';
    };

    const stepMarkup = step => `
        <div class="ob-icon"><span class="material-symbols-rounded" aria-hidden="true">${step.icon}</span></div>
        ${artMarkup(step.art)}
        <h2 class="ob-title" id="ob-title">${esc(step.title)}</h2>
        <p class="ob-body">${esc(step.body)}</p>
        ${step.list ? `<ul class="ob-list">${step.list.map(([icon, name, detail]) => `<li><span class="material-symbols-rounded" aria-hidden="true">${icon}</span><span><strong>${esc(name)}</strong><small>${esc(detail)}</small></span></li>`).join('')}</ul>` : ''}`;

    const renderGuide = () => {
        if (!guideEl) return;
        const step = STEPS[index], last = index === STEPS.length - 1;
        guideEl.querySelector('.ob-stage').innerHTML = stepMarkup(step);
        guideEl.querySelector('.ob-dots').innerHTML = STEPS.map((_, i) => `<span class="ob-dot${i === index ? ' active' : ''}"></span>`).join('');
        guideEl.querySelector('[data-ob="back"]').hidden = index === 0;
        guideEl.querySelector('[data-ob="skip"]').hidden = last;
        const next = guideEl.querySelector('[data-ob="next"]');
        next.textContent = last ? 'Get started' : (index === 0 ? 'Show me around' : 'Next');
        guideEl.querySelector('.ob-count').textContent = `${index + 1} / ${STEPS.length}`;
        guideEl.querySelector('.ob-stage').scrollTop = 0;
    };

    const onGuideKey = event => {
        if (!guideEl) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
        else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
        else if (event.key === 'Tab') {
            const focusable = [...guideEl.querySelectorAll('button:not([hidden])')];
            if (!focusable.length) return;
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    };

    const go = step => {
        const target = index + step;
        if (target >= STEPS.length) { close(); return; }
        if (target < 0) return;
        index = target; renderGuide();
    };

    const open = (startAt = 0) => {
        if (guideEl) return;
        lastFocus = document.activeElement;
        index = Math.max(0, Math.min(STEPS.length - 1, Number(startAt) || 0));
        guideEl = document.createElement('div');
        guideEl.className = 'ob-overlay';
        guideEl.setAttribute('role', 'dialog'); guideEl.setAttribute('aria-modal', 'true'); guideEl.setAttribute('aria-labelledby', 'ob-title');
        guideEl.innerHTML = `
            <div class="ob-card">
                <div class="ob-top"><span class="ob-count"></span><button type="button" class="ob-skip" data-ob="skip">Skip</button></div>
                <div class="ob-stage" aria-live="polite"></div>
                <div class="ob-dots" aria-hidden="true"></div>
                <div class="ob-actions"><button type="button" class="ob-btn" data-ob="back">Back</button><button type="button" class="ob-btn ob-btn-primary" data-ob="next">Next</button></div>
            </div>`;
        document.body.appendChild(guideEl);
        renderGuide();
        document.addEventListener('keydown', onGuideKey, true);
        guideEl.addEventListener('touchstart', e => { touchX = e.touches[0]?.clientX ?? null; }, { passive: true });
        guideEl.addEventListener('touchend', e => {
            if (touchX === null) return;
            const delta = (e.changedTouches[0]?.clientX ?? touchX) - touchX; touchX = null;
            if (Math.abs(delta) > 56) go(delta < 0 ? 1 : -1);
        }, { passive: true });
        refreshBanner(); // Hide the install suggestion while the guide is open.
        requestAnimationFrame(() => { guideEl?.classList.add('visible'); guideEl?.querySelector('[data-ob="next"]')?.focus({ preventScroll: true }); });
    };

    function close() {
        if (!guideEl) return;
        const el = guideEl; guideEl = null;
        document.removeEventListener('keydown', onGuideKey, true);
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 260);
        if (!State.onboardingSeen) { State.onboardingSeen = true; persist(); }
        try { lastFocus?.focus?.({ preventScroll: true }); } catch (_) {}
        refreshBanner();
    }

    /* ---------------------------------------------------------------- Wiring */
    const onClick = async event => {
        const el = event.target.closest?.('[data-ob]'); if (!el) return;
        const action = el.dataset.ob;
        if (action === 'next') go(1);
        else if (action === 'back') go(-1);
        else if (action === 'skip') close();
        else if (action === 'open-guide') open(0);
        else if (action === 'dismiss-install') {
            State.installBannerDismissedAt = Date.now(); persist(); refreshBanner();
        } else if (action === 'install') {
            try { await UI.installPWA(); } catch (error) { console.warn('Install request failed', error); }
            refreshBanner();
        }
    };

    const init = () => {
        if (init.done) return; init.done = true;
        ensureBanners();
        document.addEventListener('click', onClick);
        // app.js stores the deferred prompt in its own listener; refresh once that has run.
        window.addEventListener('beforeinstallprompt', () => setTimeout(refreshBanner, 60));
        window.addEventListener('appinstalled', () => { State.deferredInstallPrompt = null; refreshBanner(); });
        window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', refreshBanner);
        refreshBanner();
    };

    // Called once after Mujic has loaded the saved settings and rendered Home.
    const start = ({ suppressGuide = false } = {}) => {
        if (started) return; started = true;
        init();
        if (!State.onboardingSeen && !suppressGuide) setTimeout(() => { if (!State.onboardingSeen) open(0); }, GUIDE_DELAY_MS);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();

    return { start, open, close, refreshBanner };
})();
window.Onboarding = Onboarding;
