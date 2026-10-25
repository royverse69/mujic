# Mujic v13.2.0 — Visual redesign

## Design
- Added a cohesive Apple Music-inspired visual language with a persistent desktop sidebar, compact mobile tab bar, refined album artwork rails, improved list rows, and higher-contrast focus/interaction states.
- Redesigned the full-screen player and mini-player around larger square cover artwork, more readable metadata, smoother progress controls, and consistent dark/light surfaces.
- Updated settings surfaces, navigation active states, responsive spacing, and safe-area handling for installed PWAs.

## Player and PiP
- Upgraded Document Picture-in-Picture sizing, artwork, status treatment, seek slider, controls, and interaction states.
- PiP is now exposed on any supported browser/device instead of being hard-disabled on mobile; unsupported devices keep the control hidden, and failures show a support-aware message.
- Improved the native-video PiP poster canvas with a live progress indicator and per-second progress repainting while keeping playback controls connected to the existing audio player.

## Performance and compatibility
- Removed the non-essential remotely hosted Inter font request and use the platform system font stack for faster startup. Material Symbols remain loaded as before.
- Added the redesign stylesheet to the service-worker app shell and advanced the shell cache version so installed PWAs receive the new UI.
- Playback, library storage, the Cloudflare Worker, search, lyrics, and online streaming modules were not replaced.

## Validation
- Run `npm run check` for syntax and regression checks.
