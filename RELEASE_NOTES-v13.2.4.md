# Mujic v13.2.4

## Fixes

- Center the desktop mini-player play/pause button exactly on the mini-player, with next-track placed to its right. The desktop volume and Picture-in-Picture controls remain aligned on the right side.
- Detect installed desktop PWAs across standalone, window-controls-overlay, minimal-ui, and fullscreen display modes, and refresh the install banner after mode/focus changes.
- Prefer timestamped lyrics from all known catalogue fields, including nested `more_info.syncedLyrics`, before using plain lyrics as a fallback.
- Remove obsolete unused test/audio/QR artifacts and superseded release-note files from the distributable.

## Validation

`npm run check` passes, including a runtime regression test that exercises a catalogue response containing plain lyrics and nested timestamped lyrics. Desktop installed display-mode behavior still depends on browser support and should be verified in the target install environment.
