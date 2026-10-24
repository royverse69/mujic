# Mujic v13.0.21 — Cloudflare-only routing and faster search

Mujic is an offline-first local music player with an optional online streaming workspace. The local library, playlists, playback controls, lyrics display, sharing, Picture-in-Picture, settings, and offline playback remain part of the app.

## API routing

All catalogue search, detail, recommendation, stream-metadata, lyrics-proxy, and supported media-proxy requests use the Cloudflare Worker origin configured in `js/backend-config.js` (`https://mujic.calverse.online`). The frontend no longer calls a direct catalogue API host or uses a second backend origin as fallback. Ensure the deployed Worker exposes the existing routes used by this build: `/api/*`, `/search`, `/trending`, `/queue/*`, `/stream/*`, `/lyrics*`, `/lyricsplus/*`, and `/media?url=...`.

Supported catalogue CDN media URLs are restricted to known Saavn/JioSaavn hosts by the service-worker media route. Audio range requests are preserved for seeking; the worker does not download full tracks when warming a queue item.

## Performance and reliability

- Search calls are debounced and share the existing in-memory result cache; completed search, entity, stream, recommendation, and lyrics data is reused when valid.
- The service worker caches bounded JSON responses from the Worker with short search freshness, stale-while-revalidate behavior, and stale cache fallback during transient failures.
- Artwork remains lazy-loaded and cached within explicit entry/size limits; next-track prefetch remains capped to the first 256 KiB and is skipped on data saver/slow connections.
- Release notes are bundled with `js/ui-settings.js`; there is no separate changelog asset to fetch.

## Development

Run the app with a local static server (`npm start`) and execute the regression suite with `npm run check`. Live endpoint behavior still depends on the deployed Cloudflare Worker and its upstream availability/CORS headers; this ZIP does not include the deployed Worker source or credentials.
