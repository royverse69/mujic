# Mujic v12.0.36 — Online Performance and Artist Explorer

- The Online catalogue provider now sends documented music API requests through `https://gaana-suno-varna-machhar-aajayega.onrender.com/api/...`.
- LRCLIB exact/search and LyricsPlus fallback requests go through the same Render backend. Known Saavn/JioSaavn audio and artwork CDN requests are also proxied through `/media?url=...` with byte-range support. Frontend music/lyrics modules no longer call those upstream API hosts directly.
- Added fixed-origin, allowlisted Flask catalogue, lyrics and media proxy routes plus a merge-safe patch under `backend/proxy-route-patch.py`. **The live Render backend must be updated and redeployed separately** before the new `/api/*`, `/lyrics/search`, `/lyrics/get`, and `/lyricsplus/v2/lyrics/get` routes work. Do not overwrite a newer live backend wholesale; merge the route patch.
- The Offline workspace and its UI are unchanged; the Online Home and artist loading behavior are improved. The frontend no longer calls the catalogue or lyrics API hosts directly. Known Saavn/JioSaavn media host requests also pass through Render; media on an unrecognized host remains a compatibility fallback.

# Mujic v12.0.28

## v12.0.28 — Artist profiles, suggestions and playlist deduplication

- Home artist discovery now queries exact artist names, rejects generic collection results, and opens each portrait card directly to its artist page.
- Artist profile images resolve through the documented artist detail and song artist-map fields; unavailable portraits fall back to initials instead of generic camera/microphone icons.
- Artist catalogue retries recalculate the real response page size/total and keep failed page 0 retryable instead of treating a short preview as the full catalogue.
- Online playlist insertion, playlist rendering/playback, liked songs, recent history and autoplay suggestions filter equivalent recordings even when catalogue IDs differ. Automatic suggestions also exclude versions of tracks already queued; manual search selection remains available.
- Reduced excess Offline Home top spacing, moved the mode toggle beside the Home heading, and repaired Library-sharing/cache descriptions in Settings without replacing the Offline layout.
- PWA cache name and regression tests updated for this release.

## v12.0.27 — Artist catalogue and workspace polish

- Fixed artist image parsing for empty image arrays and protocol-relative CDN artwork URLs.
- Corrected artist song/album page-size inference to use actual returned rows when the API omits page size.
- Added failed-page tracking and retry pagination so incomplete artist catalogues are not cached as complete.
- Added direct song-ID/share-link lookup and artist/album/playlist link routing from Search.
- Moved the swipeable artist rail earlier on Home, aligned the mode switch beside the Home title, fixed active navigation in detail views, and added the muted Mujic footer wordmark.
- Polished library-sharing settings and removed stale streaming labels from visible UI copy.

Mujic is an offline-first music player with a clean local-library experience and an optional streaming workspace. Offline playback remains the default. Both workspaces share the same player shell and appearance settings, while catalogue search, online listening history, queue snapshots and streaming playlists remain separate from local files.

## v12.0.26 — Workspace polish and catalogue pagination

- Replaced separate Online History and Queue navigation entries with tabs inside the Online Library; Offline navigation remains unchanged.
- Removed repeated per-row mode badges, tightened the Online top spacing, and kept the compact mode switch beside the Home actions.
- Added clickable, swipeable circular artist cards and artist detail views that fetch paginated songs and albums from the catalogue endpoints.
- Fixed page metadata for short search responses so the Home shelves and initial search can continue past APIs that return only a few results per page.
- Song, album, artist and playlist detail helpers accept catalogue IDs; album/artist/playlist helpers and song lookup also support direct catalogue share links.
- The artist Play action waits for all available artist-song pages before starting the queue, with normalized duplicate removal.
- Online Favorites remain separate from local Favorites, while user appearance settings continue to come from the shared settings model.
- Added regression coverage for the merged Library navigation, capped page fills, and catalogue helper routes.

## Release highlights

- Minimal horizontal music shelves for songs, public playlists, albums and artists.
- Separate catalogue search with Songs, Playlists, Albums and Artists filters.
- Multi-page search fill (up to 24 results on the first pass) with a Load More action for additional results.
- Public playlist, album and artist detail screens that fetch their contained tracks from documented endpoints.
- Continuous automatic recommendations using related-track suggestions and normalized title/artist/version checks.
- Duplicate/remix protection for autoplay, without hiding alternate versions from manual search results.
- Short-lived stream URL cache, small sanitized metadata cache and artwork warm-up.
- Lyrics source order: lyrics text embedded in the exact catalogue response/song-details response first, then LRCLIB, then optional LyricsPlus. The supplied API contract does not define a dedicated lyrics-text endpoint.
- Highest eligible AAC/M4A download selection with available metadata and embedded artwork; MP3 is never renamed to AAC.
- Compact mode switch beside the add action; red denotes the streaming workspace and a small amber dot marks its beta state.
- Optional playlist linking. Online tracks are only copied into a local playlist when matching audio files actually exist in the local library.
- Separate online-specific CSS/JS modules; the Offline stylesheet remains unmodified by this release.

