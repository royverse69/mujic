# Mujic v13.2.5

## Mini-player and artwork polish

- Hid desktop-only volume and Picture-in-Picture tools on mobile mini-player layouts.
- Positioned desktop volume and PiP controls in a fixed right-side horizontal rail; play/pause remains centered and next is placed to its right.
- Increased the mini-player album art footprint and preserved the user-selected corner treatment.
- Added low-amplitude, delayed track-art swipe transitions on touch devices. The track changes after the outgoing art movement; the next image enters with a short settle.
- Added a slow, heavily blurred album-art ambience to the full-screen player on devices that support motion, while keeping the cover image itself crisp and distinct. Reduced-motion and low-end modes disable these animations.

## Search category artwork

- Applied the supplied 640×320 Apple CDN artwork URLs to the matching Search category cards.
- Reordered the first category cards to match the reference screenshot and added the currently missing Malayalam, Metal, Kannada, Sleep, Focus, Dance, K-Pop, Pride and Party categories while preserving all existing categories.
- Changed lazy category image dimensions to the actual 2:1 source ratio. The images remain lazy-loaded and use the remote CDN URLs; they are not bundled into the ZIP.

## Validation

- `npm run check` includes the previous project checks plus new v13.2.5 regression checks for responsive control visibility/placement, animation safeguards, and the artwork catalogue.
- Actual live CDN availability and device rendering still need verification in the deployed browser.
