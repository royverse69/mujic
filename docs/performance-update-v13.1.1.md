# Mujic v13.1.1 — Performance and UX update

## Changes

- Deferred the streaming workspace CSS and supporting streaming scripts until the user enters online mode. The module loader and core offline experience remain in the app shell; heavy streaming assets are no longer in the service-worker startup precache.
- Changed artwork candidate selection to choose the smallest known image size that covers its display target. Online song metadata now carries small, medium, and large artwork URLs; cards use medium artwork and the full player upgrades to large artwork only when opened.
- Subsetted the Material Symbols webfont to the icons used by the UI and set font display behavior to avoid a flash of ligature names.
- Kept prior search rows in place, dimmed them during refresh, added clearer offline/service failure messaging, and enabled IntersectionObserver-based automatic loading for additional search batches.
- Showed track metadata in the mini-player immediately, added buffering feedback and an “Up next” hint, and cleared the spinner on failed playback.
- Added intrinsic image dimensions where applicable, allowed any manifest orientation, added settings search, expanded focus and coarse-pointer target styling, and made Google Analytics explicitly opt-in (off by default).
- Bumped the service-worker cache name to v13.1.1 so clients don't reuse the previous shell cache.

## Validation

`npm run check` passes, including the legacy regression checks and the performance-specific checks. These are automated static/runtime-mock checks; they are not a substitute for testing playback and layout on real low-end mobile hardware.

## Scope notes

- Long rows use browser `content-visibility` and intrinsic sizing to reduce off-screen layout/paint work. This is not full JavaScript DOM-windowing/virtualization.
- The repository has no installed JavaScript minifier/bundler, and no network package installation was available during this edit. Scripts were not hand-minified or concatenated because doing so without a parser/build tool risks breaking the app's ordered global-script dependencies. The heaviest streaming workspace is now loaded only on demand, but a verified minification/bundling build is still a separate follow-up.
