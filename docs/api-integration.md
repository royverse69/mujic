# Music catalogue integration reference

## Routing architecture (Machhar Beta v1.2)

Catalogue reads use the documented API origin from the supplied OpenAPI file, `https://saavn.sumit.co/api`, first. If the direct request errors or remains slow, the frontend races or falls back to the existing Render `/api/...` proxy at `https://gaana-suno-varna-machhar-aajayega.onrender.com`. Direct requests have short bounded timeouts; the fallback proxy adds in-process response caching for safe public catalogue metadata. Existing audio streaming continues to use the Render `/media` route where the returned media host is supported.

Lyrics fallback requests continue through the existing Render host: `/lyrics`, `/lyrics/get`, `/lyrics/search`, and `/lyricsplus/v2/lyrics/get`. The supplied catalogue OpenAPI does not define a lyrics-text endpoint, so these separate lyrics routes remain needed when the catalogue response has no lyrics text.

**Deployment required:** the frontend ZIP cannot update a live Render backend by itself. If the live backend should use the new upstream cache/timeout behavior, deploy the included `backend/app.py` changes to the existing Render service, preserving any production-only routes or secrets. Do not blindly overwrite a newer live backend with an older source snapshot.

Audio and artwork URLs returned from known `saavncdn.com` and `jiosaavn.com` hosts are rewritten to the Render `/media?url=...` route where supported. The server-side media proxy supports Range requests for seeking and validates the host after redirects. A media URL on an unrecognized host remains a compatibility fallback and is not routed through this proxy.

