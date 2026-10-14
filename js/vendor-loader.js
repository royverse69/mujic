/* Optional metadata parser loader: no network requests until the user imports a file. */
(function () {
  'use strict';
  const urls = [
    'https://cdn.jsdelivr.net/npm/music-metadata-browser@2.5.10/dist/index.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
  ];
  let loading = null;
  const loadScript = (url, timeoutMs = 3500) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (err) => {
      if (settled) return; settled = true; clearTimeout(timer);
      script.onload = null; script.onerror = null;
      if (err) { script.remove(); reject(err); } else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Metadata library load timed out')), timeoutMs);
    script.src = url; script.async = true; script.onload = () => finish(); script.onerror = () => finish(new Error('Metadata library failed to load'));
    document.head.appendChild(script);
  });
  window.MujicVendors = {
    ensure: () => {
      if (window.musicMetadata || window.jsmediatags) return Promise.resolve(true);
      if (!loading) loading = (async () => {
        for (const url of urls) {
          if (window.musicMetadata || window.jsmediatags) break;
          try { await loadScript(url); } catch (e) { /* try next parser */ }
        }
        return !!(window.musicMetadata || window.jsmediatags);
      })();
      return loading;
    }
  };
})();
