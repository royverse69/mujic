# Mujic

A small offline-first music player that runs in the browser as an installable PWA. You pick audio files from your device; they are stored in the browser's IndexedDB and played locally. No account, no ads, no app server.

Version 12.0.19 · MIT licence · Creator: Ashutosh Roy

## Run it

```
npm start            # python -m http.server 3000
```
Open http://localhost:3000 (or serve the folder over HTTPS). `file://` will not work, because service workers and the manifest need HTTP(S). On Windows you can double-click `start-mujic.bat`.

## Checks

```
npm run check        # syntax check + action coverage + settings consistency + helper tests
```

## Layout

| File | Purpose |
|---|---|
| `index.html`, `css/app.css` | App shell, views, styles |
| `js/core.js` | Helpers, shared `State`, artwork cache |
| `js/storage.js` | IndexedDB access, settings save/load (`SAVED_KEYS`), listening stats |
| `js/library.js` | Import, metadata parsing, playlists, track removal |
| `js/player.js` | Audio engine, EQ, effects, seek-bar waveform, queue, Media Session |
| `js/lyrics.js` | Lyrics providers and parsing |
| `js/ui.js` | UI core: navigation, sheets, toasts, init (defines `UI`) |
| `js/ui-settings.js` | Settings, appearance, EQ, import/export, install |
| `js/ui-library.js` | Home, library, albums, artists, playlists, track rows |
| `js/ui-search.js` | Search |
| `js/ui-lyrics.js` | Lyrics display and modes |
| `js/ui-history.js` | Listening history |
| `js/ui-player.js` | Queue, now-playing, progress |
| `js/ui-events.js` | Global event delegation and gestures |
| `js/keyboard.js` | Keyboard shortcuts and drag-and-drop import |
| `js/app.js` | Startup and service-worker registration |
| `sw.js` | App-shell cache for offline use |
| `scripts/` | The automated checks above |

Scripts are classic (non-module) files that share globals, so keep the order in `index.html`.

## What stays on your device

Audio, artwork, playlists, settings, play history and cached lyrics are stored in IndexedDB for this origin. Clearing site data deletes them. Settings and listening-stats JSON exports are **not** a backup of your audio.

## What touches the network (all optional)

| Service | When | What is sent |
|---|---|---|
| jsDelivr / cdnjs | On first import | Nothing from you; downloads a metadata parser |
| Google Fonts | On load | Standard font request |
| LRCLIB | Opening lyrics, and import when the artist is missing | Title, artist, album, duration |
| Community lyrics server (`onrender.com`) | After LRCLIB misses, **if enabled** in Settings → Lyrics | Title and artist |
| LyricsPlus mirrors | Last fallback, **if enabled** | Title, artist, album, duration |

Your audio files are never uploaded. The community lyrics server is a third-party host that this repository does not control; switch it off if you want lookups limited to LRCLIB. The "Download High-Quality Songs" link in Settings opens an unaffiliated external site.

## Known limits

- Duplicate detection uses file name + size, not a content hash.
- Playback depends on the browser's codec support.
- A web app cannot keep playing if the OS suspends it, and cannot force hardware offload.
- Song identification via AI was removed and is not part of this release.

## History

`changlog.json` drives the in-app update log. The previous, much longer README is archived in `docs/legacy-readme-v12.0.17.md`.
