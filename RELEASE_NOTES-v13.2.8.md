# Mujic v13.2.8 — UI, PiP, downloads and native-feel pass

## Fixed
- **Full-screen backdrop**: the blur layer lost its oversizing on phones (hard transparent edge) and low-end mode dropped the
  cover for a generic gradient. The cover is now downsampled to a 48px canvas and upscaled by the browser (smooth, no heavy
  GPU blur), so the backdrop matches the song on every device. Track changes cross-fade. Large artwork no longer overwrites it.
- **Cover missing in Picture-in-Picture**: canvas PiP drew a cross-origin `<img>`, tainting the canvas. Both PiP modes now use
  `window.MujicPiPArt`, a CORS-safe same-origin blob copy of the cover.
- **Cover missing in downloaded songs**: the 112px thumbnail was embedded and non-JPEG/PNG covers were silently dropped. Now
  large → medium → small, WebP/other formats converted to JPEG, 12s timeout, honest toast. Same fix in `dloader.html`.
- **Light theme**: glass surfaces were hard-coded dark (unreadable sidebar/mini player/sheets). They now follow the theme.
- **Text clipping**: artist marquee fades instead of cutting a letter; desktop title wraps to two lines; mini-player lines ellipsize.
- **Titles**: `Pritam' s` → `Pritam's` (stray space after apostrophe in catalogue data).
- **Silent audio**: once routed through Web Audio the element keeps its CORS attribute.
- **Memory**: artwork blob-URL cache capped at 400 with delayed revoke; colour cache bounded.

## Native feel / accessibility (new `css/native-ux.css`, `js/native-ux.js`)
- ≥44px touch targets via invisible hit areas (no layout shift); `touch-action`, overscroll containment, no tap highlight,
  no long-press callout on controls, safe-area + `100dvh`, standalone-mode gesture hygiene, light haptic ticks (Android).
- Mini player is a labelled group with a keyboard-focusable "open player" region; big play button is a real `<button>`;
  every `data-action` div/span becomes a keyboard/screen-reader button (Enter/Space); visible `:focus-visible` rings.
- Resumes a suspended AudioContext when returning to the app; saves position on `pagehide` (iOS).

## Behaviour change
- Dynamic accent colour (the default preset) now also works for streamed songs.

## Tests
- Added `scripts/check-v13.2.8.js` (wired into `npm run check`). Two older checks that pinned the exact PiP lines, and three
  that pinned version 13.2.7, were updated. 14 checks that failed before this release still fail (unchanged, unrelated).
