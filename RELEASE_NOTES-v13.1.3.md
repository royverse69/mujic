# Mujic v13.1.3 — Offline UI restoration

## Fixed

- Restored the mode switch's intended track/thumb styling in the startup stylesheet. The switch no longer renders as a default gray button when the streaming stylesheet has not been loaded.
- Restored the intended large, subtle Mujic wordmark in the shared home footer while preserving lazy loading of `online-workspace.css`.
- Kept the online-only back-to-top button hidden in offline mode so it cannot render as an unstyled stray control.
- Added a regression test checking that shared toggle/footer styling is available in `app.css`, the offline back-to-top control is hidden, the service-worker cache version is updated, and the icon-font subset includes every statically referenced icon detected in markup and icon definitions.

## Performance and scope

The streaming stylesheet and streaming modules remain lazy-loaded. The fix moves only the small set of styles needed by shared home UI into `app.css`; it does not restore the full streaming stylesheet to startup.

## Validation

`npm run check` passes, including the historical regression suite and the v13.1.3 checks. A headless visual screenshot was attempted but timed out in the environment, so the fix was validated through CSS/source regression tests rather than a completed browser screenshot.
