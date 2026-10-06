# Mujic

A music player that lives entirely in your browser. You add audio files from your own device, Mujic stores them locally, and everything after that (library, playlists, lyrics, equalizer, stats) works without an account or a server.

**Live app:** https://royverse69.github.io/mujic/
**Version:** 1.3.0
**Author:** Ashutosh Roy (machhar)

<!-- Add screenshots here, e.g. docs/home.png, docs/player.png, docs/lyrics.png -->

---

## Contents

1. [What Mujic is](#what-mujic-is)
2. [Getting started](#getting-started)
3. [Adding music](#adding-music)
4. [Using the app](#using-the-app)
5. [The player](#the-player)
6. [Lyrics](#lyrics)
7. [Listening stats](#listening-stats)
8. [Settings reference](#settings-reference)
9. [Data, storage and privacy](#data-storage-and-privacy)
10. [Browser support and known limits](#browser-support-and-known-limits)
11. [How it is built](#how-it-is-built)
12. [Running and deploying it yourself](#running-and-deploying-it-yourself)
13. [Contributing](#contributing)
14. [Credits](#credits)
15. [License](#license)

---

## What Mujic is

Mujic is a single-page web app written in plain HTML, CSS and JavaScript. There is no framework, no bundler and no build step. Your music never uploads anywhere. Audio files are copied into your browser's own database (IndexedDB) when you import them, and playback streams from there.

It is designed to be installed like an app. On a phone it behaves like a native player, with lock-screen controls, background playback where the browser allows it, and a bottom navigation bar. On a desktop it switches to a sidebar layout with a two-column Now Playing screen.

What you get:

- A local library with Songs, Albums, Artists and Playlists
- Search across your whole library
- A full player with queue, shuffle, repeat, sleep timer and speed control
- A 5-band equalizer with presets
- Four audio visualizers
- Time-synced lyrics (fetched when online, cached afterwards)
- Listening stats by day, week and month
- Light and dark themes, accent colours taken from album art, and several layout options
- Installable as a PWA

---

## Getting started

### Use it in the browser

Open https://royverse69.github.io/mujic/ and tap **Add Music**. That is all the setup there is.

### Install it as an app

| Platform | How |
|---|---|
| Android (Chrome, Edge) | Settings → App → **Install**, or use the browser menu → Install app |
| Desktop (Chrome, Edge) | Settings → App → **Install**, or the install icon in the address bar |
| iPhone / iPad (Safari) | Tap Share → **Add to Home Screen**, then open Mujic from the Home Screen |

The Install button in Settings uses the browser's install prompt when one is available. On iOS no such prompt exists, so the app shows the Share-sheet instructions instead.

### Open it once online

The first load fetches fonts and two metadata libraries from CDNs. Open the app while online at least once so the service worker can cache what it needs.

---

## Adding music

Use the **Add Music** button on the empty Home screen, or the **+** button next to *Continue listening* on Home. Both open your device's file picker, and you can select many files at once.

**Accepted extensions:** `mp3`, `m4a`, `aac`, `flac`, `wav`, `ogg`, `oga`, `opus`, `webm`, `aiff`, `aif`, `alac`.

Mujic accepts any of those, but whether a file actually *plays* depends on your browser's audio decoder. MP3, AAC/M4A, WAV, and Ogg/Opus are safe almost everywhere. FLAC works in current versions of the major browsers. ALAC and AIFF are mostly a Safari thing. If a format can't be decoded you will see a toast saying so, and the file stays in your library.

### What happens during import

For each file, in order:

1. **Type check.** Files that are not audio (by MIME type or extension) are skipped.
2. **Duplicate check.** If a track with the same file name and file size already exists, Mujic does not add a second entry. It just refreshes the stored audio for the existing one.
3. **Tag reading.** Mujic reads the embedded tags with `music-metadata-browser`. If that fails it falls back to `jsmediatags`. Fields read: title, artist, album, album artist, genre, year, track number, disc number, composer, embedded lyrics, and the cover image.
4. **Filename fallback.** If there is no title tag, the file name is used. A name shaped like `Artist - Title.mp3` is split into artist and title.
5. **Online fill-in.** If there is a title but the artist or cover is missing, and you are online, Mujic asks lrclib.net for a match and uses it to fill in a missing artist and album. This is a best-effort guess, so check the result on obscure tracks.
6. **Storage.** The track record, the audio file and the cover image are written to IndexedDB. Anything still unknown is shown as *Unknown Title*, *Unknown Artist* or *Unknown Album*.

When the batch finishes you get a toast with the number of tracks added. Importing is per-file, so a single broken file does not stop the rest.

Folder import is not supported. The picker works on files only.

### Removing music

Open the three-dot menu on any track and choose **Remove from Library**. This deletes the audio, removes the track from favourites, history, queue and every playlist, and asks for confirmation first. To remove everything, see **Clear Library** under [Settings](#settings-reference).

---

## Using the app

The app has four main screens, reachable from the bottom bar on mobile or the sidebar on desktop.

### Home

Home is built from your own data and only shows sections that have something in them.

- **Greeting.** Morning, afternoon or evening based on your local time. It fades away after about 25 seconds.
- **Your Playlists.** A rail that starts with **Liked Songs** (every track you have favourited), followed by your playlists. Playlist covers come from the most recently added track in the playlist.
- **Recently played.** The last 10 distinct tracks you played. Mujic remembers up to 100 in total.
- **Favorite Artists.** Appears once you have favourited at least one artist.
- **Your Listening.** Today, this week and this month at a glance. See [Listening stats](#listening-stats).
- **Continue listening.** Your 10 most recently added tracks, with a **+** button to import more.

### Library

Four tabs:

- **Songs.** Every track, with the total count and a **Shuffle All** button. Sorted according to your Library settings (recently added, title, artist or album; ascending or descending).
- **Albums.** A grid. Tracks are grouped by *album artist* (falling back to artist) plus album name, so two different albums with the same title by different artists stay separate.
- **Artists.** One row per artist, grouped by album artist when the tag exists.
- **Playlists.** Create, rename, delete and reorder playlists.

### Detail pages

Opening an album, artist, playlist or Liked Songs shows a header with the cover, a **Play** button and a **Shuffle** button.

- Album tracks are ordered by disc number, then track number.
- Artist pages have a heart next to the name. Tapping it adds or removes that artist from *Favorite Artists* on Home.
- Playlist pages add per-track controls: move up, move down, and remove from this playlist.

Whichever list you press play in becomes the queue. Tapping a track inside an album plays that album from that track. Tapping a track in Search plays the search results from that track.

### Search

Type in the search box and results appear after a short pause (300 ms). The query is matched against title, artist, album, album artist, composer, genre, year and file name. Results are grouped into **Artists**, **Albums**, **Playlists** and **Songs**. With an empty search box, you see your recently played tracks instead.

Search only covers your local library. It does not look anything up online.

### Navigation and the back button

Each main screen has its own address (`#home`, `#library`, `#search`, `#settings`). The full player and every bottom sheet are history entries too, so the browser back button or the Android back gesture closes the player or the sheet first instead of leaving the app.

---

## The player

Tap the mini player to open the full Now Playing screen. Swipe down anywhere that is not the scrubber or the lyrics, or tap the chevron, to minimise it.

### Controls

| Control | What it does |
|---|---|
| Play / pause | Toggles playback |
| Previous | If more than 3 seconds have played, restarts the track. Otherwise goes to the previous track |
| Next | Skips to the next track |
| Scrubber | Tap or drag to seek |
| Shuffle | Randomises the queue. The current track stays first and the rest are shuffled. Turning it off restores the original order and keeps your place |
| Repeat | Cycles **Off → All → One** |
| Favourite | Heart button. Adds or removes the track from Liked Songs |
| Lyrics | Switches the artwork view to lyrics |
| Mute | Mutes or unmutes |
| More (⋯) | Opens the options sheet described below |

**Repeat behaviour:** with repeat off, playback stops on the last track and rewinds it. With repeat all, the queue wraps in both directions. With repeat one, the current track loops.

### The queue

Open it from the queue icon in the player header. The sheet is titled **Up Next**.

- Drag the handle to reorder, or use the up and down arrows (the arrows are what most phones will use).
- The **×** removes a track. The currently playing track cannot be removed.
- **Clear** empties the queue but keeps the current track playing.
- Tapping a row jumps straight to that track.

### Track menu

The three-dot button on any track row offers:

- **Play**
- **Play Next**, which inserts the track right after the current one
- **Add to Queue**, which puts it at the end
- **Favorite** or **Remove Favorite**
- **Add to Playlist**, including a **New Playlist** option that creates one and adds the track in one step
- **Remove from Library**

If nothing is playing, *Play Next* and *Add to Queue* simply start playing the track.

### The More menu

**Sleep Timer.** Off, 5, 15, 30 or 60 minutes, or **End of song**. A countdown shows inside the sheet while a timer is running. When it ends, playback pauses and the timer resets.

**Playback Speed.** 0.75x, 1x, 1.25x, 1.5x or 2x.

**Equalizer.** Five vertical sliders, ±12 dB each, in 1 dB steps.

| Band | Frequency | Filter type |
|---|---|---|
| 1 | 60 Hz | Low shelf |
| 2 | 230 Hz | Peaking |
| 3 | 910 Hz | Peaking |
| 4 | 3.6 kHz | Peaking |
| 5 | 14 kHz | High shelf |

The presets set the five bands (in dB, low to high) as follows:

| Preset | 60 Hz | 230 Hz | 910 Hz | 3.6 kHz | 14 kHz |
|---|---|---|---|---|---|
| Flat | 0 | 0 | 0 | 0 | 0 |
| Bass Boost | +6 | +2 | 0 | 0 | −1 |
| Vocal | −2 | +2 | +4 | +3 | −1 |
| Rock | +4 | +2 | −1 | +2 | +4 |
| Treble | −2 | −1 | 0 | +3 | +6 |

Dragging any slider switches the label to **Custom**. Your settings are saved and re-applied next time.

**Audio Output.** On browsers that support output selection, each tap switches to the next available audio output device. On browsers that do not (Safari and Firefox, at the time of writing), Mujic tells you it is unsupported.

**Volume.** A slider in a sheet. On iOS this item is hidden because iOS keeps volume under hardware control, so use the volume buttons.

**Visualizer.** Draws on a canvas behind the player while music is playing.

- *Spectrum Bars*: 64 frequency bars along the bottom
- *Waveform*: a live oscilloscope line
- *Mirror*: the spectrum bars reflected top and bottom
- *Aurora Glow*: a pulsing glow with expanding rings that react to the overall level

The visualizer uses your accent colour.

**Immersive Lyrics.** See below.

### Lock screen and media keys

Mujic registers with the system media controls. Play, pause, previous, next, seek forward and back, and seek-to-position are all wired up, and the lock screen shows the track title, artist, album and cover.

### Resume playback

If **Resume Playback** is on in Settings, Mujic remembers your queue, the current track and the position (saved every few seconds, on pause, and when the page is hidden). After you reopen the app the track is loaded and waiting at the saved position. Press play to continue. It does not auto-start, because browsers block audio that starts without a user gesture.

---

## Lyrics

Tap the notes icon in the player to switch from artwork to lyrics.

**Where lyrics come from, in order:**

1. The local lyrics cache (IndexedDB), if the track was fetched before
2. [lrclib.net](https://lrclib.net), looked up with the track's title, artist, album and duration. If the exact lookup returns nothing, Mujic tries a text search
3. Lyrics embedded in the audio file's tags, if the network lookup failed or you are offline

Time-synced lyrics are preferred when available. Plain lyrics are shown as a scrolling block of text. Anything found online is cached so it works offline next time. If nothing can be found, a short message appears and the lyrics view closes itself after a moment.

**Synced lyrics** highlight the current line and scroll with the song. Tap any line to jump to that point in the track.

**Styles** (Settings → Appearance → Lyrics Style):

- **Apple Music**: inactive lines are dimmed and blurred, the current line is sharp and slightly larger
- **Spotify**: a flat fade, with the current line at full brightness
- **Neon Highlight**: the current line sits in a bold accent-coloured block

**Immersive Lyrics** hides the controls and fills the screen with lyrics. On desktop there is a button in the top-right corner while lyrics are open. On mobile, open More (⋯) and choose Immersive Lyrics. Use the same button or menu item again to exit.

---

## Listening stats

Mujic keeps a private listening log in your browser. It never leaves your device.

- A **play** is counted when a track actually starts playing, not when you merely queue it.
- **Listening time** is measured from the audio clock, only while playing. Seeking or scrubbing does not add time, because jumps larger than a few seconds are ignored.
- Data is stored per day, per track, and the most recent 400 days are kept.
- Home shows **Today**, **This week** (last 7 days) and **This month** (calendar month), plus your top track of the month and a top-3 list.
- The all-time total of plays and minutes appears next to the section title. The Settings screen also shows the monthly figure.
- Stats are saved to storage on a short delay to avoid writing on every tick. Clearing the library clears the stats too.

---

## Settings reference

### Appearance

| Setting | Options |
|---|---|
| Theme | System Default, Dark Mode, Light Mode |
| Accent Color | Dynamic (from artwork), White/Black, Blue, Purple, Pink, Red, Orange, Green, Cyan, or a Custom hex colour |
| Lyrics Style | Apple Music, Spotify, Neon Highlight |
| Interface Style | Liquid Glass (Subtle), Liquid Glass (Strong), Solid / Off |
| Corner Radius | Sharp, Medium, Rounded, Extra Rounded |
| Motion | Full Motion, Reduced Motion |
| Restore default appearance | Resets all of the above |

Notes on **Dynamic** accent: Mujic samples the average colour of the current cover and brightens it if it is too dark to read. This applies while Player Background is set to Artwork Blur. With other backgrounds the accent falls back to the default.

**Solid / Off** replaces the translucent blur effects with plain surfaces. Choose it if the app feels heavy on an older phone. **Reduced Motion** turns off transitions and animations.

### Player

| Setting | Options |
|---|---|
| Player Background | Artwork Blur, Solid Muted, Deep Black |
| Player Artwork | Full Cover (fills the frame), Fit Inside (shows the whole image without cropping) |

### Playback

| Setting | Notes |
|---|---|
| Resume Playback | Remembers the last track, queue and position |

### Library

| Setting | Options |
|---|---|
| Sort Library By | Recently Added, Title, Artist, Album |
| Sort Direction | Descending, Ascending |
| Show Artwork List Icons | Toggles thumbnails in track lists |

### Listening Stats, App and Storage

- **Monthly listening** shows this month's plays and minutes.
- **Install Mujic** is described in [Getting started](#getting-started).
- **Library Size** shows how many tracks you have and how much storage the audio and artwork use.
- **Clear Library** removes all audio, artwork, playlists, favourites, history, settings and stats. A confirmation dialog appears first and the action cannot be undone.

---

## Data, storage and privacy

**What is stored, and where.** Everything lives in a single IndexedDB database named `MujicDB`, inside your browser profile:

| Store | Contents |
|---|---|
| `tracks` | Track metadata |
| `audioBlobs` | The audio files you imported |
| `artworks` | Cover images |
| `playlists` | Your playlists |
| `settings` | Favourites, queue, history, preferences, EQ, stats |
| `lyricsCache` | Lyrics fetched from lrclib |

There are no cookies, no accounts and no analytics. The app is served as static files and has no backend.

**What leaves your device.** Only these requests are made:

- **lrclib.net**: the track title, artist, album and duration, to look up lyrics and to fill in a missing artist or album at import. No audio, file name or personal data is sent.
- **Google Fonts**: for the Inter and Material Symbols fonts.
- **cdnjs and jsDelivr**: to load `jsmediatags` and `music-metadata-browser`.

If you want zero third-party requests, self-host those assets (see [Running and deploying it yourself](#running-and-deploying-it-yourself)).

**Storage limits.** Browsers cap how much a site can store and may evict data when a device runs low on space. Keep your original files elsewhere. Mujic keeps its own copy for playback, and it is not a backup.

---

## Browser support and known limits

- **Best experience:** current Chrome, Edge and Safari on desktop and mobile. Firefox works but has no audio-output selection.
- **Codecs** depend on the browser, as described under [Adding music](#adding-music).
- **iOS:** volume is controlled by the hardware buttons, so the in-app volume control is hidden. Background playback and lock-screen behaviour are decided by Safari and can vary between iOS versions.
- **Audio Output switching** needs `setSinkId`, which is currently Chromium-only.
- **Large libraries:** track lists are rendered in full, without virtualisation. A few thousand tracks is fine. Much beyond that, lists will feel heavier.
- **Offline use** needs one prior online visit so fonts and scripts are cached. Imported music and cached lyrics work offline.
- **Zoom:** the viewport is locked to fixed scale for an app-like feel.

---

## How it is built

Mujic is one `index.html` that contains the markup, styles and script, plus the PWA files it references:

```
mujic/
├── index.html               app markup, CSS and JavaScript
├── manifest.webmanifest     PWA manifest
├── sw.js                    service worker
└── icons/
    └── icon-192.png         home-screen icon
```

The script is organised as a set of plain objects, each with one job:

| Module | Responsibility |
|---|---|
| `Utils` | Time and size formatting, IDs, HTML escaping, generated placeholder covers |
| `State` | The single source of truth for library, queue, settings and UI state |
| `StorageAdapter` | All IndexedDB reads and writes |
| `ArtworkCache` | Turns stored cover blobs into object URLs, computes average colour |
| `LyricsFetcher` | lrclib requests, LRC parsing, caching |
| `Stats` | Daily play and listening-time accounting |
| `Dialog` | Prompt and confirm dialogs |
| `AudioAdapter` | The audio element, Web Audio graph, EQ, visualizer, Media Session |
| `Player` | Queue, shuffle, repeat, sleep timer, favourites |
| `Library` | Importing, tag parsing, sorting, removing tracks |
| `Playlists` | Playlist create, rename, delete, reorder |
| `UI` | Rendering, navigation, sheets, gestures, event delegation |
| `App` | Start-up sequence |

**Audio path.** An imported file is read back from IndexedDB as a Blob, turned into an object URL and handed to an `<audio>` element. That element feeds a Web Audio graph: `source → five EQ filters → analyser → output`. The analyser drives the visualizer.

**Queue model.** `State.queue` holds the original order. `State.playbackOrder` holds the order actually being played (shuffled or not), and `State.queueIndex` points into it. This is why turning shuffle off can put you back in the right place in the original order.

**Events.** The page uses one delegated click handler. Elements carry a `data-action` attribute, and the handler dispatches on it. To add a button, give it a `data-action` and add a branch in `UI.setupGlobalDelegation`.

**Race protection.** Track changes and cover loading each carry a request counter, so a slow load from a skipped track cannot overwrite the one you are on now.

---

## Running and deploying it yourself

Because Mujic is a static site, any static host works.

### Run locally

```bash
git clone https://github.com/royverse69/mujic.git
cd mujic
python3 -m http.server 8000
```

Open http://localhost:8000. Use a local server rather than opening the file directly: service workers and IndexedDB behave properly only on `http://localhost` or `https://`.

### Deploy on GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select your main branch and the root folder.
4. Save. The site appears at `https://<your-username>.github.io/<repo-name>/`.

The app uses relative paths (`./sw.js`, `./manifest.webmanifest`), so it works from a sub-path like this without changes.

### Self-hosting the third-party assets

To remove the CDN dependencies, download `jsmediatags`, `music-metadata-browser`, the Inter font and the Material Symbols Rounded font into the repository, and update the `<script>` and `<link>` tags near the top of `index.html`. Add the new files to the service worker's cache list so they work offline.

---

## Contributing

Bug reports and pull requests are welcome.

- **Reporting a bug.** Open an issue and include your browser and version, your device, the audio format involved, and the steps to reproduce it. A console error, if there is one, helps a lot.
- **Suggesting a feature.** Open an issue first so we can talk about it before you build it.
- **Code changes.** Keep the project dependency-free and build-free. Match the existing style, use `data-action` delegation for new buttons, and escape any user-provided text with `Utils.escapeHTML` before putting it in markup. Test on a real phone as well as a desktop browser, since touch and audio behaviour differ.

---

## Credits

- [lrclib.net](https://lrclib.net) for synced and plain lyrics
- [jsmediatags](https://github.com/aadsm/jsmediatags) and [music-metadata-browser](https://github.com/Borewit/music-metadata-browser) for reading audio tags
- [Inter](https://rsms.me/inter/) typeface
- [Material Symbols](https://fonts.google.com/icons) icon font

---

## License

See the `LICENSE` file in this repository.

---

## Author

Made by **Ashutosh Roy** (machhar). GitHub: [@royverse69](https://github.com/royverse69)
