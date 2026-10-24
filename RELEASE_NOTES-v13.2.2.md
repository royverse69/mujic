# Mujic v13.2.2 — Scroll dock, artwork stability and on-demand modules

## Changes

- **Mobile navigation dock:** scrolling deeper into long views slides the bottom navigation out of the way; reversing scroll direction restores it. The mini-player remains visible, moves closer to the bottom edge while navigation is hidden, and repositions when the dock returns. The behavior is limited to the bottom-nav mobile layout and resets on view changes / when returning to the top.
- **Navigation corner style:** the active nav surface follows the existing Corner Radius setting (sharp, medium, rounded or extra) instead of always looking square.
- **Picture-in-picture artwork:** Document PiP shows the active cover as a foreground poster plus a soft blurred backdrop; native video PiP draws the same artwork treatment into its canvas.
- **Lazy-image stability:** lazy image templates now declare width and height so their slots reserve space before the art loads. Image-bearing shelves no longer use `content-visibility:auto`, which could cause the artwork to disappear or flash black during scroll-away / scroll-back.
- **Startup requests:** lyric-share UI is loaded when the sharing feature is opened or enabled instead of being executed as a startup script. The unused QR generator is no longer part of the app-shell startup path. The share module remains available in the versioned service-worker cache for offline use after install.
- **Motion polish:** a compact mobile view transition morphs between slightly rounded and square clipping, with no expensive animation layers on low-end devices and full respect for reduced-motion preferences.

## Validation

- `npm run check` passes, including the new v13.2.2 regression test.
- The added regression check inspects every HTML/JavaScript lazy-image template for explicit width and height, checks scroll direction and mini-player persistence, checks both PiP artwork layers, verifies optional modules stay off the startup path, and confirms corner-radius variants and motion safeguards.
- A reliable browser screenshot could not be captured in this environment; physical-device checks are still recommended for mobile scroll feel and native operating-system PiP compositing.
