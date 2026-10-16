# Mujic

**Mujic** is a lightweight, ad-free, offline-first music player for audio files you choose from your own device. It runs in the browser and can be installed as a Progressive Web App (PWA). No account is required.

**Version:** 12.0.19 · **License:** [MIT](LICENSE) · **Creator:** Ashutosh Roy (Machhar)

<p align="center">
  <a href="https://royverse69.github.io/mujic/">Open the player</a> ·
  <a href="https://mujicapp.netlify.app/">Landing page</a> ·
  <a href="https://royverse69.github.io/mujic/FEATURES.html">Full feature guide</a> ·
  <a href="https://royverse69.github.io/mujic/FEATURES.html#terms">Terms & conditions</a> ·
  <a href="https://royverse69.github.io/mujic/FEATURES.html#privacy-policy">Privacy policy</a>
</p>

## What it does

- **Local music library:** import audio files, read available tags and artwork, browse songs/albums/artists, search, sort, and manage playlists.
- **Playback:** queue, play next, shuffle, repeat, favourites, seeking, volume, playback speed, resume, and media-session controls where supported.
- **Audio tools:** equalizer presets and bands, waveform styles, visualizer, sleep timer, soft transitions, loudness control, and silence skipping.
- **Lyrics:** embedded and cached lyrics first, then configurable online providers including LRCLIB, a community-hosted Render endpoint, and an optional LyricsPlus fallback.
- **Personalization:** Liquid Glass-inspired UI, themes, accent and text settings, layout controls, reduced motion, player/lyrics layouts, and configurable keyboard shortcuts.
- **History and data:** listening statistics, history, settings/statistics JSON import and export, and library storage management.
- **Offline-first PWA:** cached app shell and local browser storage; actual behavior depends on browser support, storage availability, and whether optional resources have been cached.

For the complete guide—including settings, feature-by-feature explanations, troubleshooting, network disclosures, **Terms & Conditions**, and the **Privacy Policy**—open **[FEATURES.html](https://royverse69.github.io/mujic/FEATURES.html)**. Each section has its own shareable link. The guide is deliberately kept in the repository root so it can be opened directly from GitHub Pages.

## Run locally

Requires Python 3 (or another static HTTP server):

```bash
npm start
```

Open <http://localhost:3000>. On Windows, you can also run `start-mujic.bat`. Use HTTPS or localhost for service-worker/PWA features; opening `index.html` with `file://` is not equivalent.

## Checks

```bash
npm run check
```

The checks cover JavaScript syntax and custom action-coverage, settings-consistency, and queue-regression scripts. They are useful smoke checks, not a substitute for full browser/end-to-end testing.

## Project structure

| Path | Purpose |
|---|---|
| `index.html` | Main player layout, views, dialogs, sheets and settings controls |
| `FEATURES.html` | Searchable documentation, section sharing, terms and privacy policy |
| `css/app.css` | Application styles and responsive UI |
| `js/core.js` | Shared state and utilities |
| `js/storage.js` | IndexedDB persistence, settings, playlists, history and statistics |
| `js/library.js` | Audio import, metadata parsing and library/playlist operations |
| `js/player.js` | Playback engine, queue, equalizer, effects, visualizer, sleep timer and media session |
| `js/lyrics.js` | Lyrics provider lookup, cache handling and LRC parsing |
| `js/ui*.js` | Player, library, settings, search, lyrics, history and event-driven UI |
| `js/keyboard.js` | Keyboard shortcuts and drag-and-drop import |
| `js/vendor-loader.js` | Loads optional metadata parsing code on demand |
| `sw.js`, `manifest.webmanifest` | Service-worker cache and PWA metadata |
| `scripts/` | Custom repository checks |

The app uses classic scripts that share global objects; keep their order in `index.html` intact unless you update and test dependencies.

## Privacy and third-party services

The player does not require an account. Selected audio and app data are stored in browser storage for the current website origin; clearing site data may delete them. Settings/statistics exports do **not** include the audio files themselves. Online font/CDN requests may occur, and lyric lookups can send track metadata to the selected provider. The community Render endpoint and LyricsPlus are independent services, not operated or guaranteed by the project. See the detailed [Privacy Policy](https://royverse69.github.io/mujic/FEATURES.html#privacy-policy) and [Network & privacy section](https://royverse69.github.io/mujic/FEATURES.html#network).

## External downloads and lyrics

External music links and lyrics providers are optional third-party integrations. The project does not host a music catalogue or grant rights to files returned by external websites. **You are responsible for confirming that any download, lyric, or other material you obtain or use is lawful and appropriately licensed in your jurisdiction.** Review third-party destinations and their terms before using them. Read the detailed [Terms & Conditions](https://royverse69.github.io/mujic/FEATURES.html#terms), especially the sections covering downloads, copyright, lyrics, external services, disclaimers, and liability.

## Known limitations

- Playback depends on browser/OS codec support; accepting a file does not guarantee it will play.
- Metadata parsing may load an optional library from a CDN during import.
- Browser storage may be cleared, evicted, or run out of space.
- Background playback, media-session controls, wake lock, installation prompts and audio effects vary by browser and OS.
- Lyrics may be missing or unsynchronized and online providers can be unavailable.
- AI Song Identification is marked as coming soon in this release.
- The supplied source archive references PWA icons at `icons/icon-192.png` and `icons/icon-512.png`, but those files were not included in the archive.

## License

Mujic's source code is distributed under the [MIT License](LICENSE). Third-party services, libraries, audio, artwork, and lyrics may be subject to separate rights and terms. The documentation's Terms & Conditions and Privacy Policy are provided in the [online feature guide](https://royverse69.github.io/mujic/FEATURES.html).