## Architecture

| File | Responsibility |
|---|---|
| `js/core.js`, `js/storage.js` | Shared app state, local IndexedDB storage, and settings |
| `js/player.js` | Shared audio engine, queue, transport, and online stream playback |
| `js/online-provider.js` | Catalogue requests, search pagination, collection details, stream resolution, and connectivity |
| `js/online-cache.js` | Sanitized metadata cache and artwork warm-up |
| `js/online-workspace.js` | Streaming home shelves, search, search history, playlists, queue snapshots, history and collection navigation |
| `js/online-recommendations.js` | Recommendation ranking, queue priming and repeat/version avoidance |
| `js/online-downloader.js` | AAC/M4A source validation, download and metadata/artwork tagging |
| `js/online-lyrics.js`, `js/lyrics.js` | Embedded/detail lyrics first, then controlled fallback lookup |
| `css/app.css` | Existing application styling, including Offline workspace |
| `css/online-workspace.css` | Streaming-only responsive layout and component styling |
| `sw.js` | Offline app-shell cache, including the streaming stylesheet and JavaScript modules |
| `docs/api-integration.md` | Endpoint contract and implementation notes for catalogue integration |

## Using the two workspaces

- **Offline** searches and plays audio already stored in the local library. Its library, queues, playlists and history are not overwritten by catalogue search.
- **Streaming** uses its own search, discovery, listening history, saved playlists and queue snapshot. It requires network access and remains optional.
- Switching workspaces restores each queue snapshot and prevents catalogue IDs from being treated as local audio files.
- Playlist linking is off by default. Once enabled in Settings, Mujic can match an Offline playlist against catalogue results or create an Offline playlist from items that already have matching local audio.
- The shared appearance settings apply across the app; no separate theme choice is required for each workspace.

## Development

Serve the project over HTTP rather than opening `index.html` with `file://`; this allows the web manifest and service worker to work.

```bash
npm run start
```

Then open `http://localhost:3000`.

Run project checks with:

```bash
npm run check
```

The checks cover JavaScript syntax, action dispatch, saved settings, queue behavior, recommendation filtering, provider response parsing, page fill for short API pages, and separation of the two workspaces.

## Availability and limitations

Catalogue search, remote streams, public playlist contents and external lyrics fallbacks depend on third-party availability and valid cross-origin access. A metadata or stream URL cache improves repeat use but does not make every remote track permanently available offline. The service-worker caches the application shell only. Downloading audio should be limited to material the user is permitted to save and use.

Mujic is provided as-is. It is not affiliated with a streaming service or record label.


## v12.0.31 — Foreign Artist Song Retrieval Fixes

- Added a name-based song-search fallback when the dedicated `/api/artists/{id}/songs` endpoint returns an empty collection for an international artist whose profile metadata is available.
- Fallback results must match the artist's exact ID or normalized name, preventing unrelated query results from appearing in an artist's Songs section.
- Empty artist pages remain retryable rather than being treated as successfully complete.
- Improved artist labels by reading `artistMap.primary_artists` metadata when standard artist arrays are empty.
- Bumped the service-worker cache and application version.

## v12.0.30 — Seamless Home, Artist Discovery and Search Queue Fixes

- Kept the Online Home heading, compact mode switch and Home action buttons on the same shared responsive geometry as Offline Home; the Offline layout itself is unchanged.
- Added a Most Played Artists Home shelf alongside personalized, recently played and A–Z artist discovery. Artist stats rank artists by actual plays and recency.
- Rebuilt artist-query filtering to reject explicit song, album, playlist, video and station entities returned by mixed API responses. The directory continues to use the documented artist search/profile/song endpoints and portrait fallbacks.
- Fixed search selection so a tap starts the selected song alone; Up Next uses the documented per-song similar-track endpoint instead of loosely related word matches or broad trending filler.
- Tightened multi-word search relevance, so a query such as “Happy Birthday” does not automatically include “Happy Ending” or “Birthday Song” unless the result genuinely matches the query terms.
- Moved sharing and streaming-cache controls into Library & Listening settings and added a new PWA cache version so installed copies fetch the release.

