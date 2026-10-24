/* Copyright mujic@royverse69 */
(() => {
    const onlineScripts = ['./js/online-cache.js', './js/online-lyrics.js', './js/online-recommendations.js', './js/online-downloader.js', './js/discovery-catalog-data.js', './js/online-workspace.js'];
    let onlinePromise = null;
    let onlineCssPromise = null;
    let lyricsSharePromise = null;
    const loadScript = src => new Promise((resolve, reject) => {
        const url = new URL(src, document.baseURI).href;
        const existing = [...document.scripts].find(script => script.src === url);
        if (existing?.dataset.loaded === '1') {
            resolve();
            return;
        }
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', () => reject(new Error(`Unable to load ${src}`)), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => { script.dataset.loaded = '1'; resolve(); };
        script.onerror = () => { script.remove(); reject(new Error(`Unable to load ${src}`)); };
        document.head.appendChild(script);
    });
    const loadOnlineStyles = () => {
        if (document.querySelector('link[data-mujic-online-css]'))
            return Promise.resolve();
        if (onlineCssPromise)
            return onlineCssPromise;
        onlineCssPromise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = './css/online-workspace.css';
            link.dataset.mujicOnlineCss = '1';
            link.onload = resolve;
            link.onerror = () => { link.remove(); onlineCssPromise = null; reject(new Error('Unable to load Online workspace styles')); };
            document.head.appendChild(link);
        });
        return onlineCssPromise;
    };
    const ensureOnline = () => {
        if (onlinePromise)
            return onlinePromise;
        onlinePromise = (async () => { await loadOnlineStyles(); for (const src of onlineScripts)
            await loadScript(src); return true; })().catch(error => { onlinePromise = null; throw error; });
        return onlinePromise;
    };
    const ensureLyricsShare = () => {
        if (window.LyricsShare) {
            window.LyricsShare.init?.();
            return Promise.resolve(true);
        }
        if (lyricsSharePromise) return lyricsSharePromise;
        lyricsSharePromise = loadScript('./js/lyrics-share.js').then(() => {
            window.LyricsShare?.init?.();
            return true;
        }).catch(error => {
            lyricsSharePromise = null;
            throw error;
        });
        return lyricsSharePromise;
    };
    window.MujicModules = { ensureOnline, ensureLyricsShare };
})();

