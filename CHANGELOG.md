# Changelog

## 13.6.1

**Fixes**
- Restored a `position: relative` rule (touch devices) and four corner-radius rules that were deleted by mistake in 13.6.0. Without them, tap-feedback layers covered the whole screen and blocked taps and swipes on nav items, icon buttons, album rows and artwork.
- Mini-player volume slider fill now follows the drag.
- Mini-player seek bar is touchable on phones (20 px invisible hit area).
- UI no longer sticks on "playing" when the next track fails to load.
- `npm run check` now guards against both regressions above.

## 13.6.0

**Stability**
- Replaced the 12.6 MB, 268-frame animated logo (decoded three times on phones — the main out-of-memory crash) with a 0.95 MB crop; static version for reduced-motion, low-end mode and footers.
- Service worker: app code is now network-first (no more new `index.html` running stale scripts); removed the 12 MB file from the precache; precache list now covers every module.
- Settings are written to IndexedDB in coalesced batches and flushed when the page is hidden.
- Queue panel and progress bar only touch the DOM when visible; progress uses compositor-only transforms.

**Playback reliability**
- Track changes no longer pause the audio element, so the OS media session never flips to "paused" between songs (lock-screen / notification controls keep working).
- `play()` is called inside the user gesture; the Web Audio context resumes in parallel instead of blocking playback (fixes iOS hangs).
- Streams that stall for 9 s are reloaded once at the same position; AudioContext is resumed whenever the OS suspends it.

**Mini-player**
- Rebuilt: one grid layout, real buttons, 44 px targets, no overlapping controls (previous-track was unreachable on large screens). Works with mouse, touch and pen.
- Added a **Queue** button (mini-player and the full player's lyrics-mode controls), a clickable seek bar with times, and an inline volume slider on desktop.

**Picture-in-Picture**
- New `pip.js`. *Clean* mode shows no address bar; *Full* mode has working queue, lyrics, volume, shuffle, repeat and favourite inside the PiP window.

**SEO / deploy**
- Title, description, canonical, Open Graph, Twitter card, JSON-LD, social image, `sitemap.xml`, `robots.txt`, `404.html`, richer manifest (maskable icon, shortcuts).

**Removed**
- 56 version-specific check scripts, 14 release-note files, `test.html`, `music.mp3`, `backend/` (obsolete Render proxy), `js/backend.js`, `css/redesign.css`, `changlog.json`, ~200 duplicated mini-player CSS rules, and ~400 lines of old PiP/pointer-event patches.
