# Music catalogue integration reference

## Routing architecture (v12.0.36)

The browser calls only the Render backend at `https://gaana-suno-varna-machhar-aajayega.onrender.com` for catalogue and lyrics API operations. Catalogue requests retain the documented `/api/...` path structure, including `/api/search/songs`, `/api/songs/{id}/suggestions`, `/api/artists/{id}/songs`, `/api/albums`, and `/api/playlists`. The Render server performs the fixed-upstream request server-side.

Lyrics fallback requests are also routed through the same Render host: `/lyrics`, `/lyrics/get`, `/lyrics/search`, and `/lyricsplus/v2/lyrics/get`. Frontend modules must not call the catalogue host or lyrics-provider hosts directly.

**Deployment required:** the current Render service must be redeployed with the routes in `backend/proxy-route-patch.py` merged into the existing Flask app. The frontend ZIP cannot change a live Render deployment by itself. Merge into the currently deployed backend rather than blindly replacing a newer backend with a source snapshot. The patch only relays to fixed upstream hosts and allowlisted catalogue paths.

Audio and artwork URLs returned from known `saavncdn.com` and `jiosaavn.com` hosts are rewritten to the Render `/media?url=...` route. The server-side media proxy supports Range requests for seeking and validates the host after redirects. A media URL on an unrecognized host remains a compatibility fallback and is not routed through this proxy.

Mujic uses the endpoint contract supplied for the music catalogue. The configured runtime host lives in `js/online-provider.js`; service availability and cross-origin stream access are controlled by the external service.

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

Automatic recommendations use the documented suggestions endpoint first, then controlled search fallbacks. The autoplay filter compares provider IDs, ISRC when available, normalized titles, artists, variant labels and title similarity to skip exact repeats and likely remix/slowed/reverb versions already played or queued. Catalogue lists and persisted online playlists/liked songs/history are also deduplicated across differing IDs by recording identity; when a duplicate variant is found, the preferred base/highest-metadata track is kept. User-selected search results remain selectable, including alternate mixes.

The Online workspace has a short-lived stream URL cache and a small metadata/artwork cache. Full audio is not silently imported into the Offline library. Shared appearance settings remain app-wide; search history, catalogue IDs, playback history and queue snapshots are separated by workspace. Optional linking copies playlist matches only when the user enables it.

## Lyrics behavior

The supplied API contract includes `hasLyrics` and `lyricsId`, but it **does not define a lyrics endpoint or a lyrics-text field in the documented song schema**. Mujic first inspects lyrics embedded in the exact search/song-detail response, then checks the song detail response. If the service does not expose lyrics text, LRCLIB exact lookup/search and optional LyricsPlus are used as fallbacks. The app does not assume lyrics are guaranteed.

## Downloads

The source record can expose `downloadUrl` entries with quality and URL fields. The downloader chooses the highest quality record only when AAC/M4A is identified by codec/container/MIME or file URL; it does not rename MP3 to AAC. Available metadata and cover artwork are embedded where supported.

## Failure behavior

Network calls are blocked when the browser reports offline. Online views have retry/failure states, while the Offline library and playback remain available without catalogue connectivity. Service availability and cross-origin audio permissions cannot be guaranteed by this repository.


## Online performance notes (v12.0.36)

- Artist profile requests ask for zero preview songs and a bounded album preview; song rows are loaded by one dedicated artist-song page.
- Artist detail views show at most 12 tracks initially and fetch the next page only after an explicit Load more action. Artist catalogue metadata is cached in a bounded local window.
- Artwork selection ranks the catalogue's available image variants and sends only the best-quality URL to the media proxy. Playback chooses one highest-quality audio source; AAC-only download selection independently checks all URL metadata.
- Metadata cache writes no longer launch hidden duplicate artwork `Image` requests. Track cards use native lazy loading.
- Online favorites migrate older namespaced records with missing `onlineTrackId`.


## Next-track prefetch in v12.0.38

The Online provider asks the service worker to warm the first 256 KiB of only the next queued track, and skips this on data-saver or 2G/slow-2G connections. The service worker stores it separately from the app shell and artwork caches. When playback requests byte ranges for the exact same media URL, the worker serves cached bytes that intersect the initial range and forwards later ranges to the fixed Render `/media` relay. It never downloads the entire next track in advance.
