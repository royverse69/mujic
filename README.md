# Mujic

Free, installable music player: play your own library offline or stream songs, with synced lyrics, a 10-band equalizer, queue, playlists, sleep timer and Picture-in-Picture. Static PWA — no build step.

**Live:** https://royverse69.github.io/mujic/

## Run locally

```bash
npm start          # python3 -m http.server 3000  →  http://localhost:3000
npm run check      # syntax, missing-file, asset-size, manifest and SEO checks (no dependencies)
```

Run `npm run check` before every deploy. It fails if a script has a syntax error, `index.html` or `sw.js` points at a missing file, a script isn't precached, or an oversized asset sneaks in.

## Deploy (GitHub Pages)

Push the repository contents to the `main` branch of a Pages-enabled repo. Everything is relative-pathed, so it works from `/mujic/` or any other sub-path. When you change JS/CSS, bump `CACHE_NAME` in `sw.js` and `VERSION`.

Streaming/lyrics requests go through the Cloudflare Worker in `worker/` (see `docs/api-integration.md`).

## Layout

| Path | Purpose |
|---|---|
| `index.html` | App shell, SEO tags, structured data |
| `css/app.css`, `css/settings.css`, `css/native-ux.css`, `css/online-workspace.css` | Styles |
| `css/mini-player.css` | The only place mini-player styles live |
| `js/core.js`, `storage.js`, `player.js` | State, IndexedDB persistence, audio engine + Media Session |
| `js/ui*.js`, `library.js`, `lyrics.js`, `online-*.js` | Interface, library, lyrics, streaming |
| `js/pip.js` | Picture-in-Picture (clean video mode + full Document PiP mode) |
| `js/mini-player.js` | Mini-player seek bar, volume, swipe-to-dismiss |
| `sw.js` | Offline cache (app code is network-first so a deploy never mixes versions) |
| `sitemap.xml`, `robots.txt`, `404.html` | SEO / hosting |

## Picture-in-Picture

Settings → Playback → *Picture-in-Picture style*:

- **Clean** (default): browser video PiP. No address/site bar. Previous / play / next come from the OS media controls.
- **Full controls**: Document PiP with queue, lyrics, volume, shuffle, repeat, favourite. Chrome always prints the site name in this window's title bar; web pages cannot hide it.

## Licence

MIT — see `LICENSE`. Security policy: `SECURITY.md`.