Mujic follows the supplied OpenAPI contract and the repository [documentation](https://github.com/sumitkolhe/jiosaavn-api). It supports global search, paginated song/album/artist/playlist search, song lookup, albums, playlists, artist details and suggestions. The OpenAPI file has no dedicated trending-chart or latest-release endpoint, so Home discovery uses search-based queries rather than claiming an official real-time chart feed. Service availability and cross-origin stream access remain controlled by external services.

## Search and discovery

| Request | Purpose | Response shape used |
|---|---|---|
| `GET /api/search?query={q}` | Global catalogue search | `data.songs.results[]`, `data.playlists.results[]`, `data.albums.results[]`, `data.artists.results[]`, `data.topQuery.results[]` |
| `GET /api/search/songs?query={q}&page={page}&limit={limit}` | Song search and pagination | `data.total`, `data.start`, `data.results[]` |
| `GET /api/search/playlists?query={q}&page={page}&limit={limit}` | Public playlist discovery | `data.total`, `data.start`, `data.results[]` |
| `GET /api/search/albums?query={q}&page={page}&limit={limit}` | Album discovery | `data.total`, `data.start`, `data.results[]` |
| `GET /api/search/artists?query={q}&page={page}&limit={limit}` | Artist discovery | `data.total`, `data.start`, `data.results[]` |

Search response collections contain result records with IDs, names/titles, artist information where applicable, and quality-ranked artwork arrays (`quality`, `url`). Song records can also include `duration`, `album`, `artists`, `downloadUrl`, `hasLyrics` and `lyricsId`.

For artist portraits, prefer the artist record's own quality-ranked `image` array. When it is empty, the provider checks matching artists in `artists.primary`, `artists.featured`, `artists.all`, and `artistMap.primary_artists` fields of artist/song records (matching the requested artist ID first, then normalized name). A failed/broken portrait uses a deterministic initials fallback rather than an unrelated generic artist icon. Artist entities do not use the track-level `artist` label as a subtitle.

## Track details and continuous playback

| Request | Purpose |
|---|---|
| `GET /api/songs/{id}` | Refresh a song record and stream choices |
| `GET /api/songs?ids={commaSeparatedIds}` or `?link={url}` | Batch/detail lookup |
| `GET /api/songs/{id}/suggestions?limit={n}` | Similar-track suggestions for the automatic queue |
| `GET /api/artists/{id}/songs?page={page}` | Further tracks for an artist collection |
| `GET /api/artists/{id}/albums?page={page}` | Albums for an artist |
| `GET /api/artists/{id}` | Artist detail, top songs/albums and metadata |
| `GET /api/albums?id={id}` | Album metadata and contained songs |
| `GET /api/playlists?id={id}&page={page}&limit={limit}` | Public playlist metadata and paginated songs |

Mujic namespaces remote track IDs so catalogue IDs cannot collide with local files. Result pages are deduplicated; a short page does not automatically mean the end if more pages may exist. The home screen fetches public playlist, song, album and artist shelves from the relevant search endpoints. Collection detail screens fetch their songs separately. The Search header also accepts a direct song ID or JioSaavn share link; artist, album and playlist links open their detail view, while song links resolve to playable song rows. The Home “Suggested for You” shelf uses the current/recent streaming track to request similar-track suggestions when available, with search/trending fallbacks.

## Queue quality, caching and mode separation

The service worker caches JSON responses from both `https://saavn.sumit.co/api/...` and the existing Render `/api/...` host. Search responses are fresh for 45 seconds and can be served stale-while-revalidating for up to 10 minutes; details, songs and other catalogue responses use their own bounded freshness rules. The in-memory search and shelf caches are also versioned/short-lived, so repeat searches are fast without locking the Home shelves to an old set of results for long periods.

Automatic recommendations use the documented suggestions endpoint first, then controlled search fallbacks. The autoplay filter compares provider IDs, ISRC when available, normalized titles, artists, variant labels and title similarity to skip exact repeats and likely remix/slowed/reverb versions already played or queued. Catalogue lists and persisted online playlists/liked songs/history are also deduplicated across differing IDs by recording identity; when a duplicate variant is found, the preferred base/highest-metadata track is kept. User-selected search results remain selectable, including alternate mixes.

The Online workspace has a short-lived stream URL cache and a small metadata/artwork cache. Full audio is not silently imported into the Offline library. Shared appearance settings remain app-wide; search history, catalogue IDs, playback history and queue snapshots are separated by workspace. Optional linking copies playlist matches only when the user enables it.

## Lyrics behavior

The supplied API contract includes `hasLyrics` and `lyricsId`, but it **does not define a lyrics endpoint or a lyrics-text field in the documented song schema**. Mujic first inspects lyrics embedded in the exact search/song-detail response, then checks the song detail response. If the service does not expose lyrics text, LRCLIB exact lookup/search and optional LyricsPlus are used as fallbacks. The app does not assume lyrics are guaranteed.

## Downloads

The source record can expose `downloadUrl` entries with quality and URL fields. The downloader chooses the highest quality record only when AAC/M4A is identified by codec/container/MIME or file URL; it does not rename MP3 to AAC. Available metadata and cover artwork are embedded where supported.

## Failure behavior

Network calls are blocked when the browser reports offline. Online views have retry/failure states, while the Offline library and playback remain available without catalogue connectivity. Service availability and cross-origin audio permissions cannot be guaranteed by this repository.


## Online performance notes (Machhar Beta v1.2)

- Search renders its first page quickly and progressively loads additional song pages when result pages are sparse. A short-lived memory cache and the existing service-worker/API cache reduce repeat waits.
- Artist detail views show at most 12 tracks initially and fetch the next page only after an explicit Load more action. Artist catalogue metadata is cached in a bounded local window.
- Artwork selection ranks the catalogue's available image variants and sends only the best-quality URL to the media proxy. Playback chooses one highest-quality audio source; AAC-only download selection independently checks all URL metadata.
- Metadata cache writes no longer launch hidden duplicate artwork `Image` requests. Track cards use native lazy loading.
- Online favorites migrate older namespaced records with missing `onlineTrackId`.


## Next-track prefetch in v12.0.38

The Online provider asks the service worker to warm the first 256 KiB of only the next queued track, and skips this on data-saver or 2G/slow-2G connections. The service worker stores it separately from the app shell and artwork caches. When playback requests byte ranges for the exact same media URL, the worker serves cached bytes that intersect the initial range and forwards later ranges to the fixed Render `/media` relay. It never downloads the entire next track in advance.