## v12.0.29 — Artist Explorer and Search/Queue Reliability

- Aligned the online Home header with the offline Home header using the same title, mode switch, action-button markup and responsive geometry.
- Added an API-backed Artists explorer with a large circular portrait mosaic, an artist directory, 40+ targeted artist queries, artwork recovery, and For You / Recently Played / Most Played / A–Z sorting. Actual catalogue results depend on the upstream API.
- Added Artists for You and Recently Played Artists shelves to Home; artist statistics track repeated plays separately from de-duplicated listening history.
- Fixed online search-row playback so tapping a result queues only that song. Automatic Up Next suggestions now prioritize the documented `/api/songs/{id}/suggestions` endpoint and fall back only to related tracks from the same primary artist.
- Tightened mixed-entity parsing and multi-token search relevance, preventing an artist/album entity from being treated as a playable song and reducing unrelated matches for queries such as “Happy Birthday”.
- Moved playlist-sharing and streaming-cache controls into the existing Library & Listening settings group.
- Bumped the service-worker cache namespace to ensure installed PWAs fetch the new code.


## v12.0.37 — Online Home polish
- Reduced Home to one artist scroller while keeping the full artist directory available.
- Added a Liked Songs tile beside custom Online playlists on Home.
- Matched Online mobile navigation active highlight to the Offline navigation treatment.
- Kept artwork images lazy-loaded and switched remote audio to metadata-first native streaming to avoid eager buffering; browser range requests continue to stream audio progressively.
- Bumped service-worker cache version. Offline UI and local playback behavior are unchanged.


## v12.0.41 Online Home and next-track media cache

- Your Playlists now appears first on Online Home, and the final large muted Mujic wordmark is explicitly displayed at the end of the page.
- Artist rails/directories deduplicate IDs and normalized names before rendering.
- Online song cards expose a contextual action menu for playlists and queue operations.
- When the PWA service worker controls the page and data-saver is off, the app requests only the first 256 KiB of the next queued track. The worker stores this small range and serves matching byte-range requests from it; subsequent ranges continue through the Render media relay.
- Artwork loaded through the same-origin media route is lazy and uses a bounded cache. The offline UI and local playback pipeline were not modified.


## v12.0.41 updates

- Made the Online Home Mujic wordmark re-assert itself as the final visible element at the end of Home.
- Added explicit per-song download and streaming-playlist actions across online track cards and rows.
- Added mouse-wheel and pointer-drag horizontal scrolling to dynamically rendered Online rails on desktop.
- Added a current-track visual highlight in Online queue rows.
- Persisted queue/current track position independently for Offline and Online when changing workspaces.
- Added a Lyrics.ovh fallback through the Render backend after LRCLIB/legacy Render misses; backend route must be deployed for that fallback.
- Bumped service-worker and media caches, and remove the previous cache versions on activation.


## v12.0.41 Online polish and workspace resume

- Online Home forces the large **Mujic** watermark to visible, high-contrast text at the true end of the Home content.
- Home and Similar Artists shelves have desktop scroll buttons plus wheel and pointer-drag scrolling.
- Online song cards and rows expose Add to Playlist and highest-quality AAC Download actions.
- The Online queue marks the currently playing track and displays a playing indicator.
- Online and Offline queue snapshots retain the selected track and playback position when switching workspaces. Playback remains paused during the switch and resumes from that position after Play is pressed.
- Lyrics lookups try a backend-relayed Lyrics.ovh request after the Render lyrics fallback fails; both catalogue tracks and local tracks use the same fallback chain while online. The Render service must have the `/lyrics/ovh` route deployed.
- Service-worker activation removes old application and media caches. Local music files, playlists and settings are not cleared.

The Offline UI stylesheet and offline track-row rendering remain unchanged; shared player/lyrics code only adds persistence and fallback behavior requested for both workspaces.


## v12.0.41 — Minimal Player and Sharing

- Added a compact three-dot menu to the mini player with Song Info, highest-quality AAC download (streaming tracks) and a Mujic song link.
- Share links use the compact `?s=<catalogue-song-id>` route on the Mujic player site. On open, the app resolves that ID through the Render-backed catalogue API and opens the exact song. Local files are not uploadable, so they cannot be shared as playable links.
- Moved track-action/share logic into `js/track-actions.js`, maintaining the feature-based script split already used by the app.
- Reduced global scroll interference by binding vertical-wheel-to-horizontal behavior only to horizontal rails, and changed the main vertical page scroller back to native scrolling.
- Reduced mini-player blur and animated properties for a cleaner, lower-cost UI.
