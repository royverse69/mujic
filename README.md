# Mujic v12.0.5 — Modular, Offline-First Music Player

> **Your library. Your device. Your controls.**
>
> Mujic is a lightweight, ad-free local music player built as an installable Progressive Web App (PWA). It is designed to remain useful on modest phones and computers, to keep an imported library on the user's device, and to avoid the clutter of feeds, accounts and subscription-oriented music apps.

<p align="left">
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-111111.svg"></a>
  <img alt="Version 12.0.5" src="https://img.shields.io/badge/version-12.0.5-111111.svg">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-111111.svg">
  <img alt="Offline first" src="https://img.shields.io/badge/design-offline--first-111111.svg">
  <img alt="No ads in the player UI" src="https://img.shields.io/badge/player%20UI-no%20ads-111111.svg">
</p>

**Maintainer / creator:** **Ashutosh Roy (aka Mackkar)**  
**Repository:** [github.com/royverse69/mujic](https://github.com/royverse69/mujic)  
**License:** MIT — see [`LICENSE`](./LICENSE)  
**Current package version:** `12.0.5` — also recorded in [`VERSION`](./VERSION) and [`package.json`](./package.json)

---

## Contents

- [1. Project overview](#1-project-overview)
- [2. Product principles](#2-product-principles)
- [3. Feature map](#3-feature-map)
- [4. Architecture at a glance](#4-architecture-at-a-glance)
- [5. Complete repository structure](#5-complete-repository-structure)
- [6. Frontend and module responsibilities](#6-frontend-and-module-responsibilities)
- [7. Startup and application lifecycle](#7-startup-and-application-lifecycle)
- [8. Importing audio](#8-importing-audio)
- [9. Metadata and artwork processing](#9-metadata-and-artwork-processing)
- [10. Local library, artists and albums](#10-local-library-artists-and-albums)
- [11. Playlists](#11-playlists)
- [12. Search and Home](#12-search-and-home)
- [13. Playback engine](#13-playback-engine)
- [14. Queue, shuffle and repeat](#14-queue-shuffle-and-repeat)
- [15. Mini-player and full player](#15-mini-player-and-full-player)
- [16. Audio effects and equalizer](#16-audio-effects-and-equalizer)
- [17. Audio Waveform / seek-bar effects](#17-audio-waveform--seek-bar-effects)
- [18. Lyrics engine](#18-lyrics-engine)
- [19. Experimental Gemini song identification](#19-experimental-gemini-song-identification)
- [20. Listening history and statistics](#20-listening-history-and-statistics)
- [21. Themes and personalisation](#21-themes-and-personalisation)
- [22. Performance profile for low-end devices](#22-performance-profile-for-low-end-devices)
- [23. IndexedDB storage model](#23-indexeddb-storage-model)
- [24. Offline behaviour and service worker](#24-offline-behaviour-and-service-worker)
- [25. PWA installation](#25-pwa-installation)
- [26. Media Session, lock-screen controls and wake lock](#26-media-session-lock-screen-controls-and-wake-lock)
- [27. Settings reference](#27-settings-reference)
- [28. Data export, deletion and recovery](#28-data-export-deletion-and-recovery)
- [29. External services and network behaviour](#29-external-services-and-network-behaviour)
- [30. Privacy and security model](#30-privacy-and-security-model)
- [31. Audio-format and browser compatibility](#31-audio-format-and-browser-compatibility)
- [32. Run the project locally](#32-run-the-project-locally)
- [33. Development workflow and checks](#33-development-workflow-and-checks)
- [34. Troubleshooting](#34-troubleshooting)
- [35. Extension points for contributors](#35-extension-points-for-contributors)
- [36. Known limits and honest expectations](#36-known-limits-and-honest-expectations)
- [37. Release notes](#37-release-notes)
- [38. Contributing](#38-contributing)
- [39. License and credits](#39-license-and-credits)

---

## 1. Project overview

Mujic is a **local-first music library and playback application**. A user selects audio files from their own device; Mujic reads available metadata, persists the original audio as a browser `Blob`, and uses that locally stored object for playback. The browser is the execution environment, and IndexedDB is the persistent data layer.

Mujic is not a cloud music catalogue and does not require an account. It does not upload imported audio to a Mujic-owned server. Playback of audio that has already been imported and successfully stored does not depend on a network connection. Internet access is an optional enhancement for items such as metadata parser downloads during import, online lyrics, optional Gemini identification and web fonts.

### Project goals

- **Offline-first:** imported music and core library data are stored locally.
- **Lightweight:** optional metadata parsers load only when the user imports files; visual effects are opt-in and can be reduced on constrained devices.
- **Ad-free player interface:** no advertising SDK or ad placement is built into the player UI.
- **Readable and navigable:** Home, Library, Search and Settings are separate views; Settings itself is grouped into focused categories.
- **Customisable:** themes, accents, density, text scale, player presentation, lyrics presentation, waveform styles and audio processing are configurable.
- **Recoverable:** preferences and listening statistics can be exported as JSON; track history and playlists are persisted locally.
- **Open source:** the code is released under the MIT License.

### What “backend” means in this repository

Mujic has **no app-owned Node/Express API server, login service, cloud database or music-upload backend**. The JavaScript modules run in the browser. `StorageAdapter` is the local persistence/data-access layer, `AudioAdapter` is the audio engine, and `LyricsFetcher` is the integration layer for external services. A static HTTP server is used only to serve the files and enable browser features such as the service worker.

The application can call remote services for lyrics and optional AI identification. Those are network integrations, not a private server that stores the user's music. See [External services and network behaviour](#29-external-services-and-network-behaviour).

---

## 2. Product principles

### Local-first, not local-only

The audio library is local, but some optional conveniences are online. In particular, lyrics are fetched on demand and cached after a successful response; the experimental Gemini feature is opt-in and requires a saved API key and internet access. A first-time lyrics request cannot magically retrieve an uncached remote lyric while offline.

### Keep expensive work out of startup

On launch, Mujic initialises storage, loads preferences and library metadata, restores the visible player if resume is enabled, and renders the main views. Metadata parsers are loaded only when needed for an import. Lyrics network lookups are deferred until lyrics are opened rather than being performed for every track change. Artwork cache warm-up happens in small idle-time batches.

### Prefer graceful degradation

If metadata parsers cannot be downloaded, the import flow can fall back to filename-derived title/artist information. If a lyrics provider times out, the next provider can be attempted. If Web Audio effects are unsupported, normal HTML media playback may still work, but equalizer/waveform/loudness features can be unavailable. If an audio codec is unsupported by the current browser, playback cannot be forced by the application.

### Respect the device's performance budget

The `Auto`, `Low-end device` and `Full visuals` profiles control costly visual work. Auto mode considers exposed device-memory and logical-core hints and the operating system's reduced-motion preference. Low-end mode lowers the waveform canvas resolution/frame rate and reduces artwork warm-up work. It does not alter the user's audio files or reduce their stored audio quality.

---

## 3. Feature map

| Area | Features | How it works |
|---|---|---|
| Library | Import multiple audio files, metadata parsing, local sort, remove track | The browser file picker provides `File` objects; metadata is extracted; audio, metadata and artwork are written to IndexedDB. |
| Playback | Play/pause, next/previous, seek, volume, mute, speed, resume | An `HTMLAudioElement` plays object URLs created from locally stored audio blobs. |
| Queue | Up Next, reorder, move up/down, remove, play a queue item, add next, shuffle, repeat | `State.queue`, `State.playbackOrder` and `State.queueIndex` hold the queue and active position. |
| Library views | Home, songs, albums, artists, playlists, search, context detail, favorites | UI renderers read the in-memory state backed by IndexedDB. |
| Lyrics | Embedded lyrics, synced LRC, plain text, cache, LRCLIB, Render fallback, optional LyricsPlus | `LyricsFetcher` resolves providers on demand, validates likely matches and saves successful lyrics locally. |
| AI identification | Up to four Gemini API keys, key testing, fallback rotation, experimental metadata matching | Browser sends text metadata to Google's Gemini API; no audio bytes are sent. |
| EQ | Five bands, presets and custom band values | Web Audio BiquadFilters with adjustable gain. |
| Player effects | Soft track fade, silence skipping, loudness control, pitch preservation/varispeed, skip-on-error | Optional logic in the audio engine. Some features require Web Audio support. |
| Audio Waveform | Played-section waveform; Default, Wavy, Slim, Squiggly | A small canvas reads analyser data and clips rendering to the elapsed part of the seek bar. |
| Appearance | Theme mode, accent presets/custom colour, surface palette, text size, layout density, blur style, corner radius, reduced motion | Saved preferences are mapped to CSS classes and custom properties. |
| History and stats | Recent play history, today/week/month/all-time counts, listening time, most-played list | A play-history store records track-start events; aggregate daily play/listening metrics are saved with settings. |
| Export | Export settings, export listening statistics/history | Browser downloads JSON generated from selected local state. API keys are intentionally excluded from settings export. |
| PWA | Install prompt, app manifest, service-worker app-shell cache | Works through localhost or HTTPS; cache policy differs for navigation, app assets and fonts. |
| Accessibility/responsive UI | Touch-friendly controls, dialog keyboard handling, mobile layouts, desktop layout, reduced motion | CSS media queries and event handlers adapt interaction to the viewport and available browser APIs. |

---

## 4. Architecture at a glance

```text
┌──────────────────────────────────────────────────────────┐
│                     index.html                           │
│  App shell · views · settings markup · player controls    │
└───────────────────────────┬──────────────────────────────┘
                            │ loads classic deferred scripts in order
┌───────────────────────────▼──────────────────────────────┐
│                       js/app.js                           │
│  Startup · restore · install event · service worker       │
└───────────┬───────────────┬──────────────┬────────────────┘
            │               │              │
     ┌──────▼─────┐  ┌──────▼──────┐  ┌────▼────────────┐
     │ js/ui.js   │  │ js/player.js│  │ js/library.js   │
     │ Views and  │  │ Audio/queue │  │ Import and      │
     │ interaction│  │ transport   │  │ playlists       │
     └──────┬─────┘  └──────┬──────┘  └────┬────────────┘
            │               │              │
            └───────────────┼──────────────┘
                            │
                   ┌────────▼────────┐
                   │ js/storage.js   │
                   │ IndexedDB +     │
                   │ stats            │
                   └────────┬────────┘
                            │
           ┌────────────────┴──────────────────┐
           │                                   │
  ┌────────▼─────────┐                ┌────────▼──────────┐
  │ Browser storage  │                │ js/lyrics.js      │
  │ audio/art/track  │                │ Lyrics cache and  │
  │ settings/history │                │ online providers  │
  └──────────────────┘                └────────┬──────────┘
                                               │ optional internet
                             ┌─────────────────┼─────────────────┐
                             │                 │                 │
                          LRCLIB          Render fallback    LyricsPlus
                                               │
                                      Optional Gemini direct call
```

### Architectural choices

1. **Classic scripts, ordered with `defer`.** The files are split by responsibility but use shared browser globals (`State`, `Utils`, `UI`, `Player`, `AudioAdapter`, `StorageAdapter`, `Library`, `Playlists`, `LyricsFetcher`, `Dialog`, `Stats`). Ordered deferred scripts allow the current integration style without converting the application into ES modules.
2. **Single-page shell.** Views are sections in `index.html`; `UI.switchView()` changes the active section rather than requesting a new HTML page.
3. **Local persistence.** IndexedDB is the durable data layer. The in-memory `State` object is used for fast interaction and is loaded/saved through `StorageAdapter`.
4. **Native audio element.** `AudioAdapter.audio` is an `Audio` element. Web Audio is created lazily when effects such as EQ, loudness processing or the analyser are needed.
5. **Provider adapters.** Lyrics providers are called by `LyricsFetcher`, which applies timeouts and handles data conversion. A provider failing does not invalidate locally embedded or cached lyrics.
6. **No app-owned API server.** `package.json` starts a static Python server. Direct Gemini calls originate in the browser and use keys the user entered in Settings.

---

## 5. Complete repository structure

The current v12.0.5 ZIP contains this structure:

```text
Mujic-v12.0.5/
├── index.html                  # App shell, views, settings and player markup
├── css/
│   └── app.css                 # Theme tokens, components, responsive layouts, animation
├── js/
│   ├── vendor-loader.js        # On-demand metadata parser loader
│   ├── core.js                 # Utilities, State, artwork cache
│   ├── storage.js              # IndexedDB adapter, saved settings, listening stats
│   ├── lyrics.js               # Lyrics providers, cache logic, Gemini identification
│   ├── dialogs.js              # Confirm/prompt dialog component
│   ├── player.js               # Audio engine, EQ, effects, visualizer, queue, Media Session
│   ├── library.js              # Import, parsing, track removal, playlist CRUD/reordering
│   ├── ui.js                   # Rendering, navigation, settings, gesture delegation
│   └── app.js                  # Startup, resume restoration, PWA and lifecycle setup
├── icons/
│   ├── icon-192.png            # PWA icon, 192×192
│   └── icon-512.png            # PWA icon, 512×512
├── manifest.webmanifest        # Name, icons, display mode and install scope
├── sw.js                       # Application-shell and font cache strategy
├── changlog.json               # Release note source used by Change & Update Log
├── VERSION                     # Release version string
├── package.json                # Package metadata and local/check scripts
├── start-mujic.bat             # Windows launcher for localhost static hosting
├── .gitignore                  # Ignores local env files, node_modules and OS files
├── LICENSE                     # MIT license
└── README.md                   # Project documentation (this file)
```

### Files in more detail

#### `index.html`
Contains the semantic structure for Home, Library, Search, contextual details and Settings. It also contains the mini-player, full player, dialogs and bottom-sheet markup. The external stylesheet and scripts are referenced locally. The file includes the PWA manifest link and icons. Avoid duplicating component markup in JavaScript when an existing component/action pattern can be reused.

#### `css/app.css`
Defines root CSS custom properties for colors, spacing, radii, typography, safe-area insets and navigation geometry. It styles track rows, artwork cards, tabs, sheets, dialogs, equalizer controls, player layouts, lyrics, waveform canvas, Settings pages, theme variants and breakpoints. Performance mode classes reduce motion/expensive visual treatments where applicable.

#### `js/vendor-loader.js`
Keeps metadata parsers out of the critical startup path. `MujicVendors.ensure()` tries `music-metadata-browser` first and then `jsmediatags`, using timeouts. It is called by the metadata-import path, not on every ordinary launch. If both libraries are unavailable, file-name parsing provides a limited fallback.

#### `js/core.js`
Provides common helpers (`formatTime`, `formatBytes`, extension/MIME detection, debounce, ID generation, HTML escaping, generated placeholder artwork), defines the shared `State` object and owns `ArtworkCache`. Artwork blobs are retrieved from IndexedDB and exposed as object URLs. Pending requests are shared to avoid repeated work, and object URLs can be revoked when the cache is cleared.

#### `js/storage.js`
Implements IndexedDB operations, settings serialisation/deserialisation, saved tracks, audio blobs, artwork, playlists, lyrics cache, append-only play-history entries and aggregate listening statistics. It also calculates binary storage size. This is the primary place to change the persistence schema.

#### `js/lyrics.js`
Implements title/artist normalization, LRC recognition/parsing, result-match checks, bounded fetch timeouts, local-cache resolution, LRCLIB exact/search requests, the Render lyrics fallback, the optional LyricsPlus v2 fallback and Gemini-based song identification. It does not run lyric network lookups during initial app startup.

#### `js/dialogs.js`
Implements the app's prompt/confirm modal. Callers receive a promise that resolves to the user's input, `true`, `false` or `null` depending on dialog type and action. The component handles cancel/confirm, the overlay and keyboard shortcuts.

#### `js/player.js`
Contains the `AudioAdapter` and `Player` objects. Audio events update state/progress/stats and the browser Media Session. It constructs the optional Web Audio graph, manages EQ/effects and the seek-bar analyser, plays audio blobs, updates metadata, resolves playback order and exposes queue controls. It also handles sleep timers and wake lock requests.

#### `js/library.js`
Imports files, loads metadata parsers on demand, extracts common tags and embedded lyrics, saves file/metadata/artwork, verifies the stored audio blob, sorts the library, removes tracks, and provides playlist creation/add/rename/delete/reorder operations.

#### `js/ui.js`
Owns view rendering and interactions: Settings category navigation, Home rails, songs/albums/artists/playlists, context detail views, row templates, artwork hydration, search, lyrics display, queue UI, sheets, toast messages, play-stat presentation, JSON downloads, visualizer style selection, installation UI and global touch/pointer/click delegation.

#### `js/app.js`
Starts the app on `DOMContentLoaded`: initialises UI, opens IndexedDB, loads settings, renders the Gemini key manager, applies settings, loads tracks/playlists/history, warms artwork, initialises audio, renders views and restores the last queue/current position if resume is enabled. It registers the service worker only on HTTP/HTTPS origins.

#### `sw.js`
Caches the static application shell and two icon files during install, deletes old Mujic cache versions at activation, and serves local assets cache-first. Page navigations try the network and fall back to the cached shell if offline. Google Fonts resources can be cached; unrelated remote provider requests are deliberately not intercepted by the app-shell policy.

#### `manifest.webmanifest`
Defines the app's name, start URL, scope, standalone display mode, orientation preference, theme colors and install icons.

#### `changlog.json`
Provides versioned entries for the in-app Change & Update Log. The filename is intentionally spelled `changlog.json` in the code; do not rename it without updating the fetch path and service-worker shell list. The UI also has fallback release notes when the file cannot be retrieved.

#### `package.json`
Provides project metadata and convenience commands. `npm start` runs `python -m http.server 3000`; it is not an application backend. `npm run check` runs Node.js syntax checks over the service worker and JavaScript files.

#### `start-mujic.bat`
For Windows, starts Python's static server bound to loopback (`127.0.0.1:3000`), waits for the app URL to respond and opens it in the browser. Python is used as a static-file server only.

---

## 6. Frontend and module responsibilities

### Shared application state

`State` is initialised in `js/core.js` and used by the ordered script set. Broad categories include:

- **Library/navigation:** `library`, `playlists`, current view/context, current playlist ID, search results and action targets.
- **Transport:** `queue`, `playbackOrder`, `queueIndex`, `currentTrackId`, `isPlaying`, `currentTime`, `duration` and `isFullPlayerOpen`.
- **User collections:** `favorites`, `favoriteArtists`, simple recent `history`, append-only `playHistory` and pagination state.
- **Audio preferences:** volume/mute, playback rate, shuffle/repeat, EQ preset/bands, waveform mode/style, loudness/silence behavior, pitch and seek configuration.
- **Appearance:** theme, accent preset/custom accent, surface palette, text scale, density, interface intensity, radius, motion and player artwork/background modes.
- **Lyrics:** style, position, offset, size, spacing, width, emphasis, current lyrics, active line and unavailable-lyrics timeout.
- **AI:** enable flag, at most four Gemini keys, next key index and per-session warning state.
- **Persistence/cache:** artwork object URLs, current playback request ID, current artwork request ID, saved resume position and stats save timer.

This is ordinary mutable in-memory JavaScript state. IndexedDB is the durable copy for the settings/tracks/playlists/history described below. A new feature should identify which values are transient UI state and which must survive a reload.

### Delegated interaction model

Many controls use `data-action`, `data-setting`, `data-tab`, `data-view` or similar attributes. `UI.setupGlobalDelegation()` handles these attributes centrally rather than attaching an individual listener to every rendered row. That lets dynamically generated track rows and playlist cards reuse the same behavior. Special controls requiring more careful event priority—such as mini-player transport, navigation, pointer queue dragging or long-press actions—have specific listeners to avoid click propagation conflicts.

### Settings categories

The long Settings view is split into subpages rather than forcing a user to scroll through every control. Categories include:

1. **UI & Customization** — themes, accents, surface palettes, text and density, radius, motion and player appearance.
2. **Player & Audio** — waveform, playback, EQ/audio effects and transport preferences.
3. **Lyrics & AI** — lyrics presentation, LyricsPlus and experimental Gemini identification/key management.
4. **Library & Listening** — sort settings, artwork-in-list display, listening summaries and exports.
5. **App & About** — PWA install, storage information, clear-library action, extras and changelog/about content.

The groups are created by `UI.setupSettingsGroups()` from existing Settings sections, so the actual settings controls remain in the document and are moved into the correct category container. `UI.setSettingsGroup()` manages the current category and browser history.

---

## 7. Startup and application lifecycle

The startup sequence is intentionally ordered because this codebase uses classic scripts and shared globals.

1. The browser parses `index.html`, loads `css/app.css`, then evaluates the deferred scripts in the declared order.
2. `DOMContentLoaded` runs `App.init()`.
3. `UI.init()` attaches settings, navigation, dialogs, gestures and delegated action handlers.
4. `StorageAdapter.init()` opens IndexedDB database `MujicDB`, version `6`, and creates any missing stores.
5. `StorageAdapter.loadSettings()` restores saved preferences, favourites, queue settings, visualiser, statistics and Gemini key values.
6. The Gemini key editor is populated from saved state, then `UI.applySettings()` applies theme classes and CSS variables, layout density, typography, performance mode and control values.
7. Track metadata, playlists and a page of recent history are loaded from IndexedDB. Library sorting is applied.
8. Artwork warm-up is scheduled in small batches; it does not block the initial page render.
9. The audio engine and Media Session are initialised. Home/library/playlists, stats, player labels and storage-size display are rendered.
10. If Resume Playback is enabled and a saved current track/queue still exists, the app restores the queue and player metadata, reads that track's local audio blob, assigns an object URL and restores the saved time after metadata loads.
11. Lyrics are not downloaded merely because a track changed; `UI.loadCurrentLyrics()` requests them when lyrics mode opens.
12. On HTTP/HTTPS, `app.js` registers `sw.js` after the page loads. A `file://` launch cannot install a service worker or provide the normal same-origin PWA experience.

### Why script order matters

The modules reference shared objects by name and are loaded as classic scripts, not `import` statements. Keep the order in `index.html` intact unless you also refactor the modules. `vendor-loader.js` should remain before the import path that references `window.MujicVendors`; `core.js` defines `State` and `Utils`; storage, lyrics, dialogs, player, library and UI follow; app bootstrap is last.

---

## 8. Importing audio

### Supported file selection

The file picker accepts audio MIME types and the current fallback extension list:

`mp3`, `m4a`, `aac`, `flac`, `wav`, `ogg`, `oga`, `opus`, `webm`, `aiff`, `aif`, `alac`.

This list is an import acceptance filter, not a guarantee that every browser can decode every listed codec. Playback depends on the codec support of the browser/operating system. A file can have its metadata stored correctly while still being unplayable in a particular browser.

### Import pipeline

```text
User selects one or more files
            │
            ▼
Check file type / supported extension
            │
            ▼
Detect duplicate by filename + byte size
            │
            ├── Duplicate: restore/save existing audio blob
            │
            ▼
Load optional metadata parser if needed
            │
            ▼
Read tags, duration, embedded lyrics, cover art
            │
            ▼
If title is missing, derive from filename
(artist - title when the naming pattern fits)
            │
            ▼
If artist is missing and duration is known, try a bounded
LRCLIB metadata lookup with title/duration match checks
            │
            ▼
Save track metadata, audio Blob and artwork Blob
            │
            ▼
Read the audio Blob back to verify it was stored
            │
            ▼
Add track to in-memory library and optional target playlist
```

### Duplicate handling

Mujic currently identifies likely duplicate imports by `fileName` plus `fileSize`. When it finds a duplicate, it rewrites/restores the existing track's stored audio blob and verifies that the blob exists and has a positive size. This is a practical local duplicate check, not a cryptographic hash: two different files with identical names and sizes can be treated as the same entry. A future enhancement could add optional content hashes, but hashing large files has a CPU cost that should be considered on low-end devices.

### Offline imports

Metadata parsing libraries may not already be present after a fresh offline launch. In that case the app falls back to the parser that is available, or to filename-derived metadata. Audio storage does not depend on a lyrics provider. The import logic checks that a saved blob can be read back before adding a new track to the visible library, so a failed write should not be presented as a confirmed offline-ready import.

---

## 9. Metadata and artwork processing

### Metadata providers

The lazy vendor loader tries:

1. `music-metadata-browser` from jsDelivr.
2. `jsmediatags` from cdnjs if the first parser does not load or parse the file.

Each script request is bounded by a timeout. The app does not fetch these parser scripts on every startup. They are requested when the import path requires metadata extraction.

### Fields read when available

The metadata parser attempts to obtain:

- title;
- artist;
- album and album artist;
- genre and year;
- track number and disc number;
- composer;
- duration (used during import-time metadata matching when available);
- embedded lyrics;
- embedded artwork and its format.

Not all tag formats expose all fields, and different libraries return different shapes. Missing fields are allowed. The current import record initially stores `duration: 0`; the audio element updates the persisted duration after the browser loads media metadata on playback. The parsed duration can still be used by the import-time missing-artist lookup. The app stores fallback values such as `Unknown Title`, `Unknown Artist` and `Unknown Album` when it cannot derive better information.

### Artwork storage and display

Embedded pictures are represented as `Blob`s, stored under generated artwork IDs in IndexedDB, and associated with track metadata by `artworkId`. `ArtworkCache.getUrl()` retrieves the blob and creates a browser object URL for display. It maintains a URL cache and in-flight request map to avoid repeatedly reading the same artwork blob or creating duplicate URLs. Object URLs are revoked when artwork caches are cleared.

When artwork is missing, Mujic generates local placeholder SVG artwork from a deterministic title seed. The placeholder is generated inside the browser; it is not fetched from a remote cover-art service. The generated image avoids a blank broken-image frame and is cached as a usable fallback by the row templates.

The app can also derive an average colour from existing artwork for dynamic accent appearance. That extraction uses a small canvas read and has its own cache/pending map to avoid repeating the work.

### Storage size display

The UI first calculates a metadata-based estimate from track file sizes and can then read binary stores to refine the size using saved audio and artwork blobs. Browser storage APIs do not expose a perfectly uniform cross-browser quota view, so the displayed value is a useful estimate of Mujic's saved audio/artwork bytes rather than a complete accounting of every byte the browser allocates internally.

---

## 10. Local library, artists and albums

### Songs library

The Songs view lists `State.library` after the selected sort field and direction have been applied. Current sort fields are:

- Recently Added (`dateAdded`)
- Title
- Artist
- Album

Sort direction can be ascending or descending. The metadata sort is local and does not require the network.

### Artist grouping

Artist groups are built from the local library, using `albumArtist` when present and otherwise `artist`. Track rows within a group resolve back to library track IDs. Opening an artist creates a contextual detail view with a generated/artwork thumbnail, relevant track list and actions for playback/shuffle/favourite artist where available. A favourite artist is a stored text identity; tracks with the same artist name are grouped by the same local key.

### Album grouping

Albums are grouped from local metadata using album plus album-artist/artist identity, preventing albums with the same name by different artists from automatically merging into a single group. The album view shows locally derived artwork and its associated tracks. No online album catalogue is required.

### Removing tracks

Removing a library track updates in-memory library/favourite/history/queue references, removes the track from any playlist that references it, deletes its metadata record and audio blob, then refreshes the relevant views. If the current song is removed, playback is paused and the player is closed. Artwork blobs can become unreferenced if no remaining track points at them; the current storage model does not run a full global garbage collector over every artwork ID after every deletion.

---

## 11. Playlists

Playlists are local named collections of track IDs. They do not duplicate audio blobs; they reference tracks already in the library.

### Playlist data shape

```json
{
  "id": "generated-local-id",
  "name": "Playlist name",
  "tracks": ["track-id-1", "track-id-2"],
  "createdAt": 1790000000000,
  "order": 0
}
```

The timestamps and IDs above are illustrative, not a fixed API. The playlist's actual data is persisted in the IndexedDB `playlists` store.

### Playlist actions

- Create a new playlist.
- Create a playlist while adding the selected track.
- Add a track from the track-options sheet.
- Import multiple files directly into a selected playlist.
- Rename a playlist.
- Delete a playlist after confirmation.
- Remove a track from a playlist without deleting it from the library.
- Move a track up or down inside a playlist.
- Move a playlist up or down in the user's playlist order.
- Open a playlist detail page and play or shuffle its tracks.

### Playlist import behaviour

The playlist import control passes the target playlist ID into the same `Library.importFiles()` flow used for normal library import. The newly imported files are stored in the library first and their IDs are then added to the target playlist. If a duplicate file is detected and its audio blob is restored, that existing track can be attached to the playlist instead of creating a second library record.

### Deleting a playlist vs deleting a track

Deleting a playlist removes the playlist record and its ordering entry; it does not delete the underlying tracks. Removing a song from a playlist only removes its ID from that playlist. Removing a track from the library is a wider action: the track is removed from playlists and its local audio/metadata are deleted.

### Long-press behaviour

On supported touch browsers, a press-and-hold on a Home playlist opens the playlist action sheet. The timer is cleared on pointer-up or pointer-cancel. On Home track rows, a separate touch long-press can open the song options sheet; controls inside the row are excluded. Small movement/scroll behaviour and platform event delivery may vary, so these gestures should be tested on target devices.

---

## 12. Search and Home

### Search

Search is local. It matches query text against relevant library metadata and can display songs, artists, albums and playlists. When the search query is empty, the view can show recently played items when history is available. It does not search a remote streaming catalogue and does not download music.

The search input is debounced to prevent a full result rebuild on every single keystroke. User text is rendered through the app's HTML-escaping helper where templates require it.

### Home

Home is generated from the local library, favourites, playlists and listening stats. The current Home layout includes:

- a time-of-day greeting;
- a playlist rail, including the Liked Songs/favourites entry;
- Top Picks generated from locally stored play counts, then recent history and library entries as a fallback;
- a compact Continue Listening / recent library track section.

Top Picks is not a cloud recommendation algorithm. It ranks tracks with available local play statistics, then uses history and library order if there are not yet enough listening events. The Home screen can therefore have meaningful content before an internet connection or an AI recommendation feature is used.

### Track options

Track rows can open an options sheet. Actions may include playback, play next, add to queue, favourite/unfavourite, add to playlist and remove from library. Context is held in `State.actionTargetId`; action handlers resolve the selected ID back to the stored library track instead of relying on the row's displayed text alone.

---

## 13. Playback engine

### Primary audio pipeline

`AudioAdapter.audio` is a browser `Audio` element. When a user selects a track, `Player.startCurrentTrack()` obtains the current track from `State.playbackOrder[State.queueIndex]`, reads its audio blob from IndexedDB and creates an object URL. The current object URL is revoked before it is replaced to avoid retaining obsolete blob URLs.

The audio element then handles decoding and playback. Browser codec support is the final authority: an audio file's extension or MIME type cannot make an unsupported codec playable.

### Why track-load request IDs exist

Track changes require asynchronous storage reads and metadata updates. `State.playbackRequestId` acts as a ticket. Starting a newer track increments the ticket; an older asynchronous operation checks its ticket before committing playback. This helps prevent a slow blob read from an earlier track from replacing a song the user has already selected next.

### Core transport controls

- **Play/Pause:** start or pause the current `Audio` element. If there is a queue but no current queue index, playback starts at the initial item.
- **Next:** advance the queue index and load that item. End-of-queue behaviour respects repeat settings.
- **Previous:** if the current time is beyond approximately three seconds, reset the current track to the beginning; otherwise move to the previous queue item, bounded/wrapped according to repeat configuration.
- **Seek:** update the audio element's `currentTime`, clamped to the known duration.
- **Volume:** update `audio.volume` and saved mute/volume values. Platform behaviour differs, especially on iOS.
- **Playback speed:** set `audio.playbackRate`; preserve-pitch behaviour is enabled where the browser exposes it and where varispeed is not enabled.
- **Favourite:** persist the current track ID in the favourites list and refresh the corresponding icons.

### Playback progress and duration

Audio events update `State.currentTime`, `State.duration`, the time labels and the seek-bar fill/thumb. The `loadedmetadata` event refreshes duration and can restore a saved resume position. Duration can be written back to track metadata after the browser has successfully opened the file.

### Object URLs

An audio blob in IndexedDB is not itself a URL the audio element can stream from. `URL.createObjectURL(blob)` supplies the temporary local URL. Mujic retains the active URL while it is in use and revokes the old URL during track switches/cleanup. It must not revoke the URL while the audio element is still expected to use it.

---

## 14. Queue, shuffle and repeat

Mujic keeps three closely related values:

- `State.queue`: the conceptual queue/list of track IDs saved for restoration.
- `State.playbackOrder`: the order the player is currently navigating (which can differ when shuffled).
- `State.queueIndex`: the index of the current track in `playbackOrder`.

The **current track ID** is kept in `State.currentTrackId`. A track is resolved back to `State.library` by ID when metadata or the audio blob is needed.

### Shuffle

Shuffle creates a randomised playback order while attempting to preserve the active track. Turning shuffle off restores a linear order from the queue and finds the current track's index. The shuffle flag and queue are saved to IndexedDB.

### Repeat modes

The player cycles through three states:

- `0` — Repeat Off
- `1` — Repeat All
- `2` — Repeat One

Repeat One restarts the current track at end. Repeat All wraps the order to the first item. Repeat Off stops at the final item rather than wrapping.

### Up Next

The queue sheet shows the playback order and active position. It supports selecting a queue entry, removing non-current items, clearing the queue down to the current song, adding a song to play next, appending a song and reordering entries with touch-friendly drag/drop and move controls. When reordering, the active queue index must be adjusted if an item crosses it; the reorder logic does this so the playing song remains the active item.

`preventDuplicateQueue` optionally blocks adding a track already present in the queue. When disabled, duplicate IDs may exist in `playbackOrder`, which is useful when a user intentionally wants to repeat a track within a list.

### Starting playback from a context

The player can start from a library list, search result, artist, album or playlist. Context playback builds the queue from the relevant list and sets the active index. Shuffle-context playback generates a shuffled order for that context. When contributing, verify both the initial track and subsequent Next/Previous behaviour for every context—do not test only by clicking the song from Home.

---

## 15. Mini-player and full player

### Mini-player

The mini-player remains visible when a track is selected and the full player is collapsed. It shows artwork, title, artist, progress and transport controls. Play/Pause and Next have dedicated event handlers to prevent the parent surface's “open full player” handler from consuming a control click. The progress strip is display-only in mini-player mode; seeking is performed in the full player's scrubber.

### Full player

The full player includes:

- artwork presentation (full-cover or contained);
- optional backdrop mode (artwork, muted/solid or black);
- title, artist and favourite control;
- current time, duration and seek control;
- shuffle, previous, play/pause, next and repeat controls;
- volume/mute and More options;
- queue access;
- lyrics mode, including immersive/full-screen lyrics where supported;
- audio waveform and its selected effect style.

The desktop layout uses a wider two-column arrangement; small screens use a compact single-column presentation. Safe-area variables and viewport-height handling help account for mobile browser chrome and notches, but actual browser viewport behaviour should be tested on real devices.

### More sheet and secondary sheets

The More sheet links to playback speed, Bass Boost/legacy EQ options, sleep timer, output device where supported, volume where useful, and immersive lyrics. Dedicated sheets contain the Up Next queue, waveform modes/styles and other focused controls. Sheets are history-aware so browser Back can close a sheet before leaving its underlying view.

---

## 16. Audio effects and equalizer

Audio effects use browser audio capabilities, not a separate native audio service. The app keeps features optional so users can choose between processing and lower CPU/battery use.

### Five-band equalizer

When Web Audio is enabled, the audio graph uses five BiquadFilters with the following bands:

| Band | Frequency | Filter type | Purpose |
|---|---:|---|---|
| 1 | 60 Hz | Low shelf | Sub-bass and low bass |
| 2 | 230 Hz | Peaking | Bass body / lower warmth |
| 3 | 910 Hz | Peaking | Midrange body |
| 4 | 3.6 kHz | Peaking | Presence / upper mids |
| 5 | 14 kHz | High shelf | High-frequency brightness |

Each band's gain is clamped from `-12 dB` to `+12 dB`. Presets in the engine include:

- **Flat:** all bands at 0 dB.
- **Bass:** more gain in the lowest bands, slight top reduction.
- **Vocal:** lower bass and emphasised upper mids.
- **Rock:** boosted low end and treble with a slight middle cut.
- **Treble:** reduced lows and boosted upper bands.
- **Custom:** the state reached when the user manually moves any band.

Changes are applied to the filter nodes and persisted to the settings record. The older Off/Low/Medium/High Bass Boost choices map to a subset of the same five-band gain array for compatibility.

### Web Audio graph

When an effect needs Web Audio, the engine creates a graph similar to:

```text
HTMLAudioElement
  → MediaElementSource
  → 60 Hz low-shelf filter
  → 230 Hz peaking filter
  → 910 Hz peaking filter
  → 3.6 kHz peaking filter
  → 14 kHz high-shelf filter
  → AnalyserNode
  → DynamicsCompressorNode
  → Master GainNode
  → AudioContext destination
```

The context and nodes are initialised lazily. If `AudioContext` is missing or suspended, the app attempts to resume it where allowed. Browsers require a user gesture for some audio operations, so the first play/effect toggle can depend on platform gesture rules.

### Soft track transitions

The `crossfade` option performs a brief master-gain fade around a track transition. It intentionally does **not** mix two tracks simultaneously. Avoiding overlap reduces simultaneous decoder/audio-stream and memory costs on low-end devices. If Web Audio is unavailable, this enhancement may be skipped.

### Silence skipping

`skipSilence` checks analyser energy while playing and advances past sustained low-level audio after a threshold. `instantSkipSilence` uses a shorter threshold and larger skip but only applies when the main skip-silence option is enabled. This is heuristic detection, not semantic speech/music recognition; quiet intros or pauses in a song can sometimes be treated as silence.

### Loudness control

Loudness control configures a `DynamicsCompressorNode`. The Soft, Balanced and Strong profiles select different threshold, knee, ratio, attack and release settings. It reduces large volume peaks; it is not a lossless loudness normaliser and may change the sound's dynamics.

### Pitch and speed

- `preservePitch` attempts to keep voice pitch closer to the original while changing speed using browser-supported `preservesPitch`/`webkitPreservesPitch` properties.
- `varispeed` deliberately allows pitch to follow playback speed (tape-style behaviour), overriding pitch preservation.
- Actual output depends on browser/engine support.

### Additional playback controls

- `autoSkipOnError`: if a queued track fails to decode and there is more than one queue item, attempt to skip the failing item rather than leaving the player stuck.
- `progressiveSeek`: repeated Media Session seeks pressed quickly can increase the step size.
- `seekStep`: base media-session seek increment, one of 5, 10, 15 or 30 seconds.
- `pauseWhenMuted`: pause when the user mutes or sets volume to zero.
- `stopOnPageHide`: pause when page hide/unload is signalled. Browser task-swipe/app-kill events are not delivered consistently.
- `keepScreenAwake`: request a Wake Lock while the full player is open, if supported.
- **Audio output:** uses `enumerateDevices` / `setSinkId` where the browser supports output selection; otherwise the app explains that the control is unsupported.
- **Hardware audio offload:** browser/OS managed. A web app cannot reliably force native hardware offload and should not pretend a checkbox can do so.

### Sleep timer

The sleep timer supports Off, a timed countdown and stopping at the end of the current song. A timed countdown updates the displayed remaining time and pauses when the timer expires. End-of-song mode waits for the audio `ended` event before stopping. It does not depend on a remote timer service.

---

## 17. Audio Waveform / seek-bar effects

Audio Waveform is an optional audio-reactive canvas over the played part of the full-player seek bar.

### Waveform modes

The current selection can be Off, Spectrum Bars, Audio Waveform, Pulse, Dots or Mirror Bars (the legacy `aurora` value is normalised to Pulse). The selected mode is saved. The Audio Waveform mode also has four style choices:

- **Default:** a thin, minimal played line.
- **Wavy:** a smooth, low-frequency wave.
- **Slim:** a restrained thin-line presentation.
- **Squiggly:** a more visibly varied curve while remaining bounded by the compact seek-bar canvas.

### How it works

1. `AudioAdapter` creates an `AnalyserNode` as part of the Web Audio graph when an effect needs it.
2. The seek-bar canvas is resized to its CSS viewport with a limited device-pixel ratio. Low-end mode caps it to a lower resolution.
3. Frequency data is stored in reusable typed arrays instead of creating new buffers per animation frame.
4. Drawing is clipped to the elapsed proportion `currentTime / duration`, so the waveform replaces the played section only. The unplayed part remains a separate thin timeline.
5. `requestAnimationFrame` is owned by a single loop. It is started when the effect should animate and cancelled when playback/player state requires it to stop.
6. While paused, the app can render one static frame rather than continuing to animate. Closing the player or turning the effect off clears the canvas.

The visualisation is a lightweight representation of analyser data, not a stored waveform computed from the entire audio file. It is intentionally not rendered as a giant background visualiser, because that would spend CPU/GPU resources without improving basic playback.

### Low-end considerations

The app caps the canvas height and uses reusable frequency buffers. In the Low-end profile, the target frame interval is reduced and the canvas uses a lower pixel ratio. Turning the effect Off avoids the continuous visualiser loop entirely. This option is recommended on older devices when battery life or smooth scrolling is more important than animation.

---

## 18. Lyrics engine

Lyrics are **lazy-loaded**. Changing songs updates player metadata immediately; the lyrics provider chain is invoked when the user opens lyrics mode or requests the lyrics flow. This prevents a failed lyrics API from blocking ordinary track playback.

### Lyrics resolution order

For the current track, the main resolver behaves in this order:

1. **Embedded lyrics** — lyrics read from the user's own audio file. If present, these take priority even if an older remote result is cached.
2. **In-memory lyrics cache** — result already resolved during this page session.
3. **IndexedDB lyrics cache** — saved result for the track ID.
4. **Optional Gemini identification** — only when enabled, online, keys are configured, and filename/title/artist heuristics indicate likely incomplete or noisy metadata. The result improves metadata for subsequent lookup; Gemini itself is not a lyrics provider.
5. **LRCLIB exact lookup** — query by title, artist, album and duration.
6. **LRCLIB search lookup** — if exact lookup fails, search for the candidate and accept a result only when title is normalised to a match, duration is compatible (within the defined tolerance when supplied) and artist is compatible where available.
7. **Render fallback** — request `GET https://gaana-suno-varna-machhar-aajayega.onrender.com/lyrics?track=TITLE&artist=ARTIST`.
8. **Optional LyricsPlus v2** — try the configured public host mirrors, with per-host timeouts, when LyricsPlus fallback is enabled.
9. **Unavailable message** — if no usable lyrics are found, present an unavailable result; the UI can offer Google search/song-detail links and automatically close the lyrics panel after its timeout.

The online order is deliberate: local material is free of network latency, LRCLIB exact/search requests are attempted before the Render service, and LyricsPlus is the timed final provider. A provider can be unavailable, rate-limited, blocked by CORS or return no matching result; the player must continue to work without it.

### Synced vs plain lyrics

- **Synced lyrics (LRC):** the parser extracts timestamps such as `[mm:ss.xx]`, associates text with the timestamp, and sorts entries by time. Audio time updates locate the active line; the container scrolls the active line toward the central reading area. Tapping a timed line can seek playback to that timestamp.
- **Plain lyrics:** shown as text without line-by-line time sync. These may come from embedded metadata or a provider response that has no timing data.

The app recognises multiple LRC timestamp shapes and converts fractional seconds to numeric seconds. Synced lyrics are useful for karaoke-style following but are not guaranteed to be word-synced; accuracy is determined by the source data.

### LyricsPlus integration

The current implementation calls a `/v2/lyrics/get` endpoint on a small list of public LyricsPlus host mirrors. Parameters include title, artist, album, duration and source names. The response can group words by line key and millisecond start time; Mujic groups those entries, builds line start timestamps and serialises them into LRC-style text. Where the API returns track metadata, the result is rejected if title or artist clearly mismatches the requested track.

LyricsPlus is optional and has bounded per-host timeouts. A public instance may change or stop working; the application cannot guarantee third-party uptime or provider source coverage.

### Cache rules

Successfully resolved lyrics are stored by track ID in IndexedDB and a memory cache is used for fast subsequent display. Embedded lyrics are written into the cache and always take precedence. An unavailable result is not considered a verified lyrics cache hit. Cached lyrics can be displayed offline; uncached remote lyrics cannot be fetched while offline.

### No-lyrics experience

When all available sources fail, the UI displays a friendly unavailable state instead of a developer-facing stack trace. It can provide **Search lyrics on Google** and **Song details** actions that open a separate tab. After the configured grace period, the lyrics panel closes automatically so the rest of the player remains accessible.

---

## 19. Experimental Gemini song identification

Gemini identification is an opt-in helper for cases where a local file has an ambiguous name or missing artist. It is not required for playback or ordinary lyrics lookup.

### Activation conditions

The feature is considered only when:

- `aiSongIdentification` is enabled;
- the browser reports an online connection;
- at least one non-empty Gemini key is saved;
- title, artist or filename heuristics suggest that the metadata is incomplete/noisy.

Examples of heuristic signals include `Unknown Artist`, generic titles such as `Track 01`, or numbered/recording-style filenames. Normal well-formed metadata should not be sent to Gemini unnecessarily.

### Data sent

The request includes text metadata, bounded in length:

- current title;
- artist;
- album;
- filename without the application uploading its file bytes;
- duration in seconds when known.

**The audio file itself is not uploaded to Gemini.** The browser builds a prompt that treats field values as data and asks for a JSON suggestion with title, artist, album and confidence.

### Acceptance rules

- Response must parse as JSON (with optional code fences removed).
- Title and artist must be non-empty and not generic unknown values.
- Confidence must be at least `0.68`.
- Values are bounded in length before being saved.
- The identified metadata is persisted to the track and then used for lyrics lookup.

This remains experimental. Models can confidently suggest the wrong song; users should check metadata and correct it if necessary. If AI fails or all keys fail, the normal lyrics provider chain continues.

### Configure up to four keys

Open **Settings → Lyrics & AI → Gemini API keys**:

1. Add one to four keys.
2. Save the list.
3. Optionally use **Test keys** to verify that Google accepts a request.
4. Enable **AI Song Identification (Experimental)** separately.

The key manager provides show/hide, add/remove, save and test actions. Duplicate keys are deduplicated and the list is capped at four. If a key is rejected, rate-limited or fails, the app rotates to the next key. A successful/attempted rotation updates the saved next-key index so repeated calls do not always start with the same key.

### Direct browser call: security implications

There is no Mujic API proxy. The browser calls Google's `generateContent` endpoint directly and sends the key in the `x-goog-api-key` header. The keys are stored locally in the browser's IndexedDB settings record. This avoids putting a secret in source code or shipping it inside the repository, but **IndexedDB is not an encrypted secret vault**. Anyone with access to the user's device, browser profile or DevTools can inspect values. Use only keys suitable for client-side use, restrict them in Google's console where possible, monitor usage, and rotate exposed keys. Mujic's Settings export intentionally omits the Gemini key list.

---

## 20. Listening history and statistics

Mujic maintains two related but distinct records.

### Recent play history

When playback starts for a track, `StorageAdapter.recordPlayHistory()` appends an entry with:

- an auto-increment `entryId`;
- `trackId` (when available);
- title, artist and album snapshots;
- `playedAt` timestamp in milliseconds.

The list is append-only through ordinary playback and can still show a snapshot if the current track is later removed from the library. The UI initially loads a bounded recent page and can load older pages using the cursor/pagination state, avoiding a huge render when the history becomes long.

### Aggregate play statistics

`Stats.recordPlay()` increments the selected local day’s play count and per-track play counts. On `timeupdate`, `Stats.consumeAudioDelta()` adds listening seconds only when playback is active and a small, positive time delta is observed. Large jumps (such as seeking) are not counted as real-time listened seconds. Writes are debounced using a save timer to avoid writing IndexedDB for every audio event.

Daily records have this shape:

```json
{
  "days": {
    "2026-10-11": {
      "plays": 4,
      "seconds": 932,
      "tracks": {
        "track-id-example": 2
      }
    }
  }
}
```

This is an illustrative schema. Track IDs are generated locally and the actual counts reflect the user's library.

### Summary periods

The Listening section computes:

- **Today:** current local calendar day;
- **This week:** the current day plus the preceding six calendar days;
- **This month:** every calendar day in the current local month;
- **All time:** all day records currently present in saved statistics;
- **Most played this month:** aggregate per-track play counts for the current month.

Listening time is converted to minute/hour labels for display. The statistics are local; there is no analytics upload. They persist inside the settings record and can be exported as JSON.

---

## 21. Themes and personalisation

Appearance settings map to persisted state and CSS classes/custom properties.

### Theme mode

- System Default follows `prefers-color-scheme`.
- Dark Mode applies the dark palette.
- Light Mode applies the light palette.

### Accent colours

The accent may be dynamically derived from artwork, selected from a named colour set or entered as a custom hex colour. Dynamic colour calculation is local and uses the artwork cache. Users can choose a fixed accent when they prefer consistent controls rather than a colour derived from each album art.

### Surface palettes

Dark surface options are OLED Black, Graphite, Midnight Blue, Warm Espresso and Forest. Surface palette and accent colour are separate settings: the surface changes the panel/background treatment; the accent changes selected buttons, highlights and active controls.

### Text and layout

- **Text Size:** Compact, Standard, Large.
- **Layout Density:** Compact, Comfortable, Spacious.
- **Corner Radius:** Sharp, Medium, Rounded, Extra Rounded.
- **Interface Style:** Liquid Glass subtle, Liquid Glass strong or solid/off.
- **Motion:** Full Motion or Reduced Motion.

These options are implemented mostly through CSS custom properties and class toggles, not by duplicating markup for every theme.

### Player presentation

- **Player Background:** Artwork Blur, Solid Muted, Deep Black.
- **Player Artwork:** Full Cover or Fit Inside.
- **Show Artwork List Icons:** show real artwork thumbnails in list rows or use compact generated placeholders.

The artwork-blur background uses the current artwork as a backdrop; it is independent of the seek-bar Audio Waveform. The Audio Waveform does not need a full-screen background canvas.

### Lyrics display

- **Lyrics Style:** Apple Music, Spotify or Neon Highlight.
- **Vertical Position:** Upper, Center or Lower.
- **Fine Position:** bounded vertical offset from `-8vh` to `+8vh`.
- **Text Size:** Compact, Standard, Large or Extra Large.
- **Line Spacing:** Compact, Balanced or Relaxed.
- **Text Width:** Narrow, Standard or Wide.
- **Active-line Emphasis:** Soft, Standard, Strong or Off.

Lyrics preferences are applied as CSS classes and custom properties so the same synchronized-lyrics data can be presented in different layouts without re-fetching it.

---

## 22. Performance profile for low-end devices

`performanceProfile` accepts `auto`, `low-end` or `full`.

### Auto mode

The UI checks available browser hints:

- `navigator.hardwareConcurrency` (logical core count);
- `navigator.deviceMemory` where exposed;
- the OS/browser `prefers-reduced-motion` media query.

A reported core count at or below four, reported device memory at or below four gigabytes, or a reduced-motion preference can activate the constrained profile. These are heuristics; not every browser exposes hardware hints and the hints are not a full benchmark.

### Low-end profile changes

- adds the `low-end-mode` class for lower-cost visual styling;
- lowers the waveform canvas device-pixel ratio to 1;
- increases waveform frame interval (lower target frame rate) while active;
- warms artwork in smaller batches and waits longer between batches;
- works with Reduced Motion and solid interface styles to reduce transitions and backdrop filters.

### Practical recommendations

For a phone with limited RAM or an older GPU:

1. Set **Performance Profile → Low-end device** if Auto is not enough.
2. Set **Audio Waveform → Off** if the animated seek bar is not important.
3. Set **Motion → Reduced Motion** and **Interface Style → Solid / Off**.
4. Avoid enabling several audio-processing features at once unless needed.
5. Close other browser tabs if the device is memory constrained.

These settings reduce optional rendering/processing work; they cannot improve the decoding speed of an unsupported codec or prevent the operating system from suspending a PWA in the background.

---

## 23. IndexedDB storage model

Mujic opens database **`MujicDB` version `6`**. `onupgradeneeded` creates missing object stores; the database remains in the browser profile for the site's origin.

| Store | Key strategy | Content | Used by |
|---|---|---|---|
| `tracks` | `id` keyPath | Track metadata and tags | Library, player metadata, search, artist/album grouping |
| `audioBlobs` | Track ID as explicit key | Original imported audio `Blob`/`File` | Offline playback and re-import restoration |
| `artworks` | Artwork ID as explicit key | Extracted picture blobs | Row/album/artist artwork and player display |
| `settings` | Explicit keys (`app_state`) | Preferences, queue restoration, favourites, play stats and up to four Gemini keys | Startup restore and Settings persistence |
| `playlists` | `id` keyPath | Playlist name/order and track ID arrays | Playlist list, detail, reorder/import actions |
| `lyricsCache` | Track ID as explicit key | Lyrics text, synced flag and parsed/cache data | Offline lyrics and faster display |
| `playHistory` | Auto-increment `entryId` | Append-only track-start snapshots and timestamps | History sheet/pagination |

### Track metadata record

A track record can include these fields, where available:

- `id`
- `fileName`, `format`, `mimeType`, `fileSize`
- `title`, `artist`, `album`, `albumArtist`
- `genre`, `year`, `trackNumber`, `discNumber`, `composer`
- `lyrics`
- `artworkId`, `pictureType`
- `duration`, `dateAdded`
- optional AI identification metadata such as `aiIdentified` and confidence where generated

Not every field exists for every file. The metadata record does not store the full audio byte stream; that is stored separately in `audioBlobs`.

### Settings record

The settings store uses key `app_state`. The serialised object includes favourites, favourite artists, history IDs, queue/current track, volume/mute, shuffle/repeat, playback rate, EQ preset/bands, theme/accent/surface/text/layout, performance profile, lyrics presentation, player presentation, waveform settings, Resume Playback position, sort preferences, artwork-list preference, listening stats, optional playback effects, seek settings, LyricsPlus flag and the bounded Gemini key array/key rotation index.

The Gemini key values in IndexedDB are locally persistent but inspectable by anyone who can access the browser profile. They are deliberately left out of Settings JSON export.

### Clearing browser data

Because audio and library data are origin-specific browser storage, clearing site data, using a different protocol/host/port, switching browser profiles or uninstalling some browsers' storage environments can make the local library unavailable. An offline library is not automatically synchronised between devices. Exporting settings/statistics is not a backup of the audio blobs themselves.

---

## 24. Offline behaviour and service worker

Offline support is implemented by **two complementary storage paths**:

1. **IndexedDB** stores user content and app state: audio, track metadata, artwork, playlists, lyrics cache, preferences, statistics and play history.
2. **Service worker Cache API** stores the application shell and selected static resources: HTML, CSS, JavaScript, manifest, icons, changelog and eligible font resources.

The service worker does not cache all imported audio as fetch responses. Playback loads local audio blobs directly from IndexedDB. This separation avoids trying to duplicate the user's media library inside the service-worker cache.

### Service worker install

`sw.js` opens a versioned cache named similarly to `mujic-pwa-v12.0.5-local-gemini-low-end` and attempts to add all app-shell entries. A single failed app-shell item should not abort the entire installation. The worker calls `skipWaiting()` after the install-cache operation.

### Service worker activation

At activation, it deletes old cache keys beginning with `mujic-pwa-` except for the current cache, then claims clients. Bumping `CACHE_NAME` during releases allows old static assets to be replaced.

### Fetch strategy

- **Navigation request:** network first; a successful response can update the cached `index.html`. If network access fails, return the cached navigation response or cached app shell.
- **Same-origin non-navigation assets:** cache first, then fetch and cache a successful response. If the network request fails, use the cached item.
- **Google Fonts CSS/files:** eligible for the same runtime cache path.
- **Other remote hosts:** the service worker does not intercept them. Lyrics/Gemini requests therefore still need network access and may fail while offline.

### Offline feature matrix

| Feature | Works offline after required data is present? | Notes |
|---|---|---|
| Play an imported track | Yes | Requires the audio blob to remain in IndexedDB and the browser to support the codec. |
| Library/playlist browsing | Yes | Metadata and playlists are local. |
| Theme/settings | Yes | Persisted in IndexedDB. |
| Favourites and history display | Yes | Local records. |
| Listening stats | Yes | Recorded locally and saved with debounced writes. |
| Embedded lyrics | Yes | Extracted during import when metadata exposes them. |
| Previously cached lyrics | Yes | Retrieved from `lyricsCache`. |
| First-time online lyrics | No | A remote provider cannot be reached offline. |
| Gemini AI identification | No | Requires Google access, a valid key and network connection. |
| PWA installation | Requires HTTP/HTTPS | Browser's install/service-worker rules apply. |

---

## 25. PWA installation

The manifest defines:

- `name` and `short_name`: Mujic;
- `start_url`: `./index.html?source=pwa`;
- `scope`: `./`;
- standalone display mode and a supported display override;
- portrait-primary orientation preference;
- theme/background colors;
- 192×192 and 512×512 PNG icons.

`UI.setupInstallPrompt()` listens for the `beforeinstallprompt` event when supported. When the browser provides a deferred prompt, the Install button can display the native installation flow. When already running standalone, the button reports that the app is installed. On iOS, where the browser may not provide the same prompt event, the UI shows Safari's **Share → Add to Home Screen** instructions.

### Correct launch method

Use an HTTP or HTTPS origin. On Windows, run `start-mujic.bat`. Elsewhere, from the project directory:

```bash
python -m http.server 3000
```

Then open `http://localhost:3000`. Opening `index.html` with `file://` is not a supported way to test PWA installation; browsers block service workers and manifest fetches from that origin. Basic markup may render, but installability and same-origin browser features will not behave like a hosted PWA.

For production hosting, deploy the project root so the paths `./css/app.css`, `./js/...`, `./manifest.webmanifest`, `./sw.js`, `./icons/...` and `./changlog.json` resolve under the same scope. Use HTTPS.

---

## 26. Media Session, lock-screen controls and wake lock

### Media Session metadata

When a track changes, Mujic updates browser `navigator.mediaSession.metadata` when available. Metadata contains title, artist, album and artwork variants. This allows supporting operating systems to show track information in lock-screen/media controls and system media surfaces.

### Action handlers

The app registers Media Session handlers for supported actions such as:

- play and pause;
- previous and next track;
- seek backward and forward;
- seek to an explicit time.

The configured seek increment is used for backward/forward actions. Progressive seek can enlarge the amount when several seeks happen rapidly. The engine updates position state when the browser supports it.

### Browser variance

Media Session support differs across browsers and installed PWAs. Some browsers expose only part of the action set; some operating systems control background execution and may suspend a tab. The app can request and report support but cannot override OS power-management policies.

### Wake Lock

When enabled and supported, Mujic requests a screen wake lock while the full player is open/visible and re-establishes it when the document becomes visible. The lock can be denied or released by the browser/system. This should not be interpreted as a guarantee that audio can run forever in the background.

---

## 27. Settings reference

This section lists the main configuration groups exposed in v12.0.5 and how they affect the application.

### UI & Customization

| Setting | Values / behaviour |
|---|---|
| Theme | System, Dark, Light. Applies the page's color scheme. |
| Accent Color | Dynamic artwork accent; named presets; or custom colour input. |
| Dark Surface Palette | OLED Black, Graphite, Midnight Blue, Warm Espresso, Forest. Separately changes dark surfaces. |
| Text Size | Compact, Standard, Large. |
| Layout Density | Compact, Comfortable, Spacious. |
| Performance Profile | Auto, Low-end device, Full visuals. |
| Interface Style | Liquid Glass subtle, Liquid Glass strong, Solid/Off. |
| Corner Radius | Sharp, Medium, Rounded, Extra Rounded. |
| Motion | Full Motion or Reduced Motion. |
| Player Background | Artwork Blur, Solid Muted, Deep Black. |
| Player Artwork | Full Cover or Fit Inside. |
| Show Artwork List Icons | Show embedded art thumbnails in track lists or use placeholders. |
| Restore default appearance | Resets selected appearance preferences to their defaults. |

### Player & Audio

| Setting | Effect / dependency |
|---|---|
| Audio Waveform | Off or an enabled seek-bar visual effect. Web Audio analyser support is required for live audio reactivity. |
| Seek bar effect style | Default, Wavy, Slim, Squiggly. Choosing a style selects Audio Waveform. |
| Resume Playback | Saves the last track/position and attempts to restore the local queue/position on next startup. |
| Soft track transitions | Short master-gain fade around track changes; no simultaneous song overlap. |
| Skip long silence | Uses analyser energy to detect sustained near-silence. Requires analyser/Web Audio support. |
| Instantly skip silence | Shorter threshold/larger skip, only while Skip long silence is enabled. |
| Loudness control | Dynamics compressor for more controlled peaks. |
| Loudness profile | Soft, Balanced or Strong compressor settings. |
| Auto-skip unsupported tracks | Attempt to continue queue on decoding/playback failure. |
| Prevent duplicate queue items | Refuse to add an ID already in playback order. |
| Preserve pitch | Request pitch preservation at changed speed if supported. |
| Varispeed | Pitch follows playback rate; overrides preserve-pitch behaviour. |
| Progressive seek | Increases Media Session seek size during rapid repeated presses. |
| Pause when muted | Pauses if volume is muted or set to zero. |
| Stop on page exit | Pauses on `pagehide` when that event is delivered. |
| Keep screen awake | Requests Wake Lock if browser support permits it. |
| Seek increment | 5, 10, 15 or 30 seconds for Media Session seeking. |
| Hardware audio offload | Informational only; actual offload is controlled by the browser and OS. |

### Lyrics & AI

| Setting | Effect / dependency |
|---|---|
| LyricsPlus fallback | Enable/disable the final LyricsPlus request. Requires network. |
| AI Song Identification | Experimental; only runs for incomplete/noisy metadata and with saved Gemini key(s). |
| Gemini API keys | Manage up to four locally stored browser keys, test requests and fallback rotation. |
| Lyrics Style | Apple Music, Spotify, Neon Highlight. |
| Vertical Position | Upper, Center, Lower. |
| Fine Position | Offset bounded to `-8vh` through `+8vh`. |
| Lyrics text size | Compact, Standard, Large, Extra Large. |
| Line spacing | Compact, Balanced, Relaxed. |
| Text width | Narrow, Standard, Wide. |
| Active-line emphasis | Soft, Standard, Strong, Off. |

### Library & Listening

| Setting | Effect |
|---|---|
| Sort Library By | Recently Added, Title, Artist, Album. |
| Sort Direction | Descending or Ascending. |
| Show Artwork List Icons | Same preference as Appearance; controls real artwork thumbnails in lists. |
| Your Listening | Shows Today/Week/Month/All Time and most played this month. |
| Export Settings | Downloads a JSON subset of preferences and player settings, excluding Gemini keys. |
| Export Listening Stats | Downloads listening statistics plus stored play-history records as JSON. |

### App & About

| Setting | Effect |
|---|---|
| Install Mujic | Opens the native install prompt where available or shows platform instructions. |
| Library Size | Estimates binary audio/artwork storage usage. |
| Clear All | Removes library audio, artwork, metadata, playlists, settings, lyric cache and play history from the database. This is destructive. |
| Change & Update Log | Loads release entries from `changlog.json`; has a built-in fallback. |
| Version/About | Shows the current app version and creator attribution. |

---

## 28. Data export, deletion and recovery

### Export Settings

Exports a JSON file containing a supported subset of settings, appearance, lyrics presentation and player configuration. It intentionally excludes Gemini API keys so users are less likely to share them accidentally. It is **not a complete database export** and does not include audio blobs, cover-art blobs, full metadata objects or playlist audio files.

### Export Listening Stats

Exports locally recorded listening statistics and play-history information as JSON. This is useful for keeping a copy of listening insights, but it does not back up the songs themselves.

### Clear All

The Clear All action requires confirmation before clearing the IndexedDB stores: `tracks`, `audioBlobs`, `artworks`, `playlists`, `settings`, `lyricsCache` and `playHistory`. Once cleared, local content cannot be restored unless the user separately kept copies of the original music files. This action is not an undoable trash operation.

### Manual backup recommendation

Because the app deliberately avoids cloud uploads, users should keep the original audio files in a separate folder or drive. Settings/stats JSON can be exported separately. A future complete backup/import feature would need to handle binary audio, artwork blobs, schema versioning and storage quota constraints; settings export alone is not a full backup.

---

## 29. External services and network behaviour

The player itself is local. The following are optional or supporting network integrations:

| Service | When called | Purpose | Required for local playback? |
|---|---|---|---|
| Google Fonts | Browser loads app fonts, subject to cache/network availability | Inter and Material Symbols visual assets | No; system fonts can provide fallback. |
| jsDelivr `music-metadata-browser` | When importing metadata and library is not already loaded | Primary metadata parser | No; fallback metadata parsing is available. |
| cdnjs `jsmediatags` | Parser fallback during import | Alternate metadata parser | No; filenames still provide limited fallback. |
| LRCLIB | Lyrics request; sometimes guarded missing-artist import enrichment | Exact/search lyrics and cautious metadata completion | No. |
| Render lyrics endpoint | Lyrics request after LRCLIB fails | Additional lyrics fallback | No. |
| LyricsPlus API mirrors | Lyrics request after other sources fail and fallback is enabled | Additional synchronized lyric candidates | No. |
| Google Gemini API | Only when AI identification is enabled, its heuristics match and a key is available | Suggest likely title/artist/album based on text metadata | No. |

### Timeouts and fallbacks

`LyricsFetcher.fetchWithTimeout()` applies a bounded wait and uses `AbortController` where supported. Individual provider timeouts vary according to the request. LyricsPlus host requests use short limits and are started as a race so the first valid response can win. Requests are deliberately not performed during ordinary app startup.

### CORS and service availability

The browser requires the remote provider to permit cross-origin requests. A host being online does not guarantee that the browser can call it. Public mirrors may change paths, impose rate limits, be blocked by networks or change response schemas. Mujic catches provider failures and continues down the fallback path; no provider is guaranteed by this repository.

### What is not sent

Mujic does not upload audio blobs to its lyrics services. Lyrics requests contain text search parameters (typically title and artist, with album/duration for relevant providers). The optional Gemini identification sends file metadata text only, not the audio file. The app has no built-in analytics endpoint or account backend.

---

## 30. Privacy and security model

Mujic is designed to keep the music collection in the browser profile, not on a Mujic-owned server. That does not make every operation completely offline or make local browser storage cryptographically secure.

### Local data

Audio, metadata, artwork, playlists, preferences, lyrics cache, listening stats and play history are stored under the web origin in IndexedDB. Different origins such as `localhost:3000`, a deployed HTTPS domain and a different port are separate storage partitions. Clearing site data can remove the library.

### Gemini key safety

- The key is not shipped as a literal in `index.html` or other source modules.
- The key is stored in IndexedDB on the device and sent directly to Google in an API header when the feature is used.
- Someone with access to the device/browser profile/DevTools can inspect it.
- Settings export omits keys, but browser storage is not an encrypted vault.
- Do not commit live API keys into Git history, even if the project is intended for personal use.
- Restrict keys through the provider console where possible; rotate a key if exposed.

### Imported file safety

Metadata-derived text is escaped before being inserted into HTML templates where applicable. Generated artwork is local SVG content. External API responses can still be malformed or unavailable, so new provider integrations should validate structure and never execute provider text as markup or script.

### No claim of total anonymity

When a user requests remote lyrics or Gemini identification, those services receive request information. The browser and host/network may also log standard request metadata. Mujic does not claim that third-party providers are anonymous or that a direct API call leaves no network traces.

---

## 31. Audio-format and browser compatibility

Mujic can import files based on audio MIME type or the extension allowlist, but actual playback is delegated to the browser's media engine. MP3 and common browser-native formats are widely supported; support for AAC/M4A, FLAC, Opus, OGG, AIFF, ALAC and other combinations varies by browser, OS build and codec licensing/implementation.

| Capability | Browser dependency |
|---|---|
| Audio decode/playback | HTML media element and codec support |
| Persistent library | IndexedDB and available storage quota |
| Offline app shell | Service Worker + Cache API, served over HTTP/HTTPS |
| PWA install | Browser-specific install criteria and manifest support |
| EQ and loudness | Web Audio API and user-gesture/audio-context permissions |
| Seek-bar waveform | Web Audio analyser, canvas and animation frames |
| Lock-screen actions | Media Session API implementation |
| Keep-screen-awake | Screen Wake Lock API availability/permission |
| Output device selection | `enumerateDevices` and `setSinkId` support |
| Install prompt | `beforeinstallprompt` where implemented; iOS uses manual Add to Home Screen |
| Dynamic artwork accent | Canvas access for readable image data; cross-origin restrictions can limit it |

### Mobile caveats

Browsers on mobile can suspend background pages, revoke wake locks, constrain audio contexts, change viewport height as browser chrome expands/collapses, and differ in volume API behaviour. The UI includes safe-area and responsive rules, but no PWA can force the OS to provide a native background service equivalent on every platform.

---

## 32. Run the project locally

### Requirements

- A modern browser with IndexedDB and HTML media support.
- Python 3 for the included static local server, or another local HTTPS/HTTP static host.
- Node.js only if you want to run the package's `npm run check` syntax script.
- Internet for online lyrics/Gemini/font/parser requests; not needed for previously imported local audio itself.

### Windows

1. Extract the repository ZIP.
2. Double-click `start-mujic.bat`.
3. The launcher starts Python's static server on loopback and opens `http://127.0.0.1:3000/index.html`.
4. Leave the server process running while using that local site.

### macOS, Linux or another shell

Open a terminal in the project root:

```bash
python3 -m http.server 3000
```

Then browse to:

```text
http://localhost:3000
```

On Windows, the equivalent can be:

```powershell
py -m http.server 3000
```

### Package scripts

```bash
npm start       # Runs Python's static server on port 3000
npm run check   # Runs Node syntax checks across JS files and sw.js
```

This is a static PWA. The Python server only serves files; it is not a custom backend, does not read API keys, and does not proxy Gemini requests.

### Deploy to a static host

Publish the **contents of the project root** to the hosting root. Do not publish only `index.html`; the CSS, JS modules, icons, manifest, service worker, changelog and license/readme should remain at the paths shown in the repository tree. Configure HTTPS. After a release changes `sw.js` or the cache version, clients can fetch the new shell and replace the previous cache on worker activation.

---

## 33. Development workflow and checks

### Suggested change workflow

1. Identify whether the feature belongs to UI (`ui.js`/`app.css`), playback (`player.js`), import/library (`library.js`), persistence (`storage.js`), lyrics/network (`lyrics.js`) or startup (`app.js`).
2. Add/update the state field in `core.js` only if a durable or shared preference is genuinely needed.
3. If the field must persist, add both save and load handling in `storage.js`, including default values and validation for legacy state.
4. Add the Settings control with `data-setting` or a delegated `data-action` if it is a user-facing feature.
5. Connect the control to working engine behaviour; don't add controls that merely change their displayed label.
6. Add or update changelog entries and README documentation.
7. Increment the service-worker `CACHE_NAME` when the static shell changes in a release.
8. Run syntax/JSON/asset checks and test the affected workflow in at least one desktop and one mobile browser.

### Automated syntax check

With Node.js installed:

```bash
npm run check
```

The script runs `node --check` for `sw.js` and every ordered JavaScript module. It catches syntax errors but does not prove runtime interactions work correctly.

### Manual smoke-test checklist

- [ ] Open the app over `http://localhost:3000` without console errors.
- [ ] Import a small audio file and confirm it appears in Library.
- [ ] Reload the page and confirm the track remains listed.
- [ ] Disconnect the network and play the imported file.
- [ ] Test play/pause, seek, volume, next/previous, shuffle/repeat and queue reorder.
- [ ] Start playback from Home, Search, Library, an artist, an album and a playlist; verify Next and Previous in each context.
- [ ] Create, rename, reorder, populate and delete a playlist; verify deleting a playlist doesn't delete the songs.
- [ ] Check a file with embedded lyrics, a cached lyrics track, an online provider hit and a no-lyrics state.
- [ ] Test synced lyric auto-scroll and tapping a timed lyric line.
- [ ] Enable/disable each visualizer mode, pause playback and close the full player; confirm the animation loop stops appropriately.
- [ ] Test EQ presets and individual sliders with Web Audio enabled.
- [ ] Confirm settings persist after reload and theme/low-end profiles affect the UI.
- [ ] Test Gemini key save, hide/show, key test, bad-key fallback and metadata-only identification using a non-sensitive sample.
- [ ] Verify JSON exports do not include Gemini keys.
- [ ] Install the PWA where supported, go offline, reload and verify the app shell and imported music.
- [ ] Test the mobile mini-player/navigation overlap, safe areas and lyrics layout on a real device.

---

## 34. Troubleshooting

### The page opens but CSS or scripts are missing

Make sure you served the project **root** and did not move `index.html` away from `css/` and `js/`. Open DevTools → Network and check for 404 responses. Use a static HTTP server, not an editor preview that changes the document base path unexpectedly.

### The manifest/service worker is blocked

A `file:///` origin is not a supported PWA origin. Start the static server and use `http://localhost:3000` or an HTTPS deployment. The manifest and worker must resolve under the same origin/scope as the app.

### Music is visible but does not play

- Verify the audio blob exists by re-importing the original file if necessary.
- Check whether the browser supports the file's codec.
- Inspect the browser console for media decode errors.
- Try a known-good MP3/WAV test file to separate a codec problem from a library/player problem.
- Confirm the browser was allowed to start audio after a user gesture.

### Library is empty after changing the URL

IndexedDB storage is origin-scoped. `http://localhost:3000` and `http://127.0.0.1:3000` are different origins, and a deployed domain is different again. Return to the original origin/profile or re-import the original audio files. Settings export does not contain the audio library.

### Metadata is incomplete

The file may lack tags or its metadata parser may be unavailable offline. Check the file name format; `Artist - Title.ext` can be used to recover some basic information. Online missing-artist enrichment is attempted only when title/duration match constraints can be checked. AI identification is optional and may be wrong.

### Lyrics are unavailable

1. Check whether the track contains embedded lyrics.
2. Check whether the lyrics have already been cached.
3. Check internet access and provider CORS/availability.
4. Enable LyricsPlus only if you want that fallback.
5. If metadata is ambiguous, correct the title/artist or opt into experimental Gemini identification.
6. Remember: local playback may work offline while a first-time online lyric lookup cannot.

### Gemini key test fails

- Confirm the key is saved and AI Song Identification is enabled for identification (key testing is separate).
- Confirm the browser is online and Google API access is available for that key/model.
- Check quota, restrictions and billing/free-tier status in the provider's console.
- Try another saved key; Mujic will rotate keys when a request fails.
- Review DevTools Network for the response status but do not post the full key in an issue or screenshot.

### Audio Waveform / EQ does not activate

Web Audio can require a direct user gesture and may be suspended. Start playback first, then enable the effect. Some browsers reject an audio graph for particular environments. Turn the effect off to return to ordinary media playback if analyser processing is unavailable.

### PWA serves an old version

The service worker intentionally caches static app files. Ensure the deployed `sw.js` has the current versioned cache name, then reload/reopen the app. During development, DevTools → Application → Service Workers/Cache Storage can be used to inspect the active worker and cache. Use the browser's update/unregister controls only as a debugging step, since clearing site data also removes the local library.

### Storage quota errors or missing offline content

Large audio libraries can exceed a browser's storage quota or be evicted by a browser/OS policy. The app requests persistent storage where supported but the browser decides whether to grant it. Keep the original audio files separately, and avoid clearing site storage unless you understand that the local collection is stored there.

---

## 35. Extension points for contributors

### Add a new preference

1. Add a conservative default in the `State` object in `js/core.js`.
2. Persist it in `StorageAdapter.saveSettings()`.
3. Load it in `StorageAdapter.loadSettings()` and validate its permitted values so old settings remain safe.
4. Add the appropriate UI control and a stable `data-setting` key in `index.html`.
5. Implement behaviour in the owning module (`ui.js` for presentation, `player.js` for audio, etc.).
6. Ensure `UI.applySettings()` applies it on startup and when changed.
7. Add documentation/changelog and test persistence across a reload.

### Add a new lyrics provider

Place the integration in `js/lyrics.js`. It should:

- receive a normalised title/artist and available album/duration metadata;
- use a bounded timeout and abort where supported;
- validate the response shape before reading lyric text;
- verify title/artist/duration when the provider supplies metadata;
- identify whether data is synced or plain;
- never execute response text as HTML or JavaScript;
- fail closed to the next source instead of blocking playback/startup;
- integrate with existing cache semantics and the unavailable-lyrics UI.

### Add a player effect

Implement the DSP/transport work in `js/player.js`, keep the UI control in `index.html` and handlers in `js/ui.js`, and add the saved preference to `State` and `StorageAdapter`. Decide whether the effect requires Web Audio. Prefer no allocation in high-frequency events; reuse buffers/nodes, throttle expensive work and cancel animation loops when the effect is not running.

### Add a visual UI component

Use the existing design tokens and action/settings conventions. Keep mobile touch targets comfortable, use safe-area variables, and ensure desktop layouts do not inherit mobile-specific positioning that clips content. Avoid adding another CSS override if the existing component can be corrected at its source. Respect `Reduced Motion` and Low-end Device Mode.

### Add a data schema field/store

IndexedDB currently opens at version 6. If a new store is required, increase the database version and add the store in `onupgradeneeded`. IndexedDB upgrades can fail if another tab has the database open; test both clean-install and upgrade scenarios. If only adding a field to existing records, keep load paths tolerant of undefined values from older installations.

---

## 36. Known limits and honest expectations

- **Browser codec support varies.** Import acceptance doesn't mean every browser can decode every format.
- **IndexedDB is local browser storage, not a cloud backup.** Data can be lost by quota eviction, browser data clearing or changing origins.
- **Gemini keys are locally stored, not encrypted.** Device/browser access means the keys can be inspected.
- **Gemini is experimental.** Song identification is probabilistic and should not silently be treated as authoritative metadata.
- **Lyrics providers are external dependencies.** CORS rules, uptime, rate limits and API response changes can affect lyrics independently of playback.
- **PWA APIs differ.** Install prompts, Media Session, Wake Lock, audio output selection and background behaviour vary by browser and OS.
- **Audio processing may affect sound and CPU.** EQ, loudness compression, silence skipping, analyser effects and varispeed use additional processing. Turn them off on slow devices if needed.
- **Crossfade is not a two-track mix.** It is a short volume fade around a transition.
- **Statistics are best-effort local metrics.** They reflect successful play starts and observed small audio-time deltas; they are not a server-certified audit of listening activity.
- **Static hosting is enough for the app.** There is no required application server, but online features still call their respective remote services directly.

---

## 37. Release notes

The in-app **Change & Update Log** reads [`changlog.json`](./changlog.json). The misspelled filename is the path used by the current app and service worker; keep it as-is unless both references are updated together.

### v12.0.5 — Local Gemini keys and performance profile

- Added the Settings key manager for up to four browser-local Gemini API keys with hide/show, save, testing and fallback rotation.
- Removed the custom Gemini proxy; AI identification now calls Google directly from the browser.
- Added Auto / Low-end / Full performance profiles, lower waveform render cost on constrained devices, smaller artwork warm-up batches and removal of duplicate Web Audio setup.

### v12.0.4 — Production polish and settings organisation

- Added low-end presentation profile adjustments and reduced costly blur/shadow/motion work.
- Moved lyrics presentation controls into the dedicated Lyrics Display category.
- Added changelog fallback content so release notes can render when the changelog request fails.
- Updated the service-worker cache version.

### v12.0.3 — Waveform and lyrics layout refinement

- Reduced waveform size/amplitude/frequency and refined the played-section rendering.
- Added configurable lyrics position, fine offset, text size, line spacing, width and active-line emphasis.
- Refined mobile lyrics spacing/scrolling.
- Added the file-based Change & Update Log.

### v12.0.2 — Settings and theme refinement

- Added settings grouping and expanded personalisation.
- Began the experimental AI metadata-identification workflow. The current v12.0.5 implementation is client-only; earlier release-note wording may refer to the prior proxy implementation.

Always treat `changlog.json` in the checked-out version as the source of the current release notes.

> **Release housekeeping note:** in the v12.0.5 source inspected for this README, `package.json`, `VERSION`, the PWA cache name and `changlog.json` identify the release as `12.0.5`, while the small footer string in `index.html` still says `Version 12.0.4`. The package metadata and version files agree on 12.0.5; update that footer text in a follow-up source change to make every visible version label consistent.
---

## 38. Contributing

Issues and pull requests are welcome. To keep changes maintainable:

1. Describe the user-facing problem and the affected device/browser.
2. Keep changes focused on the owning module; avoid cross-cutting inline patches where a module already exists.
3. Document new settings, storage fields, network calls and permissions.
4. Do not include real Gemini keys, private music files or personal listening data in issues/commits.
5. Include steps to reproduce and, for UI changes, screenshots at both small mobile and desktop widths.
6. Run `npm run check`, validate JSON assets and test PWA/offline behaviour if the service worker or app shell changed.
7. Add a release note to `changlog.json` when behaviour changes.

### Suggested issue template fields

- Mujic version (`VERSION`)
- OS and browser/version
- Device or approximate hardware class
- Installed PWA or browser tab
- Online/offline state
- Steps to reproduce
- Expected behaviour
- Actual behaviour and console/network error with secrets removed

---

## 39. License and credits

Mujic is distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for the complete text. In brief, it permits use, copying, modification, merging, publication, distribution, sublicensing and sale, subject to retaining the copyright notice and permission notice. The software is provided “as is” without warranty, as stated in the license.

**Copyright © 2026 Ashutosh Roy (Mackkar).**

### Credits and external projects

- [LRCLIB](https://lrclib.net/) — lyrics search/exact lookup integration.
- [LyricsPlus](https://github.com/ibratabian17/lyricsplus) — optional synchronized lyrics API integration.
- [Google Gemini API](https://ai.google.dev/) — optional experimental text-metadata song identification.
- [music-metadata-browser](https://github.com/Borewit/music-metadata-browser) — optional metadata parsing dependency loaded on demand.
- [jsmediatags](https://github.com/aadsm/jsmediatags) — alternative metadata parser loaded when needed.
- Google Fonts — Inter and Material Symbols assets, with local/system fallback behaviour depending on availability.

The names and services above remain the property of their respective owners. Their API availability and terms can change independently of Mujic.

---

## Final note

Mujic is intended to make a personal music library feel dependable and uncluttered, especially on devices where large apps and constant background activity are undesirable. The app keeps playback and library data local, uses remote services only for optional enrichment, and exposes controls so users can choose how much visual and audio processing they want.

If you use, fork or improve Mujic, keep the MIT notice, avoid publishing API keys, and please document any changes to storage, provider order, or browser permissions so the next maintainer can understand the full flow.
