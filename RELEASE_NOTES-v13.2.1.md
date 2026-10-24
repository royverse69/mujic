# Mujic v13.2.1 — Scroll-aware navigation and media polish

## Changes

- Fixed mobile scroll direction behavior. Scrolling deeper into a page (content moves upward) slides the bottom navigation completely down and out of the way; reversing the scroll restores it. The now-playing mini-player stays visible and moves closer to the screen edge while navigation is collapsed.
- The navigation collapse uses inert/aria-hidden while tucked away, respects reduced-motion settings, resets at the top of the page, and never collapses the desktop sidebar.
- The active navigation highlight now follows the existing Corner Radius setting: sharp, medium, rounded, or extra-round.
- Added album artwork as both a foreground cover and a softly blurred, darkened background in the custom Document PiP UI. Native video PiP now draws the cover as its background as well.
- Added explicit width/height attributes to lazy-loaded history, category, playlist, artist-wall and radio artwork.
- Disabled content-visibility paint suppression for artist/radio shelves and image-bearing entity cards to reduce black flashes when scrolling away and back.
- The optional lyric-share renderer is no longer an executable startup script. It is loaded and initialized when the sharing action is used or the user opts into lyric sharing; its source remains available in the versioned service-worker cache for offline use after installation.
- Removed the unused QR generator from the initial script path and service-worker app-shell list. The file remains in the repository but is not requested by the current app.
- Added a lightweight mobile view morph transition; low-end and reduced-motion settings retain a simpler transition.

## Validation

The complete `npm run check` suite passes, including the new v13.2.1 regression checks and existing lyrics-share/PiP tests. Native browser PiP rendering and scroll feel should still be verified on the target device, because headless checks cannot fully represent operating-system PiP windows and GPU compositing.
