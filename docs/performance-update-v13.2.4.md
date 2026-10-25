# v13.2.4 implementation notes

The desktop mini-player uses a zero-width positioning anchor at the horizontal center so the play/pause button itself—rather than the pair of playback controls—is centered. Next track is offset to its right; volume and Picture-in-Picture controls remain in a separate right-aligned group.

Lyrics parsing now recognizes nested timestamped catalogue fields before choosing any plain-text candidate. The v13.2.4 regression check evaluates `OnlineLyrics.fetchFromMusicSource` with a mocked catalogue track and asserts that `more_info.syncedLyrics` wins over plain `lyrics`.

Installed-state detection checks supported installed display modes, including `window-controls-overlay`, and refreshes after `appinstalled`, focus, visibility, and display-mode changes.

Only app artifacts not referenced by the runtime were removed in this cleanup. Historical regression scripts are retained because they are part of the project validation suite.
