# Music catalogue integration reference

## Routing architecture

The frontend uses one API origin: the Cloudflare Worker configured as `PRIMARY` in `js/backend-config.js` (`https://mujic.calverse.online`). Catalogue requests use `/api/*`; legacy compatibility endpoints for Home discovery and stream metadata use `/search`, `/trending`, `/queue/*`, and `/stream/*`. Lyrics routes use `/lyrics`, `/lyrics/get`, `/lyrics/search`, `/lyrics/ovh`, and `/lyricsplus/v2/lyrics/get`. Known Saavn/JioSaavn audio and artwork CDN URLs use `/media?url=...` through the same Worker.

The frontend has no direct catalogue API request and no secondary backend failover. To keep the app functional, the deployed Worker must forward the documented catalogue paths to its upstream and retain the allowlist and redirect validation for media URLs. The source ZIP does not contain the Worker implementation, deployment configuration, or its secrets, so live Worker routes must be checked separately.

## Catalogue paths

| Request | Purpose |
|---|---|
| `GET /api/search?query={q}` | Global catalogue search |
| `GET /api/search/songs?query={q}&page={page}&limit={limit}` | Song search and pagination |
| `GET /api/search/playlists?query={q}&page={page}&limit={limit}` | Playlist search |
| `GET /api/search/albums?query={q}&page={page}&limit={limit}` | Album search |
| `GET /api/search/artists?query={q}&page={page}&limit={limit}` | Artist search |
| `GET /api/songs/{id}` | Song details and stream choices |
| `GET /api/songs?ids={ids}` or `?link={url}` | Batch/share-link lookup |
| `GET /api/songs/{id}/suggestions?limit={n}` | Similar-track suggestions |
| `GET /api/artists/{id}` | Artist metadata, songs and albums |
| `GET /api/albums?id={id}` | Album metadata and songs |
| `GET /api/playlists?id={id}&page={page}&limit={limit}` | Public playlist metadata and songs |

The API response parser supports `data.results`, `data.songs.results`, entity result groups, quality-ranked artwork arrays, song duration, album/artist data, and stream choice metadata. Unknown or unavailable upstream fields fall back without removing existing UI features.

## Caching and search

The service worker caches JSON responses only from the Worker origin and only for known API/metadata paths. Search responses use a short fresh window and can be served stale while revalidation runs; older cached data can be returned during transient network/server failures. Song/stream metadata, recommendation results, and lyrics use bounded route-specific freshness. The cache has a fixed maximum entry count and rejects oversized/non-JSON bodies.

The page also uses bounded in-memory search, entity, related-track and stream caches. Search input debounce is 180 ms to avoid issuing a request for every keystroke pause; an explicit Enter submits immediately. Artist-detail pagination remains user-triggered and bounded, and artwork stays lazy-loaded.

## Media and playback

Known `saavncdn.com` and `jiosaavn.com` media URLs are routed through the Worker media endpoint where supported. The service worker can warm only the initial 256 KiB of the next track and preserves byte ranges for seeking. It does not silently import streaming audio into the local Offline library. Unknown-host URLs retain the prior compatibility handling where the catalogue supplies them.

## Lyrics

The app prioritizes embedded or locally saved lyrics, then Worker-backed exact/search lyric routes, an optional community lyrics fallback, and an optional LyricsPlus route. Exact matches are validated against track title and artist metadata when the provider returns that information. Cached lyric content remains available offline.

## Limitations

This repository snapshot configures the Worker origin but does not include its deployed source code. A frontend build alone cannot guarantee Worker route availability, CORS settings, upstream search availability, or upstream geo-catalogue behavior. Validate `/api/search/songs?query=Billie%20Eilish&limit=5`, `/trending`, `/queue/{song_id}`, `/lyrics/search?q=...`, and ranged `/media` requests against the deployed Worker before release.
