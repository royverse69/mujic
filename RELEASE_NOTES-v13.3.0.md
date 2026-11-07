# Mujic v13.3.0

- **Smarter suggestions** – autoplay and queue top-ups now build a taste profile (favourites, recent plays, favourite artists), score candidates on shared artists, language, genre, era, session continuity and duration, penalise remix/slowed variants, and re-rank for artist/album diversity. Candidate pools are cached per seed track for 3 minutes.
- **Compact Picture-in-Picture** – the Document PiP window opens at 320×320 (was 480×480).
- **Concentric corners** – nested artwork radii are derived from their container (`inner = outer − inset`) and the mini-player uses equal insets on every side, at every corner-radius setting.
- **Swipe mini-player down to stop (opt-in)** – Settings → Playback. Small screens only; pauses, resets to 0:00 and hides the mini-player. Off by default.
- **Scrolling tab title (desktop)** – "Title — Artist" scrolls slowly through the browser tab title while playing and follows the current track.
- **Faster metadata cache** – `OnlineCache` keeps an in-memory index, evicts least-recently-used entries and writes localStorage in batches.
